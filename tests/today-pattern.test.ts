import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeActivityHourSamples,
  encodeActivityHourSamples,
} from "@/utils/activity-hour-samples";
import {
  assembleMonthlyActivityPattern,
  buildPatternDayCellFromSamples,
  buildMonthlyActivityPattern,
  buildMonthlyActivityPatternAsync,
  buildPatternDayCellsAsync,
  buildUnifiedTimelineAsync,
  getMonthlyPatternGrid,
  rescoreTimeline,
} from "@/utils/unified-timeline";
import {
  buildActivityScoreMaxima,
  mergeActivityScoreMaxima,
} from "@/utils/activity-intensity";
import { parseISODate, shiftISODate } from "@/utils/dates";
import {
  resolvedTimelineEvents,
  resolvedTimelineEventsWork,
  selectResolvedStepEvents,
} from "@/utils/source-resolution";
import { sleepTimelineEvents } from "@/utils/sleep-timeline";
import type { ZentraEventRecord } from "@/types/zentra";

const anchor = "2026-10-01";

function syntheticEvents(days: number, perDay: number): ZentraEventRecord[] {
  const events: ZentraEventRecord[] = [];
  const end = parseISODate(shiftISODate(anchor, 1)).getTime();
  for (let day = days; day > 0; day--) {
    const dayStart = end - day * 86_400_000;
    for (let i = 0; i < perDay; i++) {
      const start = dayStart + Math.floor((i / perDay) * 86_400_000);
      const kind = i % 4;
      events.push({
        id: `e-${day}-${i}`,
        timestampStart: new Date(start).toISOString(),
        timestampEnd: new Date(
          start + (kind === 2 ? 120_000 : 0),
        ).toISOString(),
        dataType: (["steps", "activity", "app_usage", "unlock_event"] as const)[
          kind
        ],
        source: kind === 0 ? "health_connect" : "sensor",
        valueNumeric: kind === 0 ? (i % 7) * 40 : 60,
        valueText: kind === 1 ? (i % 3 ? "walking" : "still") : undefined,
        unit: "count",
        confidence: 1,
        metadata: {},
        schemaVersion: 1,
        createdAt: new Date(start).toISOString(),
      });
    }
  }
  const lateStart = parseISODate(anchor).getTime() - 3_600_000;
  events.push({
    ...events[0],
    id: "late-session",
    dataType: "app_usage",
    timestampStart: new Date(lateStart).toISOString(),
    timestampEnd: new Date(lateStart + 3 * 3_600_000).toISOString(),
    valueNumeric: 10_800,
  });
  return events.sort((a, b) =>
    a.timestampStart.localeCompare(b.timestampStart),
  );
}

test("pattern grid built from separate history and today cells matches a single build", async () => {
  const events = syntheticEvents(28, 400);
  const todayStart = parseISODate(anchor).toISOString();
  const history = events.filter((event) => event.timestampStart < todayStart);
  const today = events.filter((event) => event.timestampStart >= todayStart);
  const maxima = buildActivityScoreMaxima(
    await buildUnifiedTimelineAsync(events, {
      startTimestamp: parseISODate(shiftISODate(anchor, -27)).toISOString(),
      endTimestamp: parseISODate(shiftISODate(anchor, 1)).toISOString(),
      resolution: "hour",
    }),
  );

  const whole = await buildMonthlyActivityPatternAsync(
    events,
    anchor,
    "hour",
    maxima,
  );
  const historyCells = await buildPatternDayCellsAsync(
    history,
    getMonthlyPatternGrid(anchor).filter((date) => date < anchor),
    "hour",
    maxima,
  );
  const carriedOver = history.filter(
    (event) => Date.parse(event.timestampEnd) > Date.parse(todayStart),
  );
  assert.ok(carriedOver.length > 0, "fixture must cross midnight");
  const todayCells = await buildPatternDayCellsAsync(
    [...carriedOver, ...today],
    [anchor],
    "hour",
    maxima,
  );
  const split = assembleMonthlyActivityPattern(
    anchor,
    new Map([...historyCells, ...todayCells]),
  );

  assert.deepEqual(split, whole);
  assert.deepEqual(
    whole,
    buildMonthlyActivityPattern(events, anchor, "hour", events, maxima),
  );
});

test("pattern partition yields by time budget, not every 200 events", async (context) => {
  const events = syntheticEvents(28, 4000);
  const realSetTimeout = globalThis.setTimeout;
  let yields = 0;
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    yields++;
    return realSetTimeout(...args);
  }) as typeof setTimeout;
  const before = performance.now();
  try {
    await buildMonthlyActivityPatternAsync(events, anchor, "hour");
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  const elapsedMs = performance.now() - before;
  // An 8ms budget needs at most one yield per slice of work (plus slack).
  assert.ok(
    yields <= Math.ceil(elapsedMs / 8) + 28,
    `${yields} yields in ${Math.round(elapsedMs)}ms`,
  );
  assert.ok(yields < events.length / 200);
  context.diagnostic(
    `${events.length} events: ${Math.round(elapsedMs)}ms, ${yields} yields (desktop, not a device benchmark)`,
  );
});

test("rescoring today's raw buckets matches scoring them directly", async () => {
  const today = syntheticEvents(1, 400);
  const window = {
    startTimestamp: parseISODate(anchor).toISOString(),
    endTimestamp: parseISODate(shiftISODate(anchor, 1)).toISOString(),
    resolution: "hour" as const,
  };
  const raw = await buildUnifiedTimelineAsync(today, window);
  const historical = {
    ...buildActivityScoreMaxima(raw),
    steps: 10_000,
    unlockCount: 1,
  };
  const combined = mergeActivityScoreMaxima(
    historical,
    buildActivityScoreMaxima(raw),
  );

  assert.equal(combined.steps, 10_000);
  assert.equal(combined.unlockCount, buildActivityScoreMaxima(raw).unlockCount);
  assert.deepEqual(
    rescoreTimeline(raw, combined),
    await buildUnifiedTimelineAsync(today, window, undefined, combined),
  );
});

test("a day's cell from cached hourly samples matches the raw-event cell", async () => {
  const events = syntheticEvents(2, 400);
  const date = anchor;
  const dayStart = parseISODate(date).toISOString();
  const dayEnd = parseISODate(shiftISODate(date, 1)).toISOString();
  // Mirrors getEventsOverlappingDay: yesterday's records still running count.
  const overlapping = events.filter(
    (event) => event.timestampStart < dayEnd && event.timestampEnd >= dayStart,
  );
  assert.ok(overlapping.some((event) => event.timestampStart < dayStart));
  const raw = await buildUnifiedTimelineAsync(overlapping, {
    startTimestamp: dayStart,
    endTimestamp: dayEnd,
    resolution: "hour",
  });
  const maxima = { ...buildActivityScoreMaxima(raw), steps: 2_000 };
  const samples = decodeActivityHourSamples(encodeActivityHourSamples(raw));

  assert.deepEqual(
    buildPatternDayCellFromSamples(date, samples, maxima),
    (await buildPatternDayCellsAsync(events, [date], "hour", maxima)).get(date),
  );
  assert.equal(
    buildPatternDayCellFromSamples(date, [], maxima).hasAnyData,
    false,
  );
});

// The pre-cooperative implementation, kept as the reference behaviour.
function referenceResolvedTimelineEvents(
  events: ZentraEventRecord[],
): ZentraEventRecord[] {
  const selected = new Set(
    selectResolvedStepEvents(events).map((event) => event.id),
  );
  return [
    ...events.filter(
      (event) =>
        event.metadata.stale_import !== true &&
        event.dataType !== "sleep_inferred" &&
        (event.dataType !== "steps" || selected.has(event.id)),
    ),
    ...sleepTimelineEvents(events),
  ];
}

test("resumable source resolution matches the original and yields on large input", () => {
  const base = syntheticEvents(3, 3000);
  const events: ZentraEventRecord[] = base.map((event, index) => ({
    ...event,
    source:
      event.dataType === "steps" && index % 5 === 0
        ? "health_connect"
        : event.source,
    metadata: {
      ...(index % 97 === 0 ? { stale_import: true } : {}),
      ...(index % 11 === 0 ? { platform_aggregate: true } : {}),
      source_app: index % 2 ? "a" : "b",
    },
  }));
  events.push(
    {
      ...events[0],
      id: "sleep-1",
      dataType: "sleep_inferred",
      timestampStart: "2026-09-30T22:30:00.000Z",
      timestampEnd: "2026-10-01T05:30:00.000Z",
      valueNumeric: 420,
      metadata: {},
    },
    {
      ...events[0],
      id: "sleep-stale",
      dataType: "sleep_inferred",
      timestampStart: "2026-09-29T23:00:00.000Z",
      timestampEnd: "2026-09-30T06:00:00.000Z",
      valueNumeric: 420,
      metadata: { stale_import: true },
    },
  );

  assert.deepEqual(
    resolvedTimelineEvents(events),
    referenceResolvedTimelineEvents(events),
  );
  const work = resolvedTimelineEventsWork(events);
  let yields = 0;
  while (!work.next().done) yields++;
  assert.ok(yields > events.length / 500, `${yields} yields`);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import type { SQLiteDatabase } from "expo-sqlite";
import { readActivityCacheManifest } from "@/utils/activity-cache-manifest";
import {
  ACTIVITY_MAXIMA_EVENT_TYPES,
  buildActivityScoreMaxima,
} from "@/utils/activity-intensity";
import {
  compareTimestamps,
  parseISODate,
  shiftISODate,
  toISODate,
} from "@/utils/dates";
import {
  assembleMonthlyActivityPattern,
  buildPatternDayCellFromSamples,
  buildUnifiedTimeline,
  buildUnifiedTimelineAsync,
  carryPatternCellsForward,
  getMonthlyPatternGrid,
  patternDayCellsByDate,
} from "@/utils/unified-timeline";
import type { EventDataType, ZentraEventRecord } from "@/types/zentra";
import { createActivityCacheFixture } from "./activity-cache-fixtures";

const date = "2026-09-20";
const at = (hour: number, minute = 0, second = 0) =>
  new Date(2026, 8, 20, hour, minute, second).toISOString();
const dayWindow = {
  startTimestamp: parseISODate(date).toISOString(),
  endTimestamp: parseISODate(shiftISODate(date, 1)).toISOString(),
  resolution: "hour" as const,
};

let nextId = 0;
function event(
  dataType: EventDataType,
  start: string,
  end: string,
  fields: Partial<ZentraEventRecord> = {},
): ZentraEventRecord {
  return {
    id: `e${nextId++}`,
    timestampStart: start,
    timestampEnd: end,
    dataType,
    source: "sensor",
    unit: "x",
    confidence: 1,
    metadata: {},
    schemaVersion: 1,
    createdAt: start,
    ...fields,
  };
}

test("an event's share of each hour is its overlap, and a point event counts once", () => {
  const buckets = buildUnifiedTimeline(
    [
      // 10:30-12:15 of app use, 6300 s: 1800 s, 3600 s and 900 s by hour.
      event("app_usage", at(10, 30), at(12, 15), {
        source: "usage_stats",
        valueNumeric: 6300,
      }),
      // Imported steps for 09:00-11:00 split evenly across the two hours.
      event("steps", at(9), at(11), {
        source: "health_connect",
        valueNumeric: 800,
      }),
      event("unlock_event", at(10, 59, 59), at(10, 59, 59)),
      event("unlock_event", at(11), at(11)),
      // Yesterday's session still running at midnight: only today's 30 minutes count.
      event("exercise_session", at(-1), at(0, 30), { valueNumeric: 5400 }),
      // Ends before it starts: treated as a point at its start.
      event("unlock_event", at(15), at(14)),
      // A coverage marker is bookkeeping, not an observation.
      event("heart_rate", at(20), at(20), {
        valueNumeric: 90,
        metadata: { coverage_window: true },
      }),
    ],
    dayWindow,
  );

  assert.equal(buckets.length, 24);
  assert.deepEqual(
    [10, 11, 12].map((hour) => buckets[hour].screenTimeSeconds),
    [1800, 3600, 900],
  );
  assert.deepEqual(
    [8, 9, 10, 11].map((hour) => buckets[hour].steps),
    [0, 400, 400, 0],
  );
  assert.deepEqual(
    [10, 11, 15, 14].map((hour) => buckets[hour].unlockCount),
    [1, 1, 1, 0],
  );
  assert.equal(buckets[0].exerciseSeconds, 1800);
  assert.equal(buckets[1].exerciseSeconds, 0);
  assert.equal(buckets[20].hasAnyData, false);
  assert.equal(buckets[13].hasAnyData, false);
  assert.match(buckets[10].label, /^10\s?AM$/u);
});

test("hour labels are optional and change nothing else", async () => {
  const events = [
    event("unlock_event", at(7), at(7)),
    event("steps", at(9), at(10), {
      source: "health_connect",
      valueNumeric: 500,
    }),
  ];
  const labelled = await buildUnifiedTimelineAsync(events, dayWindow);
  const bare = await buildUnifiedTimelineAsync(
    events,
    dayWindow,
    undefined,
    undefined,
    { labels: false },
  );
  assert.ok(bare.every((bucket) => bucket.label === ""));
  assert.deepEqual(
    bare.map((bucket, hour) => ({ ...bucket, label: labelled[hour].label })),
    labelled,
  );
});

// Every data type, checked by the compiler: a new type must be placed here.
const FEEDS_MAXIMA: Record<EventDataType, boolean> = {
  steps: true,
  activity: true,
  location: true,
  heart_rate: true,
  exercise_session: true,
  sleep_inferred: true,
  screen_state: true,
  app_usage: true,
  unlock_event: true,
  distance: false,
  charging_state: false,
  ambient_light: false,
  motion_context: false,
  connectivity_state: false,
};

function oneOfEach(): ZentraEventRecord[] {
  return (Object.keys(FEEDS_MAXIMA) as EventDataType[]).flatMap((type, n) => [
    event(type, at(8 + (n % 5)), at(9 + (n % 5), 30), {
      valueNumeric: 300 + n,
      valueText:
        type === "activity"
          ? "walking"
          : type === "screen_state"
            ? "non_interactive"
            : undefined,
      source: type === "sleep_inferred" ? "health_connect" : "sensor",
    }),
    event(type, at(14, n), at(14, n), {
      valueNumeric: 70 + n,
      valueText:
        type === "activity"
          ? "still"
          : type === "screen_state"
            ? "interactive"
            : undefined,
    }),
  ]);
}

test("the event types read for a maxima-only day are exactly the ones that move the maxima", () => {
  assert.deepEqual(
    [...ACTIVITY_MAXIMA_EVENT_TYPES].sort(),
    (Object.keys(FEEDS_MAXIMA) as EventDataType[])
      .filter((type) => FEEDS_MAXIMA[type])
      .sort(),
  );

  const events = oneOfEach();
  const maxima = (subset: ZentraEventRecord[]) =>
    buildActivityScoreMaxima(buildUnifiedTimeline(subset, dayWindow));
  const full = maxima(events);
  // Reading only those types gives the same maxima as reading everything.
  assert.deepEqual(
    maxima(
      events.filter((item) =>
        ACTIVITY_MAXIMA_EVENT_TYPES.includes(item.dataType),
      ),
    ),
    full,
  );
  // And each listed type is there for a reason: without it the maxima change.
  for (const type of ACTIVITY_MAXIMA_EVENT_TYPES)
    assert.notDeepEqual(
      maxima(events.filter((item) => item.dataType !== type)),
      full,
      type,
    );
});

test("plain timestamp comparison orders stored timestamps like localeCompare", () => {
  // Formats written by the collectors: JS toISOString and java.time.Instant,
  // whose fraction is 0, 3, 6 or 9 digits long.
  const stored = [
    "2026-09-20T10:00:00.000Z",
    "2026-09-20T10:00:00Z",
    "2026-09-20T10:00:00.5Z",
    "2026-09-20T10:00:00.123456Z",
    "2026-09-20T10:00:00.123456789Z",
    "2026-09-20T10:00:00.123Z",
    "2026-09-20T09:59:59.999Z",
    "2026-09-20T10:00:01Z",
    "2026-09-19T23:59:59.999999Z",
    "2026-10-01T00:00:00.000Z",
    "2025-12-31T23:59:59.000Z",
  ];
  for (const left of stored)
    for (const right of stored)
      assert.equal(
        Math.sign(compareTimestamps(left, right)),
        Math.sign(left.localeCompare(right)),
        `${left} vs ${right}`,
      );
  assert.deepEqual(
    [...stored].sort(compareTimestamps),
    [...stored].sort((left, right) => left.localeCompare(right)),
  );
});

function scoredCell(day: string, steps: number) {
  return buildPatternDayCellFromSamples(
    day,
    steps ? [{ ...buildActivityScoreMaxima([]), hasAnyData: true, steps }] : [],
    { ...buildActivityScoreMaxima([]), steps: 1000 },
  );
}

test("a day still loading is drawn as a placeholder, not as a day without records", () => {
  const anchor = "2026-10-01";
  const grid = getMonthlyPatternGrid(anchor);
  const cells = assembleMonthlyActivityPattern(
    anchor,
    new Map([[grid[3], scoredCell(grid[3], 500)]]),
    new Set([grid[4]]),
  );
  const byDate = new Map(
    cells.map((cell) => [toISODate(new Date(cell.startTimestamp)), cell]),
  );
  assert.equal(byDate.get(grid[3])?.hasAnyData, true);
  assert.equal(byDate.get(grid[4])?.placeholder, true);
  // Loaded and empty: a real "no records" day.
  assert.equal(byDate.get(grid[5])?.placeholder, false);
  assert.equal(byDate.get(grid[5])?.hasAnyData, false);
});

test("a grid saved days ago is carried onto today's grid by date", () => {
  const savedOn = "2026-09-24";
  const anchor = "2026-10-01"; // a week later, in the next grid week
  const savedGrid = getMonthlyPatternGrid(savedOn);
  const saved = assembleMonthlyActivityPattern(
    savedOn,
    new Map(
      savedGrid
        .filter((day) => day <= savedOn)
        .map((day, index) => [day, scoredCell(day, 100 + index * 10)]),
    ),
  );

  const byDate = patternDayCellsByDate(saved, savedOn);
  // The day it was saved on held only part of that day, so it is not reused.
  assert.equal(byDate.has(savedOn), false);
  assert.equal(byDate.has(shiftISODate(savedOn, -1)), true);

  const carried = carryPatternCellsForward(anchor, saved, savedOn);
  const grid = getMonthlyPatternGrid(anchor);
  assert.equal(carried.length, 28);
  for (const [index, cell] of carried.entries()) {
    const day = grid[index];
    if (day > anchor) assert.equal(cell.placeholder, true);
    else if (day < savedOn && savedGrid.includes(day)) {
      assert.equal(cell.placeholder, false, day);
      assert.equal(cell.intensityScore, byDate.get(day)?.intensityScore, day);
    } else assert.equal(cell.placeholder, true, `${day} should be pending`);
  }
  // Intensity is re-normalized over the cells that carried over.
  assert.equal(Math.max(...carried.map((cell) => cell.intensity)), 100);
});

test("the manifest hands back a stale stored day separately from a current one", async () => {
  const fixture = createActivityCacheFixture("2026-09-01", "2026-09-05");
  try {
    const db = fixture.adapter as unknown as SQLiteDatabase;
    fixture.db
      .prepare(
        "INSERT INTO event_changes(start_date,end_date,data_type) VALUES('2026-09-03','2026-09-03','steps')",
      )
      .run();
    const manifest = await readActivityCacheManifest(
      db,
      "2026-09-01",
      "2026-09-05",
      0,
    );
    const day = (isoDate: string) =>
      manifest.find((entry) => entry.date === isoDate)!;
    assert.equal(day("2026-09-03").payload, undefined);
    assert.equal(day("2026-09-03").stalePayload, JSON.stringify({ steps: 2 }));
    assert.equal(day("2026-09-02").payload, JSON.stringify({ steps: 1 }));
    assert.equal("stalePayload" in day("2026-09-02"), false);
  } finally {
    fixture.db.close();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { buildActivityScoreMaxima } from "@/utils/activity-intensity";
import {
  compareTimestamps,
  enumerateISODateRange,
  shiftISODate,
  toISODate,
} from "@/utils/dates";
import {
  buildLiveTrendSeries,
  buildLiveTrendSurfaces,
  buildTrendCompositeValues,
  trendInputsFromEvents,
} from "@/utils/live-trends";
import {
  hasLoadFailure,
  noteLoadResult,
  type LoadFailures,
} from "@/utils/load-failures";
import { readDatesWithEvents } from "@/utils/repository-aggregates";
import { sleepNightSummaries } from "@/utils/sleep-night-summaries";
import { selectSleepForWakeDate } from "@/utils/sleep-selection";
import { sleepSummaryEvent } from "@/utils/sleep-summary";
import {
  sleepEventsByWakeDate,
  sleepEventsForWakeDate,
} from "@/utils/sleep-wake-date";
import {
  buildTrendDaySummary,
  emptyTrendDaySummary,
} from "@/utils/trend-day-summary";
import type {
  DailyAggregateRecord,
  EventDataType,
  ZentraEventRecord,
} from "@/types/zentra";

const DAY = "2026-09-20";
const at = (date: string, hour: number, minute = 0) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, hour, minute).toISOString();
};

let nextId = 0;
function event(
  dataType: EventDataType,
  start: string,
  fields: Partial<ZentraEventRecord> = {},
): ZentraEventRecord {
  return {
    id: `e${nextId++}`,
    timestampStart: start,
    timestampEnd: start,
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

const heartRate = (
  start: string,
  bpm: number,
  metadata: ZentraEventRecord["metadata"] = {},
) =>
  event("heart_rate", start, {
    source: "health_connect",
    valueNumeric: bpm,
    metadata,
  });

function night(
  id: string,
  source: "health_connect" | "inferred",
  start: string,
  end: string,
  metadata: ZentraEventRecord["metadata"] = {},
): ZentraEventRecord {
  return event("sleep_inferred", start, {
    id,
    source,
    timestampEnd: end,
    valueNumeric: (Date.parse(end) - Date.parse(start)) / 60000,
    unit: "minutes",
    metadata:
      source === "health_connect"
        ? { source_app: "watch", ...metadata }
        : { rest_algorithm_version: 2, ...metadata },
  });
}

test("a day summary keeps what Trends reads from that day's records, and nothing from other days", () => {
  const summary = buildTrendDaySummary(DAY, [
    // Yesterday and tomorrow are in the same read but not this day's.
    heartRate(at(shiftISODate(DAY, -1), 23, 59), 200),
    event("ambient_light", at(shiftISODate(DAY, 1), 0), { valueNumeric: 999 }),

    heartRate(at(DAY, 3), 50, { health_platform: "Health Connect" }),
    heartRate(at(DAY, 9), 70),
    heartRate(at(DAY, 9, 30), 90),
    heartRate(at(DAY, 20), 110),
    // Superseded upstream: out of the daily average, still a stored reading.
    heartRate(at(DAY, 14), 180, { stale_import: true }),
    event("ambient_light", at(DAY, 8), { valueNumeric: 100 }),
    event("ambient_light", at(DAY, 12), { valueNumeric: 301 }),
    event("ambient_light", at(DAY, 13)),
    // The platform total wins the day; the phone counter is not "current".
    event("steps", at(DAY, 10), {
      source: "health_connect",
      valueNumeric: 4000,
      metadata: { platform_aggregate: true },
    }),
    event("steps", at(DAY, 11), { valueNumeric: 3900 }),
    event("unlock_event", at(DAY, 7)),
    event("exercise_session", at(DAY, 18), {
      source: "health_connect",
      metadata: { stale_import: true },
    }),
    night("n", "health_connect", at(DAY, 0, 30), at(DAY, 6)),
  ]);

  assert.deepEqual(summary.heartRate, [50 + 70 + 90 + 110, 4]);
  // Night, Morning, Afternoon, Evening; the stale 14:00 reading counts here.
  assert.deepEqual(summary.heartRateDayparts, [
    [50, 1],
    [160, 2],
    [180, 1],
    [110, 1],
  ]);
  assert.equal(summary.heartRatePlatform, "Health Connect");
  assert.equal(summary.healthPlatform, "Health Connect");
  assert.deepEqual(summary.ambientLight, [401, 2]);
  assert.deepEqual(summary.steps, { platform: true, phone: false, any: true });
  assert.deepEqual(
    [...summary.observedTypes].sort(),
    ["ambient_light", "heart_rate", "steps", "unlock_event"],
    "stale records and sleep are not observed types",
  );
  assert.equal(summary.averageSpeedKmh, null);
  assert.deepEqual(buildTrendDaySummary(DAY, []), emptyTrendDaySummary());
});

function rangeFixture() {
  const start = "2026-09-18";
  const end = DAY;
  const before = shiftISODate(start, -1);
  const events = [
    // The day before the range still counts toward the range-wide cards.
    heartRate(at(before, 22), 100, { health_platform: "Health Connect" }),
    heartRate(at(start, 2), 60),
    heartRate(at(start, 10), 80),
    heartRate(at(DAY, 10), 90),
    event("ambient_light", at(start, 9), { valueNumeric: 40 }),
    event("ambient_light", at(start, 15), { valueNumeric: 61 }),
    event("steps", at(start, 12), { valueNumeric: 2000 }),
    event("steps", at(DAY, 12), { valueNumeric: 3000 }),
    event("exercise_session", at(DAY, 18), {
      source: "health_connect",
      timestampEnd: at(DAY, 18, 45),
      valueNumeric: 45,
      valueText: "trail_running",
      unit: "minutes",
    }),
    // One imported night waking on the 19th, one estimated night on the 20th.
    night("imported", "health_connect", at(start, 23), at("2026-09-19", 6)),
    night("estimated", "inferred", at("2026-09-19", 23, 30), at(DAY, 5, 30), {
      rest_wake_date: DAY,
    }),
  ].sort((a, b) => compareTimestamps(a.timestampStart, b.timestampStart));
  const aggregates: DailyAggregateRecord[] = [start, "2026-09-19", end].map(
    (date, index) => ({
      date,
      stepsTotal: [2000, 0, 3000][index],
      activeMinutes: 0,
      distanceMeters: 0,
      screenTimeSeconds: 0,
      unlockCount: 0,
      sleepEstimateMinutes: null,
      mobilityRadiusMeters: null,
      topActivity: null,
      dataCompleteness: 0.5,
      computedAt: "2026-09-20T12:00:00.000Z",
    }),
  );
  const composite = { intensityValues: [10, 0, 30], restValues: [5, 0, 15] };
  return { start, end, events, aggregates, composite };
}

const values = (series: ReturnType<typeof buildLiveTrendSeries>, key: string) =>
  series.find((entry) => entry.key === key)?.points.map((point) => point.value);

test("a range is charted from day summaries and the sleep and exercise records", () => {
  const { start, end, events, aggregates, composite } = rangeFixture();
  const inputs = trendInputsFromEvents(events);
  const series = buildLiveTrendSeries(
    aggregates,
    { start, end },
    inputs,
    composite,
  );

  assert.deepEqual(values(series, "heartRate"), [70, null, 90]);
  assert.deepEqual(values(series, "ambientLight"), [51, null, null]);
  assert.deepEqual(values(series, "steps"), [2000, null, 3000]);
  assert.deepEqual(values(series, "exerciseSessions"), [null, null, 45]);
  // A night belongs to the date it ends on.
  assert.deepEqual(values(series, "importedSleep"), [null, 420, null]);
  assert.deepEqual(values(series, "inferredSleep"), [null, null, 360]);
  // A composite score shows wherever the day has any observation, sleep included.
  assert.deepEqual(values(series, "activityIntensity"), [10, 0, 30]);
  assert.equal(
    series.find((entry) => entry.key === "steps")?.sourceLabel,
    "Phone sensor fallback",
  );
  assert.equal(
    series.find((entry) => entry.key === "importedSleep")?.sourceLabel,
    "Health Connect",
  );

  const surfaces = buildLiveTrendSurfaces(inputs);
  const dayparts = surfaces.find((entry) => entry.key === "heartRateDayparts");
  assert.equal(dayparts?.metaLabel, "4 readings");
  assert.equal(dayparts?.sourceLabel, "Health Connect");
  assert.deepEqual(
    dayparts?.visual.type === "distribution" &&
      dayparts.visual.bars.map((bar) => [bar.label, bar.value]),
    [
      ["Night", 60],
      ["Morning", 85],
      ["Evening", 100],
    ],
  );
  assert.equal(
    surfaces.find((entry) => entry.key === "exerciseMix")?.metaLabel,
    "Trail Running",
  );
  assert.equal(
    surfaces.find((entry) => entry.key === "sleepStartHeatmap")?.valueLabel,
    "2",
  );
});

test("a day whose summary has not loaded yet is a gap, not a zero", () => {
  const { start, end, events, aggregates, composite } = rangeFixture();
  const inputs = trendInputsFromEvents(events);
  inputs.days.delete(DAY);
  const series = buildLiveTrendSeries(
    aggregates,
    { start, end },
    inputs,
    composite,
  );
  assert.deepEqual(values(series, "heartRate"), [70, null, null]);
  assert.deepEqual(values(series, "steps"), [2000, null, null]);
  // Sleep comes from its own records, so the night is still there.
  assert.deepEqual(values(series, "inferredSleep"), [null, null, 360]);
});

test("daily composite scores are scaled by the selected days alone", () => {
  const hour = (steps: number) => ({
    ...buildActivityScoreMaxima([]),
    hasAnyData: true,
    steps,
  });
  const range = ["2026-09-18", "2026-09-19", "2026-09-20"];
  const samples = new Map([
    ["2026-09-18", [hour(500), hour(1000)]],
    ["2026-09-20", [{ ...hour(0), hasAnyData: false }, hour(250)]],
  ]);
  const composite = buildTrendCompositeValues(range, samples);
  // The range's busiest hour is 1000 steps. Each day is the mean hourly
  // intensity over its hours with data; a day without samples is 0.
  assert.deepEqual(composite.intensityValues, [75, 0, 25]);
  assert.deepEqual(composite.restValues, [25, 0, 75]);

  // The day before the range is loaded for the range-wide cards. However
  // large its values, it is not one of the selected days and sets no scale.
  samples.set("2026-09-17", [hour(50_000)]);
  assert.deepEqual(buildTrendCompositeValues(range, samples), composite);
  // Selected, it does.
  assert.deepEqual(
    buildTrendCompositeValues(["2026-09-17", ...range], samples)
      .intensityValues,
    [100, 2, 0, 1],
  );
});

test("one load failing is not cleared by the other succeeding", () => {
  type Load = "history" | "records";
  let failures: LoadFailures<Load> | null = null;
  const note = (scope: string, load: Load, failed: boolean) =>
    (failures = noteLoadResult(failures, scope, load, failed));

  note("30d", "records", true);
  // The order from the review: records fails, then history finishes.
  note("30d", "history", false);
  assert.equal(hasLoadFailure(failures, "30d"), true);
  note("30d", "history", true);
  note("30d", "records", false);
  assert.equal(hasLoadFailure(failures, "30d"), true, "history still failed");
  note("30d", "history", false);
  assert.equal(hasLoadFailure(failures, "30d"), false);

  // A failure belongs to the range it happened in.
  note("30d", "records", true);
  assert.equal(hasLoadFailure(failures, "90d"), false);
  assert.equal(hasLoadFailure(failures, undefined), false);
  note("90d", "history", false);
  assert.equal(hasLoadFailure(failures, "30d"), false);

  // Nothing changed: the same value, so a state update is a no-op.
  note("90d", "history", true);
  const before = failures;
  assert.equal(note("90d", "history", true), before);
});

// The per-date grouping this replaced, kept as the reference behaviour.
function referenceSleepEventsForWakeDate(
  events: ZentraEventRecord[],
  date: string,
): ZentraEventRecord[] {
  const origins = new Map<string, ZentraEventRecord[]>();
  const selected: ZentraEventRecord[] = [];
  for (const item of events) {
    if (
      item.dataType !== "sleep_inferred" ||
      item.metadata.stale_import === true
    )
      continue;
    if (typeof item.metadata.rest_wake_date === "string") {
      if (item.metadata.rest_wake_date === date) selected.push(item);
      continue;
    }
    const key = `${item.source}:${item.metadata.health_platform ?? ""}:${item.metadata.source_app ?? ""}`;
    const group = origins.get(key) ?? [];
    group.push(item);
    origins.set(key, group);
  }
  for (const stages of origins.values()) {
    stages.sort((a, b) =>
      compareTimestamps(a.timestampStart, b.timestampStart),
    );
    let group: ZentraEventRecord[] = [],
      end = 0;
    for (const item of stages) {
      if (group.length && Date.parse(item.timestampStart) > end + 90 * 60000) {
        if (toISODate(new Date(end)) === date) selected.push(...group);
        group = [];
      }
      group.push(item);
      end = Math.max(
        group.length === 1 ? 0 : end,
        Date.parse(item.timestampEnd),
      );
    }
    if (group.length && toISODate(new Date(end)) === date)
      selected.push(...group);
  }
  return selected;
}

function sleepHistory(seed: number, days: number): ZentraEventRecord[] {
  let x = seed;
  const random = () =>
    (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const out: ZentraEventRecord[] = [];
  for (const date of enumerateISODateRange(shiftISODate(DAY, -days), DAY)) {
    const pick = random();
    const tag = `${seed}-${date}`;
    if (pick < 0.3)
      out.push(night(`w${tag}`, "health_connect", at(date, -2), at(date, 6)));
    else if (pick < 0.5) {
      // Staged night from two apps, with a nap and a long gap between stages.
      out.push(
        night(`a${tag}`, "health_connect", at(date, -1), at(date, 1)),
        night(`b${tag}`, "health_connect", at(date, 1, 20), at(date, 5)),
        night(`c${tag}`, "health_connect", at(date, 13), at(date, 14), {
          source_app: random() < 0.5 ? "watch" : "ring",
        }),
      );
    } else if (pick < 0.7)
      out.push(
        night(`r${tag}`, "inferred", at(date, 0, 30), at(date, 6), {
          rest_wake_date: date,
        }),
      );
    else if (pick < 0.8)
      out.push(
        night(`s${tag}`, "health_connect", at(date, -1), at(date, 7), {
          stale_import: true,
        }),
        night(`l${tag}`, "inferred", at(date, -1), at(date, 6)),
      );
    // A session that runs past the next midnight belongs to the later date.
    else if (pick < 0.85)
      out.push(night(`x${tag}`, "health_connect", at(date, 20), at(date, 26)));
  }
  return out.sort((a, b) =>
    compareTimestamps(a.timestampStart, b.timestampStart),
  );
}

test("nights grouped once for all dates match the per-date grouping", () => {
  let nights = 0;
  for (const seed of [2, 17, 91, 404]) {
    const events = sleepHistory(seed, 60);
    const byDate = sleepEventsByWakeDate(events);
    for (const date of enumerateISODateRange(
      shiftISODate(DAY, -62),
      shiftISODate(DAY, 2),
    )) {
      const expected = referenceSleepEventsForWakeDate(events, date);
      assert.deepEqual(byDate.get(date) ?? [], expected, `${seed} ${date}`);
      assert.deepEqual(sleepEventsForWakeDate(events, date), expected);
      // A night resolves the same from its own records as from the whole list.
      assert.deepEqual(
        selectSleepForWakeDate(expected, date),
        selectSleepForWakeDate(events, date),
      );
      assert.deepEqual(
        sleepSummaryEvent(expected, date),
        sleepSummaryEvent(events, date),
      );
      if (expected.length) nights++;
    }
    assert.deepEqual(
      sleepNightSummaries(events),
      [
        ...new Set(
          events.map((item) =>
            String(
              item.metadata.rest_wake_date ??
                toISODate(new Date(item.timestampEnd)),
            ),
          ),
        ),
      ].flatMap((date) => sleepSummaryEvent(events, date) ?? []),
    );
  }
  assert.ok(nights > 100);
});

test("dates with records are found by one index probe per day, same as the scan they replace", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE events (id TEXT PRIMARY KEY NOT NULL, timestamp_start TEXT NOT NULL, timestamp_end TEXT NOT NULL, data_type TEXT NOT NULL);
      CREATE INDEX idx_events_timestamp_start ON events(timestamp_start);
      CREATE INDEX idx_events_data_type_timestamp_start ON events(data_type, timestamp_start);`);
    const insert = db.prepare("INSERT INTO events VALUES(?,?,?,?)");
    let id = 0;
    const add = (type: string, start: string, end = start) =>
      insert.run(`e${id++}`, start, end, type);
    add("steps", at("2026-09-02", 0)); // first instant of a day
    add("steps", at("2026-09-04", 23, 59)); // last minute of a day
    add("heart_rate", at("2026-09-09", 12));
    add("heart_rate", at("2026-08-31", 23, 59)); // just before the range
    add("heart_rate", at("2026-09-21", 0)); // just after it
    // Sleep counts on the date it ends, even with nothing else that day.
    add("sleep_inferred", at("2026-09-12", 23), at("2026-09-13", 7));
    add("sleep_inferred", at("2026-09-20", 23), at("2026-09-21", 7));

    const plans: string[] = [];
    const adapter = {
      getAllAsync: async (sql: string, ...params: unknown[]) => {
        plans.push(
          JSON.stringify(
            db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as never[])),
          ),
        );
        return db.prepare(sql).all(...(params as never[]));
      },
    } as unknown as SQLiteDatabase;

    const found = await readDatesWithEvents(
      adapter,
      "2026-09-01",
      "2026-09-20",
    );
    const scanned = db
      .prepare(
        `SELECT DISTINCT date(timestamp_start,'localtime') AS date FROM events WHERE date(timestamp_start,'localtime') BETWEEN ? AND ? UNION SELECT DISTINCT date(timestamp_end,'localtime') AS date FROM events WHERE data_type='sleep_inferred' AND date(timestamp_end,'localtime') BETWEEN ? AND ?`,
      )
      .all("2026-09-01", "2026-09-20", "2026-09-01", "2026-09-20");
    assert.deepEqual(
      found.map((row) => row.date),
      (scanned as { date: string }[]).map((row) => row.date).sort(),
    );
    assert.deepEqual(
      found.map((row) => row.date),
      [
        "2026-09-02",
        "2026-09-04",
        "2026-09-09",
        "2026-09-12", // a sleep record starts here
        "2026-09-13", // and ends here
        "2026-09-20", // the next one starts in range; it ends outside it
      ],
    );
    assert.match(
      plans[0],
      /idx_events_timestamp_start \(timestamp_start>\? AND timestamp_start<\?\)/,
    );
    assert.doesNotMatch(plans[0], /SCAN events/);

    // A range longer than one statement's worth of dates is probed in chunks.
    const year = await readDatesWithEvents(adapter, "2026-01-01", "2026-12-31");
    assert.equal(year.length, 8);
    assert.equal(plans.length, 2 + 3, "366 dates in two chunks, plus sleep");
  } finally {
    db.close();
  }
});

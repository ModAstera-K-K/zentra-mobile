import { test } from "node:test";
import assert from "node:assert/strict";
import { parseISODate, shiftISODate } from "@/utils/dates";
import { getDailyAggregateForDate } from "@/utils/event-repository";
import {
  insertEvents,
  openTestRepository,
  ordinaryDay,
  storedEvent,
} from "./repository-harness";
import { queryPlan, statementLog } from "./sqlite-adapter";

const HOUR = 3_600_000;
const DAY = "2026-09-15";
const dayStart = parseISODate(DAY).getTime();

/** The definition the bounded read has to match: everything that overlaps the day. */
const EVERYTHING_OVERLAPPING = `SELECT id FROM events
  WHERE data_type IN ('app_usage','sleep_inferred','exercise_session','steps')
  AND timestamp_start < ? AND timestamp_end > ?`;

function spanning(
  id: string,
  dataType: "app_usage" | "steps" | "sleep_inferred" | "exercise_session",
  startMs: number,
  endMs: number,
  fields: Parameters<typeof storedEvent>[3] = {},
) {
  return storedEvent(id, dataType, startMs, {
    timestampEnd: new Date(endMs).toISOString(),
    valueNumeric: Math.round((endMs - startMs) / 1000),
    unit: "seconds",
    ...fields,
  });
}

test("a day's aggregate reads the records carried into it without walking history", async () => {
  const adapter = await openTestRepository();
  // Three earlier days and the day itself, so there is history to walk.
  for (let back = 3; back >= 0; back--)
    insertEvents(adapter, ordinaryDay(shiftISODate(DAY, -back)));
  insertEvents(adapter, [
    spanning("usage-over-midnight", "app_usage", dayStart - 2 * 60_000, dayStart + 7 * 60_000, {
      source: "usage_stats",
    }),
    spanning("usage-two-days", "app_usage", dayStart - 47 * HOUR, dayStart + 10 * 60_000, {
      source: "usage_stats",
    }),
    spanning("steps-over-midnight", "steps", dayStart - HOUR / 2, dayStart + HOUR / 2, {
      valueNumeric: 120,
      unit: "count",
    }),
    spanning("sleep-thirty-hours", "sleep_inferred", dayStart - 29 * HOUR, dayStart + HOUR),
    spanning("exercise-four-days", "exercise_session", dayStart - 96 * HOUR, dayStart + HOUR),
    // Ends exactly at midnight: belongs to the day before only.
    spanning("usage-ends-at-midnight", "app_usage", dayStart - HOUR, dayStart, {
      source: "usage_stats",
    }),
    // The one kind of record the lookback leaves out: an app-usage row that
    // began more than two local days before the day.
    spanning("usage-coverage-four-days", "app_usage", dayStart - 96 * HOUR, dayStart + 12 * HOUR, {
      source: "usage_stats",
      valueNumeric: 0,
      metadata: { coverage_window: true },
    }),
  ]);

  const from = statementLog.length;
  const aggregate = await getDailyAggregateForDate(DAY);
  const carriedIn = statementLog
    .slice(from)
    .find((statement) => statement.sql.includes("UNION ALL"));
  assert.ok(carriedIn, "the carried-in read ran");

  const ids = (sql: string, params: unknown[]) =>
    adapter.db
      .prepare(sql)
      .all(...(params as string[]))
      .map((row) => String(row.id));
  const startIso = new Date(dayStart).toISOString();
  const endIso = new Date(dayStart + 24 * HOUR).toISOString();
  const overlapping = ids(EVERYTHING_OVERLAPPING, [endIso, startIso]);
  const startedEarlier = new Set(
    ids("SELECT id FROM events WHERE timestamp_start < ?", [startIso]),
  );

  assert.deepEqual(ids(carriedIn.sql, carriedIn.params).sort(), [
    "exercise-four-days",
    "sleep-thirty-hours",
    "steps-over-midnight",
    "usage-over-midnight",
    "usage-two-days",
  ]);
  assert.deepEqual(
    overlapping.filter((id) => startedEarlier.has(id)).sort(),
    [...ids(carriedIn.sql, carriedIn.params), "usage-coverage-four-days"].sort(),
    "everything carried in is found, apart from the long app-usage row",
  );

  // The app-usage and step branch has both ends of its time range.
  const plan = queryPlan(adapter.db, carriedIn);
  assert.ok(
    plan.some((step) => /timestamp_start>\? AND timestamp_start<\?/.test(step)),
    plan.join(" | "),
  );

  // 12 one-minute sessions an hour, plus 7 and 10 minutes carried in.
  assert.equal(aggregate?.screenTimeSeconds, 24 * 6 * 60 + 7 * 60 + 10 * 60);
});

test("a day whose only app-usage evidence is an old coverage row no longer counts app usage", async () => {
  const adapter = await openTestRepository();
  const quietDay = "2026-08-20";
  const quietStart = parseISODate(quietDay).getTime();
  insertEvents(adapter, [
    storedEvent("quiet-battery", "charging_state", quietStart + HOUR, {
      source: "system_broadcast",
      valueNumeric: 0.5,
      unit: "fraction",
    }),
    spanning("quiet-coverage", "app_usage", quietStart - 96 * HOUR, quietStart + 30 * HOUR, {
      source: "usage_stats",
      valueNumeric: 0,
      metadata: { coverage_window: true },
    }),
  ]);

  const aggregate = await getDailyAggregateForDate(quietDay);
  // One of the six completeness types (the battery reading). The coverage
  // row started four days earlier, outside the two-day lookback.
  assert.equal(aggregate?.dataCompleteness, 0.17);
  assert.equal(aggregate?.screenTimeSeconds, 0);
});

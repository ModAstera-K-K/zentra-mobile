import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventDataType, ZentraEventRecord } from "@/types/zentra";
import { parseISODate } from "@/utils/dates";
import {
  appendEventsForCollector,
  getDailyAggregateForDate,
} from "@/utils/event-repository";
import {
  AGGREGATE_INPUT_TYPES,
  AGGREGATE_PRESENCE_TYPES,
  AGGREGATE_UNRELATED_TYPES,
  buildDailyAggregateRecord,
} from "@/utils/repository-aggregates";
import {
  insertEvents,
  openTestRepository,
  ordinaryDay,
  storedEvent,
} from "./repository-harness";
import { statementLog } from "./sqlite-adapter";

const DAY = "2026-09-15";
const noon = parseISODate(DAY).getTime() + 12 * 3_600_000;

// One record of every type, as a collector would store it. Listing them by
// type means a new event type cannot be added without being classified here.
const SAMPLE: Record<EventDataType, Partial<ZentraEventRecord>> = {
  steps: { valueNumeric: 900 },
  distance: { valueNumeric: 120, unit: "m" },
  activity: { source: "activity_recognition", valueText: "walking" },
  location: {
    valueJson: JSON.stringify({ latitude: 35.68, longitude: 139.76, accuracy: 12 }),
  },
  screen_state: { source: "usage_stats", valueText: "on" },
  app_usage: {
    source: "usage_stats",
    timestampEnd: new Date(noon + 300_000).toISOString(),
    valueNumeric: 300,
    unit: "seconds",
  },
  unlock_event: { source: "usage_stats" },
  charging_state: { source: "system_broadcast", valueNumeric: 0.6, valueText: "Charging", unit: "fraction" },
  sleep_inferred: {
    source: "inferred",
    timestampStart: new Date(noon - 9 * 3_600_000).toISOString(),
    timestampEnd: new Date(noon - 5 * 3_600_000).toISOString(),
    valueNumeric: 240,
    unit: "minutes",
    metadata: { rest_wake_date: DAY, rest_algorithm_version: 2 },
  },
  heart_rate: { source: "health_connect", valueNumeric: 72, unit: "bpm" },
  exercise_session: {
    source: "health_connect",
    timestampEnd: new Date(noon + 1_800_000).toISOString(),
    valueText: "running",
    valueNumeric: 30,
    unit: "minutes",
  },
  ambient_light: { valueNumeric: 320, unit: "lux" },
  motion_context: { valueText: "walking" },
  connectivity_state: { source: "system_broadcast", valueText: "wifi" },
};
const TYPES = Object.keys(SAMPLE) as EventDataType[];
const sample = (type: EventDataType, id: string) =>
  storedEvent(id, type, noon, SAMPLE[type]);

function aggregate(events: ZentraEventRecord[]) {
  return { ...buildDailyAggregateRecord(DAY, events), computedAt: "" };
}

test("only the listed event types can change a day's aggregate", () => {
  const dayWithEverything = TYPES.map((type) => sample(type, `first-${type}`));
  for (const type of TYPES) {
    if (AGGREGATE_INPUT_TYPES.has(type)) continue;
    // A further record of a type that is not an input changes nothing.
    assert.deepEqual(
      aggregate([...dayWithEverything, sample(type, `second-${type}`)]),
      aggregate(dayWithEverything),
      `${type} is not listed as an aggregate input but changed the aggregate`,
    );
    // Its first record changes nothing either, unless the type counts as present.
    const without = dayWithEverything.filter((event) => event.dataType !== type);
    const firstChangesIt =
      JSON.stringify(aggregate(without)) !== JSON.stringify(aggregate(dayWithEverything));
    assert.equal(firstChangesIt, AGGREGATE_PRESENCE_TYPES.includes(type), type);
    // Nor does it on a day with nothing else, where fallbacks would show.
    if (!AGGREGATE_PRESENCE_TYPES.includes(type))
      assert.deepEqual(aggregate([sample(type, `only-${type}`)]), aggregate([]), type);
  }
  assert.deepEqual(AGGREGATE_PRESENCE_TYPES, ["charging_state"]);
  // Every type is an input, counted as present, or listed as unrelated.
  assert.deepEqual(
    [...AGGREGATE_UNRELATED_TYPES].sort(),
    TYPES.filter(
      (type) =>
        !AGGREGATE_INPUT_TYPES.has(type) &&
        !AGGREGATE_PRESENCE_TYPES.includes(type),
    ).sort(),
  );
});

test("storing an event rebuilds the day's aggregate only when it can change it", async () => {
  const adapter = await openTestRepository();
  insertEvents(adapter, ordinaryDay(DAY, noon));
  const before = await getDailyAggregateForDate(DAY);
  assert.ok(before);

  const store = async (type: EventDataType, id: string) => {
    const from = statementLog.length;
    await appendEventsForCollector("deviceState", [sample(type, id)], "Stored");
    const issued = statementLog.slice(from);
    return {
      statements: issued.length,
      rebuilt: issued.some((statement) => statement.sql.includes("INTO daily_aggregates")),
    };
  };
  const storedAggregate = () =>
    adapter.db.prepare("SELECT * FROM daily_aggregates WHERE date = ?").get(DAY);
  const untouched = storedAggregate();

  // Not read by the aggregate: the write and its diagnostics row, nothing else.
  for (const type of ["ambient_light", "connectivity_state", "heart_rate"] as const)
    assert.deepEqual(await store(type, `extra-${type}`), { statements: 4, rebuilt: false });
  // Battery readings count only as present, and the day already has some.
  assert.deepEqual(await store("charging_state", "extra-battery"), { statements: 5, rebuilt: false });
  assert.deepEqual(storedAggregate(), untouched);

  assert.equal((await store("unlock_event", "extra-unlock")).rebuilt, true);
  assert.equal((await getDailyAggregateForDate(DAY))?.unlockCount, before.unlockCount + 1);
});

test("the first battery reading of a day still counts toward its completeness", async () => {
  const adapter = await openTestRepository();
  const quietDay = "2026-08-20";
  const at = parseISODate(quietDay).getTime() + 3_600_000;
  insertEvents(adapter, [storedEvent("quiet-steps", "steps", at, { valueNumeric: 10 })]);
  assert.equal((await getDailyAggregateForDate(quietDay))?.dataCompleteness, 0.17);

  const battery = (id: string) =>
    storedEvent(id, "charging_state", at + 60_000, SAMPLE.charging_state);
  const completeness = () =>
    Number(
      adapter.db
        .prepare("SELECT data_completeness AS value FROM daily_aggregates WHERE date = ?")
        .get(quietDay)?.value,
    );
  await appendEventsForCollector("deviceState", [battery("quiet-battery-1")], "Stored");
  assert.equal(completeness(), 0.33);

  const from = statementLog.length;
  await appendEventsForCollector("deviceState", [battery("quiet-battery-2")], "Stored");
  assert.equal(
    statementLog.slice(from).some((statement) => statement.sql.includes("INTO daily_aggregates")),
    false,
  );
  assert.equal(completeness(), 0.33);
});

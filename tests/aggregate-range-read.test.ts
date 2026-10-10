import { test } from "node:test";
import assert from "node:assert/strict";
import { parseISODate, shiftISODate } from "@/utils/dates";
import {
  appendEventsForCollector,
  enqueueDatabaseOperation,
  getDailyAggregateForDate,
  getDailyAggregatesForRange,
  getRepositoryRevision,
  getStoredDayRevision,
} from "@/utils/event-repository";
import {
  insertEvents,
  openTestRepository,
  ordinaryDay,
  storedEvent,
} from "./repository-harness";
import { statementLog } from "./sqlite-adapter";

const TODAY = "2026-09-30";
const HOUR = 3_600_000;
const noonOn = (date: string) => parseISODate(date).getTime() + 12 * HOUR;

test("a range of aggregates checks every day's freshness in one read and rebuilds outside it", async (context) => {
  const adapter = await openTestRepository();
  for (let back = 39; back >= 0; back--)
    insertEvents(adapter, ordinaryDay(shiftISODate(TODAY, -back)));
  const start = shiftISODate(TODAY, -29);
  const range = () => getDailyAggregatesForRange(start, TODAY);
  const first = await range();
  assert.equal(first.length, 30);

  const from = statementLog.length;
  const warm = await range();
  const issued = statementLog.slice(from);
  context.diagnostic(`unchanged month: ${issued.length} statements`);
  assert.equal(issued.length, 5, "two for the dates, stored rows, change rows, result");
  assert.deepEqual(warm, first);

  // The grouped check agrees with the single-day read's own check on every
  // day: after a change, both rebuild the same days and store the same rows.
  const stored = () =>
    adapter.db
      .prepare("SELECT date, active_minutes, active_summary, steps_total, computed_at FROM daily_aggregates ORDER BY date")
      .all()
      .map((row) => ({ ...row }));
  const before = stored();
  // Steps written 35 days back: every day up to 31 days after them depends
  // on them, so 26 of the month's days are out of date and the last 4 are not.
  const changedDay = shiftISODate(TODAY, -35);
  await enqueueDatabaseOperation(async () => {
    insertEvents(adapter, [
      storedEvent("late-steps", "steps", noonOn(changedDay) + 60_000, { valueNumeric: 9_000 }),
    ]);
  });
  const rebuilds: string[] = [];
  let others = 0;
  const watchFrom = statementLog.length;
  const reading = range();
  // Queued behind the freshness check: it must not wait for the rebuilds.
  const between = enqueueDatabaseOperation(async () => {
    others = statementLog
      .slice(watchFrom)
      .filter((statement) => statement.sql.includes("INTO daily_aggregates")).length;
  });
  const after = await reading;
  await between;
  for (const statement of statementLog.slice(watchFrom))
    if (statement.sql.includes("INTO daily_aggregates"))
      rebuilds.push(String(statement.params[0]));
  assert.deepEqual(
    rebuilds,
    Array.from({ length: 26 }, (_, index) => shiftISODate(TODAY, index - 29)),
    "only the days within 31 days of the change",
  );
  assert.equal(others, 0, "another read ran before the first rebuild");
  assert.equal(after.length, 30);

  // Each of those days reads as current to the single-day path too.
  const single = statementLog.length;
  for (const day of rebuilds) await getDailyAggregateForDate(day);
  assert.equal(
    statementLog.slice(single).some((statement) => statement.sql.includes("INTO daily_aggregates")),
    false,
  );
  const now = stored();
  assert.deepEqual(
    now.filter((row) => !rebuilds.includes(String(row.date))),
    before.filter((row) => !rebuilds.includes(String(row.date))),
    "the other days were left as they were",
  );
});

test("the stored-day revision ignores records no stored-day read depends on", async () => {
  await openTestRepository();
  const day = shiftISODate(TODAY, -2);
  const start = shiftISODate(TODAY, -6);
  const revisions = async () => ({
    all: await getRepositoryRevision(start, TODAY),
    storedDays: await getStoredDayRevision(start, TODAY),
  });
  const write = (id: string, type: Parameters<typeof storedEvent>[1], fields = {}) =>
    appendEventsForCollector("deviceState", [storedEvent(id, type, noonOn(day), fields)], "Stored");

  let last = await revisions();
  for (const type of ["ambient_light", "connectivity_state", "heart_rate", "distance", "screen_state"] as const) {
    await write(`unrelated-${type}`, type, { valueNumeric: 1 });
    const next = await revisions();
    assert.notEqual(next.all, last.all, `${type} moves the full revision`);
    assert.equal(next.storedDays, last.storedDays, `${type} does not move the stored-day revision`);
    last = next;
  }
  for (const type of ["unlock_event", "charging_state", "steps"] as const) {
    await write(`related-${type}`, type, { valueNumeric: 1 });
    const next = await revisions();
    assert.notEqual(next.storedDays, last.storedDays, `${type} moves the stored-day revision`);
    last = next;
  }
  // A write outside the range moves neither.
  await appendEventsForCollector(
    "deviceState",
    [storedEvent("outside", "steps", noonOn(shiftISODate(TODAY, -20)), { valueNumeric: 5 })],
    "Stored",
  );
  assert.deepEqual(await revisions(), last);
});

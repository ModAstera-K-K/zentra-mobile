import { test } from "node:test";
import assert from "node:assert/strict";
import { useRepositoryStore } from "@/stores";
import { shiftISODate, toISODate } from "@/utils/dates";
import { appendEventsForCollector } from "@/utils/event-repository";
import {
  insertEvents,
  openTestRepository,
  ordinaryDay,
  storedEvent,
} from "./repository-harness";
import { statementLog } from "./sqlite-adapter";

const NOW = new Date(2026, 8, 15, 15, 0, 0).getTime();

test("refreshing today re-reads its records only when they changed", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: NOW });
  const adapter = await openTestRepository();
  const today = toISODate(new Date());
  insertEvents(adapter, [
    ...ordinaryDay(shiftISODate(today, -3)),
    ...ordinaryDay(today, NOW),
  ]);
  const store = () => useRepositoryStore.getState();
  const write = (id: string, dataType: "unlock_event", atMs: number) =>
    appendEventsForCollector(
      "appUsage",
      [storedEvent(id, dataType, atMs, { source: "usage_stats" })],
      "Stored",
    );
  /** One refresh, a few seconds on so the refresh floor does not drop it. */
  const refresh = async (force = false) => {
    context.mock.timers.tick(2_000);
    const from = statementLog.length;
    await store().refreshTodayData(force);
    const issued = statementLog.slice(from);
    return {
      statements: issued.length,
      rows: issued.reduce((total, statement) => total + statement.rows, 0),
    };
  };

  await store().bootstrap();
  await write("today-unlock-1", "unlock_event", NOW);
  await refresh();
  const events = store().todayEvents;
  const snapshot = store().todaySnapshot;
  const revision = store().todayDataUpdatedAt;
  assert.ok(events.some((event) => event.id === "today-unlock-1"));

  // A record three days back: others hear the data changed, today is left alone.
  // (An unlock, because older steps would rightly recalibrate today's activity.)
  await write("old-unlock", "unlock_event", NOW - 3 * 24 * 3_600_000);
  assert.deepEqual(await refresh(), { statements: 2, rows: 2 });
  assert.notEqual(store().todayDataUpdatedAt, revision);
  assert.equal(store().todayEvents, events);
  assert.equal(store().todaySnapshot, snapshot);

  // Forced with nothing new today: the aggregate is read again, the records are not.
  const forced = await refresh(true);
  assert.equal(store().todayEvents, events);
  assert.ok(forced.rows < 50, `a forced refresh read ${forced.rows} rows`);

  // A new record today is read.
  await write("today-unlock-2", "unlock_event", NOW + 1_000);
  await refresh();
  assert.notEqual(store().todayEvents, events);
  assert.ok(store().todayEvents.some((event) => event.id === "today-unlock-2"));

  // So is a correction that keeps the record's id and the day's count.
  const before = store().todayEvents;
  adapter.db.exec("UPDATE events SET value_numeric = 42 WHERE id = 'today-unlock-1'");
  await refresh();
  assert.equal(store().todayEvents.length, before.length);
  assert.equal(
    store().todayEvents.find((event) => event.id === "today-unlock-1")?.valueNumeric,
    42,
  );

  // And a record from yesterday evening that runs past midnight into today.
  const afterCorrection = store().todayEvents;
  const midnight = new Date(2026, 8, 15).getTime();
  await appendEventsForCollector(
    "appUsage",
    [
      storedEvent("usage-over-midnight", "app_usage", midnight - 120_000, {
        source: "usage_stats",
        timestampEnd: new Date(midnight + 300_000).toISOString(),
        valueNumeric: 420,
        unit: "seconds",
      }),
    ],
    "Stored",
  );
  const screenTime = store().todayAggregate?.screenTimeSeconds ?? 0;
  await refresh();
  assert.notEqual(store().todayEvents, afterCorrection);
  assert.equal(store().todayAggregate?.screenTimeSeconds, screenTime + 300);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { useRepositoryStore } from "@/stores";
import {
  getDateRangeForTrendRange,
  msUntilNextLocalDay,
  shiftISODate,
  toISODate,
} from "@/utils/dates";
import { startDayRollover } from "@/utils/day-rollover";
import { appendEventsForCollector } from "@/utils/event-repository";
import { createBatteryEvent } from "@/utils/live-event-builders";
import {
  insertEvents,
  openTestRepository,
  ordinaryDay,
} from "./repository-harness";
import { setAppState } from "./stubs/react-native";

// Ten seconds before local midnight.
const LATE = new Date(2026, 8, 15, 23, 59, 50).getTime();

test("today moves to the new day at midnight with nothing written", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: LATE });
  const adapter = await openTestRepository();
  const day = toISODate(new Date());
  insertEvents(adapter, ordinaryDay(day, LATE));
  const store = () => useRepositoryStore.getState();

  await store().bootstrap();
  assert.equal(store().todayDate, day);
  assert.ok(store().todayEvents.length > 0);

  // The last write of the day, published half a second before midnight.
  context.mock.timers.tick(9_500);
  await appendEventsForCollector(
    "deviceState",
    [createBatteryEvent({ batteryLevel: 0.8, batteryStateLabel: "Unplugged" })],
    "Battery snapshot refreshed",
  );
  await store().refreshTodayData();
  const revision = store().todayDataUpdatedAt;
  const yesterdayAggregate = store().todayAggregate;
  assert.equal(yesterdayAggregate?.date, day);

  // 00:00:00.2 on the next day: no new records, and still inside the refresh
  // floor that normally drops a second refresh this soon.
  context.mock.timers.tick(700);
  const nextDay = shiftISODate(day, 1);
  assert.equal(toISODate(new Date()), nextDay);

  // A sleep refresh must not put the new day's aggregate beside yesterday's events.
  await store().refreshSleep();
  assert.equal(store().todayDate, day);
  assert.equal(store().todayAggregate, yesterdayAggregate);

  await store().refreshTodayData();
  assert.equal(store().todayDate, nextDay);
  assert.deepEqual(store().todayEvents, []);
  assert.equal(store().todayAggregate, null);
  assert.equal(store().todayDataUpdatedAt, revision, "nothing was written");

  // With the day unchanged the floor applies again: nothing is re-read.
  const before = store().lastUpdatedAt;
  context.mock.timers.tick(700);
  await store().refreshTodayData();
  assert.equal(store().lastUpdatedAt, before);
});

test("the rollover fires at each local midnight and on return to the foreground", (context) => {
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: LATE });
  let calls = 0;
  const stop = startDayRollover(() => {
    calls++;
  });

  context.mock.timers.tick(9_999);
  assert.equal(calls, 0);
  context.mock.timers.tick(1);
  assert.equal(calls, 1);
  context.mock.timers.tick(msUntilNextLocalDay(new Date()));
  assert.equal(calls, 2);

  setAppState("background");
  assert.equal(calls, 2);
  setAppState("active");
  assert.equal(calls, 3);

  stop();
  context.mock.timers.tick(msUntilNextLocalDay(new Date()));
  setAppState("active");
  assert.equal(calls, 3);
});

test("the next local day starts at local midnight", () => {
  const late = new Date(LATE);
  assert.equal(msUntilNextLocalDay(late), 10_000);
  const next = new Date(LATE + msUntilNextLocalDay(late));
  assert.equal(toISODate(next), "2026-09-16");
  assert.deepEqual([next.getHours(), next.getMinutes(), next.getSeconds()], [0, 0, 0]);
  assert.equal(msUntilNextLocalDay(next), msUntilNextLocalDay(new Date(next.getTime() + 1)) + 1);
});

test("a trend range ends on the day it is given", () => {
  assert.deepEqual(getDateRangeForTrendRange("7d", "2026-03-01"), {
    start: "2026-02-23",
    end: "2026-03-01",
  });
});

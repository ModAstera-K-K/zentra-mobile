import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createActiveRefreshMemory,
  MAX_RANGE_WALK_DAYS,
  refreshActiveMinutes,
} from "@/utils/active-minutes-refresh";
import { parseISODate, shiftISODate } from "@/utils/dates";
import {
  appendEventsForCollector,
  getDailyAggregateForDate,
} from "@/utils/event-repository";
import {
  insertEvents,
  openTestRepository,
  ordinaryDay,
  storedEvent,
} from "./repository-harness";
import { statementLog } from "./sqlite-adapter";

const END = "2026-09-30";
const back = (days: number) => shiftISODate(END, -days);
const noonOn = (date: string) => parseISODate(date).getTime() + 12 * 3_600_000;

test("an active-minutes refresh repeats only the days whose records changed", async () => {
  const adapter = await openTestRepository();
  insertEvents(adapter, [...ordinaryDay(back(1)), ...ordinaryDay(END)]);
  const memory = createActiveRefreshMemory();
  const run = async (start: string, signal = new AbortController().signal) => {
    const seen = { days: [] as string[], todayRefreshes: 0, updating: 0 };
    const from = statementLog.length;
    await refreshActiveMinutes({
      start,
      end: END,
      rangeMode: true,
      health: false,
      timezone: 0,
      signal,
      memory,
      onUpdating: () => seen.updating++,
      refreshToday: async () => {
        seen.todayRefreshes++;
      },
      // Stands in for the per-day work; the last day's aggregate is built for
      // real so there is a stored value to compare after the walk.
      refreshDay: async (day) => {
        seen.days.push(day);
        if (day === END) await getDailyAggregateForDate(day);
      },
    });
    return { ...seen, statements: statementLog.length - from };
  };
  const daysBack = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, index) => back(from + index));

  // The first request does everything: the last day, then each day before it.
  const first = await run(back(29));
  assert.deepEqual(first.days, [END, ...daysBack(1, 29)]);
  assert.deepEqual([first.updating, first.todayRefreshes], [1, 1]);

  const again = await run(back(29));
  assert.deepEqual(again, { days: [], todayRefreshes: 0, updating: 0, statements: 1 });

  // A wider range walks the days it adds and leaves today alone.
  const wider = await run(back(89));
  assert.deepEqual(wider.days, daysBack(30, 89));
  assert.deepEqual([wider.updating, wider.todayRefreshes], [1, 0]);

  // A narrower one has nothing left to do, and does not say it is updating.
  const narrower = await run(back(6));
  assert.deepEqual([narrower.days, narrower.updating, narrower.todayRefreshes], [[], 0, 0]);

  // New steps today: the last day only.
  await appendEventsForCollector(
    "steps",
    [storedEvent("steps-now", "steps", noonOn(END) + 60_000, { valueNumeric: 4_000 })],
    "Stored",
  );
  const afterToday = await run(back(89));
  assert.deepEqual(afterToday.days, [END]);
  assert.deepEqual([afterToday.updating, afterToday.todayRefreshes], [1, 1]);

  // Steps that arrive for ten days ago: the earlier days are walked again, and
  // today is re-read because its stored summary depended on them.
  await appendEventsForCollector(
    "steps",
    [storedEvent("steps-late", "steps", noonOn(back(10)), { valueNumeric: 2_500 })],
    "Stored",
  );
  const afterHistory = await run(back(89));
  assert.deepEqual(afterHistory.days, daysBack(1, 89));
  assert.deepEqual([afterHistory.updating, afterHistory.todayRefreshes], [1, 1]);

  // A custom range of a year walks no further back than the cap.
  const year = await run(back(365));
  assert.deepEqual(year.days, [back(MAX_RANGE_WALK_DAYS)]);
  assert.equal((await run(back(365))).statements, 1);

  // A cancelled request does nothing and remembers nothing.
  const cancelled = new AbortController();
  cancelled.abort();
  const fresh = createActiveRefreshMemory();
  await refreshActiveMinutes({
    start: back(6),
    end: END,
    rangeMode: true,
    health: false,
    timezone: 0,
    signal: cancelled.signal,
    memory: fresh,
    onUpdating: () => assert.fail("nothing to announce"),
    refreshToday: async () => assert.fail("nothing to re-read"),
    refreshDay: async () => assert.fail("no day to refresh"),
  });
  assert.deepEqual(fresh, createActiveRefreshMemory());
});

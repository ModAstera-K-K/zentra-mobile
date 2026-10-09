import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { useRepositoryStore } from "@/stores";
import { enumerateISODateRange, shiftISODate, toISODate } from "@/utils/dates";
import {
  appendEventsForCollector,
  getDailyAggregatesForRange,
} from "@/utils/event-repository";
import { createBatteryEvent } from "@/utils/live-event-builders";
import {
  insertEvents,
  openTestRepository,
  ordinaryDay,
} from "./repository-harness";
import { statementLog } from "./sqlite-adapter";

// 15:00 local time, so "today so far" is the same size wherever this runs.
const NOW = new Date(2026, 8, 15, 15, 0, 0).getTime();

/**
 * Statements sent to SQLite, and rows returned, by the paths that run most
 * often. Each expo-sqlite statement is several native calls on a phone, so
 * these are ceilings: lower them when a path gets cheaper, and treat a rise
 * as a regression to explain.
 */
const BUDGET = {
  bootstrap: { statements: 19, rows: 1825 },
  batteryWrite: { statements: 11, rows: 771 },
  refreshAfterWrite: { statements: 7, rows: 773 },
  refreshUnchanged: { statements: 1, rows: 1 },
  monthOfAggregatesFirstRead: { statements: 295, rows: 44403 },
  monthOfAggregates: { statements: 34, rows: 120 },
};

async function measure(task: () => Promise<unknown>) {
  const from = statementLog.length;
  await task();
  const issued = statementLog.slice(from);
  return {
    statements: issued.length,
    rows: issued.reduce((total, statement) => total + statement.rows, 0),
  };
}

function withinBudget(
  context: TestContext,
  name: keyof typeof BUDGET,
  actual: { statements: number; rows: number },
): void {
  context.diagnostic(`${name}: ${actual.statements} statements, ${actual.rows} rows`);
  assert.ok(
    actual.statements <= BUDGET[name].statements,
    `${name} issued ${actual.statements} statements; the budget is ${BUDGET[name].statements}`,
  );
  assert.ok(
    actual.rows <= BUDGET[name].rows,
    `${name} read ${actual.rows} rows; the budget is ${BUDGET[name].rows}`,
  );
}

test("hot repository paths stay within their statement budgets", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: NOW });
  const adapter = await openTestRepository();
  const today = toISODate(new Date());
  for (const date of enumerateISODateRange(
    shiftISODate(today, -30),
    shiftISODate(today, -1),
  ))
    insertEvents(adapter, ordinaryDay(date));
  insertEvents(adapter, ordinaryDay(today, NOW));

  const store = () => useRepositoryStore.getState();
  const batteryWrite = () =>
    appendEventsForCollector(
      "deviceState",
      [
        createBatteryEvent({
          batteryLevel: 0.8,
          batteryStateLabel: "Unplugged",
          lowPowerMode: false,
        }),
      ],
      "Battery snapshot refreshed",
    );

  withinBudget(context, "bootstrap", await measure(() => store().bootstrap()));

  // The first write of a session rebuilds caches; the second is the steady state.
  await batteryWrite();
  context.mock.timers.tick(15_000);
  withinBudget(context, "batteryWrite", await measure(batteryWrite));

  context.mock.timers.tick(2_000);
  withinBudget(
    context,
    "refreshAfterWrite",
    await measure(() => store().refreshTodayData()),
  );

  context.mock.timers.tick(2_000);
  withinBudget(
    context,
    "refreshUnchanged",
    await measure(() => store().refreshTodayData()),
  );

  const month = () => getDailyAggregatesForRange(shiftISODate(today, -29), today);
  withinBudget(context, "monthOfAggregatesFirstRead", await measure(month));
  withinBudget(context, "monthOfAggregates", await measure(month));
});

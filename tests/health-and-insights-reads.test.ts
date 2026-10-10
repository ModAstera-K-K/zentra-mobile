import { test } from "node:test";
import assert from "node:assert/strict";
import type { HealthSyncState } from "@/types/health-sync";
import { parseISODate, shiftISODate } from "@/utils/dates";
import { appendEventsForCollector } from "@/utils/event-repository";
import { startHealthSourcesPolling } from "@/utils/health-sources-poller";
import {
  getHealthSyncStates,
  getHealthSyncStatus,
} from "@/utils/health-sync-repository";
import { loadInsightEvidence } from "@/utils/insight-evidence";
import { loadPersonalInsights } from "@/utils/insight-repository";
import {
  insertEvents,
  openTestRepository,
  ordinaryDay,
  storedEvent,
} from "./repository-harness";
import { queryPlan, statementLog } from "./sqlite-adapter";

const TODAY = "2026-09-30";
const HOUR = 3_600_000;

async function count<T>(task: () => Promise<T>) {
  const from = statementLog.length;
  const result = await task();
  const issued = statementLog.slice(from);
  return {
    issued,
    result,
    rows: issued.reduce((total, statement) => total + statement.rows, 0),
    statements: issued.length,
  };
}

test("health import state is read without counting the imported records", async (context) => {
  const adapter = await openTestRepository();
  const day = parseISODate(shiftISODate(TODAY, -3)).getTime();
  insertEvents(
    adapter,
    Array.from({ length: 600 }, (_, index) =>
      storedEvent(`heart-${index}`, "heart_rate", day + index * 60_000, {
        source: "health_connect",
        valueNumeric: 60 + (index % 30),
        unit: "bpm",
        metadata: { record_id: `heart-${index}` },
      }),
    ),
  );
  const saveState = adapter.db.prepare(
    `INSERT INTO health_sync_state(record_type,history_days,status,updated_at,start_at,end_at)
     VALUES(?,30,?,?,?,?)`,
  );
  const from = new Date(day - 30 * 24 * HOUR).toISOString();
  const until = new Date(day + 3 * 24 * HOUR).toISOString();
  // Stored out of order: the readers return them by record type.
  for (const type of ["steps", "heart_rate", "sleep", "exercise_session"])
    saveState.run(type, type === "sleep" ? "importing" : "ready", until, from, until);

  const status = await count(getHealthSyncStatus);
  const counted = await count(getHealthSyncStates);
  context.diagnostic(
    `status: ${status.statements} statement, ${status.rows} rows; with counts: ${counted.statements} statement over ${adapter.db.prepare("SELECT COUNT(*) AS n FROM events").get()?.n} events`,
  );

  assert.deepEqual({ statements: status.statements, rows: status.rows }, { statements: 1, rows: 4 });
  assert.ok(
    queryPlan(adapter.db, status.issued[0]).every((step) => !step.includes("events")),
    "the status read does not touch the events table",
  );
  const withoutCounts = (row: HealthSyncState) => {
    const { record_count, observed_start, observed_end, ...state } = row;
    void record_count, observed_start, observed_end;
    return state;
  };
  assert.deepEqual(
    status.result.map((row) => ({ ...row })),
    counted.result.map(withoutCounts),
    "the same rows, in the same order, as the counting read",
  );
  assert.equal(
    counted.result.find((row) => row.record_type === "heart_rate")?.record_count,
    600,
  );
});

test("the Health sources card counts records only when a finished import changed something", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const row = (record_type: string, status: string, updated_at = "t0") =>
    ({ record_type, status, updated_at, message: null, cursor: null, history_days: 30, start_at: null, end_at: null }) as HealthSyncState;
  let rows = [row("heart_rate", "ready"), row("steps", "ready")];
  const calls = { status: 0, counts: 0 };
  const shown: HealthSyncState[][] = [];
  let holdStatus: (() => void) | null = null;
  const stop = startHealthSourcesPolling({
    onError: () => assert.fail("no read fails here"),
    onStates: (states) => shown.push(states),
    readCounts: async () => {
      calls.counts++;
      return rows.map((state) => ({ ...state, record_count: 10 * calls.counts }));
    },
    readStatus: async () => {
      calls.status++;
      if (holdStatus === null) return rows;
      await new Promise<void>((resolve) => (holdStatus = resolve));
      return rows;
    },
  });
  const settle = async () => {
    for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setImmediate(resolve));
  };
  const tick = async () => {
    context.mock.timers.tick(2000);
    await settle();
  };

  await settle();
  assert.deepEqual(calls, { status: 1, counts: 1 }, "counted once at the start");

  await tick();
  await tick();
  assert.deepEqual(calls, { status: 3, counts: 1 }, "an unchanged status is not recounted");
  assert.equal(shown.at(-1)?.[0].record_count, 10, "the last counts stay on the rows");

  // An import starts and saves pages: the status changes, but nothing is
  // counted while it runs.
  rows = [row("heart_rate", "importing", "t1"), row("steps", "ready")];
  await tick();
  rows = [row("heart_rate", "importing", "t2"), row("steps", "ready")];
  await tick();
  assert.deepEqual(calls, { status: 5, counts: 1 });
  assert.equal(shown.at(-1)?.[0].status, "importing", "the status shown is current");
  assert.equal(shown.at(-1)?.[0].record_count, 10);

  rows = [row("heart_rate", "ready", "t3"), row("steps", "ready")];
  await tick();
  assert.deepEqual(calls, { status: 6, counts: 2 }, "counted once the import has finished");
  assert.equal(shown.at(-1)?.[0].record_count, 20);
  await tick();
  assert.deepEqual(calls, { status: 7, counts: 2 });

  // A read that takes longer than the interval is not overlapped by another.
  holdStatus = () => undefined;
  await tick();
  assert.equal(calls.status, 8);
  await tick();
  await tick();
  assert.equal(calls.status, 8, "the next read waits for the one in progress");
  const release = holdStatus;
  holdStatus = null;
  release();
  await settle();
  await tick();
  assert.equal(calls.status, 9);

  stop();
  await tick();
  assert.equal(calls.status, 9, "stopped");
});

test("insights are rebuilt only when something they read has changed", async (context) => {
  const adapter = await openTestRepository();
  for (let back = 15; back >= 0; back--)
    insertEvents(adapter, ordinaryDay(shiftISODate(TODAY, -back)));
  const cacheRows = () =>
    adapter.db
      .prepare("SELECT cache_key FROM derived_cache WHERE cache_key LIKE 'observations-v1:%' ORDER BY cache_key")
      .all()
      .map((row) => String(row.cache_key).split(":")[1]);
  adapter.db
    .prepare("INSERT INTO derived_cache(cache_key,revision,payload) VALUES(?,0,'[]')")
    .run(`observations-v1:${shiftISODate(TODAY, -20)}:0:[]`);

  const first = await count(() => loadPersonalInsights(TODAY, "first"));
  const again = await count(() => loadPersonalInsights(TODAY, "second"));
  context.diagnostic(
    `first load: ${first.statements} statements, ${first.rows} rows; unchanged: ${again.statements} statements, ${again.rows} rows`,
  );
  assert.equal(again.statements, 2);
  assert.equal(again.result, first.result, "the last result is handed back");

  // Fourteen days are kept, and the row for a day outside the window is gone.
  assert.deepEqual(
    cacheRows(),
    Array.from({ length: 14 }, (_, index) => shiftISODate(TODAY, index - 14)),
  );

  // A day of app usage has more than 50 sessions: 50 ids are stored, and the
  // evidence view still reports them all.
  const usage = first.result.find((insight) => insight.metric === "usage");
  const day = usage?.observations.at(-1);
  assert.equal(day?.recordIds.length, 50);
  assert.equal(day?.recordCount, 144);
  const evidence = await loadInsightEvidence(usage!);
  assert.match(
    String(evidence.facts.at(-1)?.value),
    new RegExp(`^Showing 50 of ${14 * 144} records`),
  );

  // A record stored today is outside the 14 days the comparison reads.
  const todayNoon = parseISODate(TODAY).getTime() + 12 * HOUR;
  await appendEventsForCollector(
    "appUsage",
    [storedEvent("unlock-today", "unlock_event", todayNoon, { source: "usage_stats" })],
    "Stored",
  );
  assert.equal((await count(() => loadPersonalInsights(TODAY, "third"))).statements, 2);

  // One stored inside them is not.
  await appendEventsForCollector(
    "appUsage",
    [
      storedEvent("usage-late", "app_usage", todayNoon - 3 * 24 * HOUR, {
        source: "usage_stats",
        timestampEnd: new Date(todayNoon - 3 * 24 * HOUR + 600_000).toISOString(),
        valueNumeric: 600,
        unit: "seconds",
      }),
    ],
    "Stored",
  );
  const changed = await count(() => loadPersonalInsights(TODAY, "fourth"));
  assert.ok(changed.statements > 2);
  assert.notEqual(changed.result, first.result);
  const before = first.result.find((insight) => insight.metric === "usage")!;
  const after = changed.result.find((insight) => insight.metric === "usage")!;
  const valueOn = (insight: typeof before, date: string) =>
    insight.observations.find((observation) => observation.date === date)?.value;
  const changedDay = shiftISODate(TODAY, -3);
  assert.equal(valueOn(after, changedDay)! - valueOn(before, changedDay)!, 10);

  // So is a change to the health import state.
  adapter.db
    .prepare("INSERT INTO health_sync_state(record_type,history_days,status) VALUES('distance',30,'ready')")
    .run();
  assert.ok((await count(() => loadPersonalInsights(TODAY, "fifth"))).statements > 2);
});

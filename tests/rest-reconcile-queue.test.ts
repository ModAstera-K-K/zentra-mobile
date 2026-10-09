import { test } from "node:test";
import assert from "node:assert/strict";
import { enqueueDatabaseOperation } from "@/utils/event-repository";
import { invalidateRepositorySession } from "@/utils/repository-session";
import {
  loadSleepSummaryEvent,
  reconcileRestEstimates,
  saveRestAdjustment,
} from "@/utils/rest-repository";
import { insertEvents, openTestRepository } from "./repository-harness";
import { restNow, stillNight } from "./rest-fixtures";
import { statementLog } from "./sqlite-adapter";

const WAKE_DATE = "2026-09-30";
const AUTOMATIC_ID = `rest-inferred-v2-${WAKE_DATE}`;

const isEvidenceRead = (sql: string) =>
  sql.includes("FROM events WHERE timestamp_start >= ? AND timestamp_start <= ?");
const isCommit = (sql: string) => sql === "BEGIN IMMEDIATE";

// The tests share one database and run in order: each builds on the night the
// one before it stored.
test("the rest reconcile holds the database queue only for its read and its commit", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: restNow().getTime() });
  const adapter = await openTestRepository();
  insertEvents(adapter, stillNight());

  const from = statementLog.length;
  const first = reconcileRestEstimates();
  const second = reconcileRestEstimates();
  // Queued straight after: it waits for the read, not for the whole reconcile.
  const between = enqueueDatabaseOperation(async () => {
    await adapter.getFirstAsync("SELECT 'between' AS marker");
  });
  assert.equal(second, first, "a call made while one is running shares that run");
  assert.equal(await first, 1);
  await between;

  const issued = statementLog.slice(from).map((statement) => statement.sql);
  const read = issued.findIndex(isEvidenceRead);
  const marker = issued.findIndex((sql) => sql.includes("'between'"));
  const commit = issued.findIndex(isCommit);
  assert.ok(read >= 0 && read < marker, "the evidence is read first");
  assert.ok(marker < commit, "another operation ran before the commit");
  assert.equal(issued.filter(isEvidenceRead).length, 1);
  assert.equal(issued.filter(isCommit).length, 1);

  assert.equal((await loadSleepSummaryEvent(WAKE_DATE))?.id, AUTOMATIC_ID);
  assert.equal((await loadSleepSummaryEvent(WAKE_DATE))?.valueNumeric, 480);

  // The run has ended, so this is a new one. Same evidence: nothing is written.
  const again = statementLog.length;
  assert.equal(await reconcileRestEstimates(), 1);
  const rerun = statementLog.slice(again);
  assert.equal(rerun.filter((statement) => isEvidenceRead(statement.sql)).length, 1);
  assert.deepEqual(
    rerun.filter((statement) => statement.method === "run").map((statement) => statement.sql),
    [],
  );
});

test("an adjustment saved while rest is being inferred is kept", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: restNow().getTime() });
  const adapter = await openTestRepository();
  const stored = (id: string) =>
    adapter.db
      .prepare("SELECT value_numeric AS minutes, metadata FROM events WHERE id = ?")
      .get(id);

  // Later evidence: the night ended an hour earlier than first stored.
  adapter.db.exec("DELETE FROM events WHERE data_type = 'activity'");
  insertEvents(adapter, stillNight(undefined, "2026-09-30T06:00:00"));

  const from = statementLog.length;
  const reconcile = reconcileRestEstimates();
  const adjustment = saveRestAdjustment(WAKE_DATE, "2026-09-29 23:30", "2026-09-30 06:45");
  assert.equal(await reconcile, 1);
  await adjustment;

  const issued = statementLog.slice(from).map((statement) => statement.sql);
  const saved = issued.findIndex((sql) => sql.includes("INSERT INTO events"));
  assert.ok(
    saved >= 0 && saved < issued.findIndex(isCommit),
    "the adjustment was stored before the reconcile committed",
  );

  assert.equal(stored(AUTOMATIC_ID)?.minutes, 420);
  const adjusted = stored(`rest-adjusted-${WAKE_DATE}`);
  assert.equal(adjusted?.minutes, 435);
  assert.equal(JSON.parse(String(adjusted?.metadata)).stale_import, undefined);
  assert.equal((await loadSleepSummaryEvent(WAKE_DATE))?.id, `rest-adjusted-${WAKE_DATE}`);
});

test("a repository cleared while rest is being inferred is not written to", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: restNow().getTime() });
  const adapter = await openTestRepository();
  const automaticMinutes = () =>
    adapter.db.prepare("SELECT value_numeric AS minutes FROM events WHERE id = ?").get(AUTOMATIC_ID)
      ?.minutes;

  adapter.db.exec("DELETE FROM events WHERE data_type = 'activity'");
  insertEvents(adapter, stillNight(undefined, "2026-09-30T05:00:00"));

  const reconcile = reconcileRestEstimates();
  const cleared = enqueueDatabaseOperation(async () => invalidateRepositorySession());
  await assert.rejects(reconcile, /Repository was cleared/);
  await cleared;
  assert.equal(automaticMinutes(), 420);

  // The failed run is not left in place: the next call starts a new one.
  assert.equal(await reconcileRestEstimates(), 1);
  assert.equal(automaticMinutes(), 360);
});

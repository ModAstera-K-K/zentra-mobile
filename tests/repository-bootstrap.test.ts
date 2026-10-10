import { test } from "node:test";
import assert from "node:assert/strict";
import { useRepositoryStore } from "@/stores";
import {
  loadPersistedRepositoryMeta,
  savePersistedRepositoryMeta,
  type PersistedRepositoryMeta,
} from "@/utils/app-storage";
import { hasStoredEvents } from "@/utils/event-repository";
import { insertEvents, openTestRepository, storedEvent } from "./repository-harness";
import { statementLog } from "./sqlite-adapter";
import { failNextOpen, openCount } from "./stubs/expo-sqlite";

const store = () => useRepositoryStore.getState();

test("bootstrap keeps earlier diagnostics, reports a failure and can be retried", async () => {
  // What an earlier run recorded, saved before this process started.
  const earlier = {
    lastBackgroundTaskSuccessAt: "2026-09-14T03:00:00.000Z",
    lastBufferedActivityCursor: 999,
    bufferedActivityQueueDepth: 0,
  } as PersistedRepositoryMeta;
  await savePersistedRepositoryMeta(earlier);

  // A background run that fails before the store has loaded must add its
  // failure to that record, not replace the record with empty defaults.
  await store().noteBackgroundTaskFailure("reconcile failed");
  const merged = await loadPersistedRepositoryMeta();
  assert.equal(merged?.lastBackgroundTaskSuccessAt, earlier.lastBackgroundTaskSuccessAt);
  assert.equal(merged?.lastBufferedActivityCursor, 999);
  assert.equal(merged?.lastBackgroundTaskFailureMessage, "reconcile failed");

  // The database cannot be opened: the failure is kept for the screen to show.
  failNextOpen("file is not a database");
  await assert.rejects(store().bootstrap(), /file is not a database/);
  assert.equal(store().isHydrated, false);
  assert.equal(store().bootstrapError, "file is not a database");

  // A retry, asked for twice at once, opens the database and reads once.
  const opensBefore = openCount;
  const from = statementLog.length;
  await Promise.all([store().bootstrap(), store().bootstrap()]);
  assert.equal(openCount - opensBefore, 1);
  assert.equal(store().isHydrated, true);
  assert.equal(store().bootstrapError, null);
  assert.equal(store().lastBackgroundTaskSuccessAt, earlier.lastBackgroundTaskSuccessAt);
  assert.equal(store().lastBufferedActivityCursor, 999);
  assert.equal(store().lastBackgroundTaskFailureMessage, "reconcile failed");
  const reads = statementLog.slice(from).filter((statement) => statement.method !== "exec");
  const firstBootstrapReads = reads.length;

  // Once loaded, bootstrap is a no-op.
  await store().bootstrap();
  assert.equal(statementLog.slice(from).filter((statement) => statement.method !== "exec").length, firstBootstrapReads);
});

test("the seed check stops at the first stored event", async () => {
  const adapter = await openTestRepository();
  assert.equal(await hasStoredEvents(), false);
  insertEvents(adapter, [storedEvent("one", "steps", Date.now(), { valueNumeric: 1 })]);
  assert.equal(await hasStoredEvents(), true);
});

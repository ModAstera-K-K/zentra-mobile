import { test } from "node:test";
import assert from "node:assert/strict";
import { collectorRunAfter } from "@/utils/collector-start-gate";

test("collectors start once, and again only after a start failed without the database", () => {
  const held = { run: 0, startedBeforeLoad: false, startFailed: false };
  // Either the stored data loads or the wait runs out: whichever is first.
  assert.equal(collectorRunAfter("repositoryLoaded", held), 1);
  assert.equal(collectorRunAfter("waitedLongEnough", held), 1);

  // Started normally: nothing later restarts them, whatever fails.
  assert.equal(collectorRunAfter("repositoryLoaded", { run: 1, startedBeforeLoad: false, startFailed: true }), 1);
  assert.equal(collectorRunAfter("waitedLongEnough", { run: 1, startedBeforeLoad: false, startFailed: false }), 1);

  // Started by the wait while the data was only slow to load: no restart.
  assert.equal(collectorRunAfter("repositoryLoaded", { run: 1, startedBeforeLoad: true, startFailed: false }), 1);

  // Started by the wait, a start failed, and the data loaded after a retry.
  assert.equal(collectorRunAfter("repositoryLoaded", { run: 1, startedBeforeLoad: true, startFailed: true }), 2);
  assert.equal(collectorRunAfter("repositoryLoaded", { run: 2, startedBeforeLoad: false, startFailed: false }), 2);
});

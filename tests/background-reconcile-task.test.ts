import { test } from "node:test";
import assert from "node:assert/strict";
import { useAppStore, useRepositoryStore } from "@/stores";
import { ZENTRA_BACKGROUND_RECONCILE_TASK } from "@/utils/background/reconcile-task";
import { BackgroundTaskResult } from "./stubs/expo-background-task";
import { startTask } from "./stubs/expo-task-manager";

test("a background reconcile started while one is running joins it", async () => {
  await useAppStore.getState().bootstrap();
  // No collectors: what is left is the bookkeeping every reconcile does.
  const { collectors } = useAppStore.getState();
  useAppStore.setState({
    collectors: Object.fromEntries(
      Object.entries(collectors).map(([key, collector]) => [
        key,
        { ...collector, enabled: false },
      ]),
    ) as typeof collectors,
  });

  const calls = { starts: 0, failNextStart: false };
  const { noteReconcileStart } = useRepositoryStore.getState();
  useRepositoryStore.setState({
    noteReconcileStart: async (trigger) => {
      calls.starts++;
      if (calls.failNextStart) {
        calls.failNextStart = false;
        throw new Error("storage unavailable");
      }
      await noteReconcileStart(trigger);
    },
  });
  const start = () => startTask(ZENTRA_BACKGROUND_RECONCILE_TASK);

  const first = start();
  const second = start();
  assert.equal(second, first);
  assert.equal(await first, BackgroundTaskResult.Success);
  assert.equal(calls.starts, 1);
  const state = useRepositoryStore.getState();
  assert.equal(state.lastReconcileTrigger, "backgroundTask");
  assert.equal(state.lastReconcileOutcome, "success");
  assert.ok(state.lastBackgroundTaskSuccessAt);

  // That run has ended, so the next start is a run of its own.
  assert.equal(await start(), BackgroundTaskResult.Success);
  assert.equal(calls.starts, 2);

  // A failed run is reported and does not stay in place of the next one.
  calls.failNextStart = true;
  assert.equal(await start(), BackgroundTaskResult.Failed);
  assert.equal(
    useRepositoryStore.getState().lastBackgroundTaskFailureMessage,
    "storage unavailable",
  );
  assert.equal(await start(), BackgroundTaskResult.Success);
  assert.equal(calls.starts, 4);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { useSignalStore } from "@/stores";
import { loadPersistedSignalState } from "@/utils/app-storage";
import { setAppState } from "./stubs/react-native";

const NOW = new Date(2026, 8, 15, 15, 0, 0).getTime();

test("the signal store ignores unchanged readings and saves once after a burst", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const store = () => useSignalStore.getState();
  const saved = async () => {
    // Let a save that has started reach storage.
    for (let turn = 0; turn < 3; turn++)
      await new Promise((resolve) => setImmediate(resolve));
    return loadPersistedSignalState();
  };
  let notifications = 0;
  context.after(useSignalStore.subscribe(() => notifications++));
  await store().bootstrap();
  notifications = 0;

  await store().setStepCount(10);
  assert.equal(notifications, 1);
  assert.equal((await saved())?.stepCount ?? null, null, "nothing is saved straight away");
  context.mock.timers.tick(4_999);
  assert.equal((await saved())?.stepCount ?? null, null);
  context.mock.timers.tick(1);
  assert.equal((await saved())?.stepCount, 10);

  // The same reading again: no update for subscribers, nothing scheduled.
  await store().setStepCount(10);
  await store().setBatterySupport(true);
  await store().setBatterySupport(true);
  assert.equal(notifications, 2);

  // A burst is saved once, with the last value.
  context.mock.timers.tick(5_000);
  await saved();
  for (const count of [11, 12, 13]) {
    await store().setStepCount(count);
    context.mock.timers.tick(300);
  }
  assert.equal((await saved())?.stepCount, 10);
  context.mock.timers.tick(5_000);
  assert.equal((await saved())?.stepCount, 13);

  // Leaving the foreground saves at once: the timer may not fire there.
  await store().setAmbientLightLux(320);
  assert.equal((await saved())?.ambientLightLux ?? null, null);
  setAppState("background");
  assert.equal((await saved())?.ambientLightLux, 320);
  setAppState("active");

  // A wipe is saved immediately, and cancels a save that was pending.
  await store().setStepCount(99);
  await store().clearCapturedData();
  assert.equal((await saved())?.stepCount ?? null, null);
  context.mock.timers.tick(10_000);
  assert.equal((await saved())?.stepCount ?? null, null);
});

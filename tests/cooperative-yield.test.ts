import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  afterRender,
  runCooperatively,
  yieldToEventLoop,
} from "@/utils/cooperative-work";
import { setAppState } from "./stubs/react-native";

type IdleGlobals = {
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
};
const idleGlobals = globalThis as unknown as IdleGlobals;

/** Timers that never fire, as on Android once the app is no longer visible. */
function freezeTimers(context: TestContext): void {
  context.mock.timers.enable({ apis: ["setTimeout"] });
}

/** An idle callback as React Native provides one: not driven by timers. */
function provideIdleCallbacks(context: TestContext): void {
  const pending = new Map<number, ReturnType<typeof setImmediate>>();
  let next = 1;
  idleGlobals.requestIdleCallback = (callback) => {
    const handle = next++;
    pending.set(handle, setImmediate(callback));
    return handle;
  };
  idleGlobals.cancelIdleCallback = (handle) => {
    const scheduled = pending.get(handle);
    if (scheduled !== undefined) clearImmediate(scheduled);
  };
  context.after(() => {
    delete idleGlobals.requestIdleCallback;
    delete idleGlobals.cancelIdleCallback;
  });
}

async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  for (let turn = 0; turn < 3; turn++)
    await new Promise((resolve) => setImmediate(resolve));
  return done;
}

function* slowSteps(count: number): Generator<void, number> {
  for (let step = 0; step < count; step++) {
    const until = performance.now() + 3;
    while (performance.now() < until);
    yield;
  }
  return count;
}

test("sliced work completes on idle callbacks when timers never fire", async (context) => {
  freezeTimers(context);
  provideIdleCallbacks(context);
  // 10 steps of 3 ms: several 8 ms slices, so several yields.
  assert.equal(await runCooperatively(slowSteps(10)), 10);
});

test("outside the foreground a yield does not wait for anything", async (context) => {
  freezeTimers(context);
  setAppState("background");
  context.after(() => setAppState("active"));
  assert.equal(await settled(yieldToEventLoop()), true);
  assert.equal(await runCooperatively(slowSteps(10)), 10);
});

test("a yield waiting on a timer is released when the app leaves the foreground", async (context) => {
  freezeTimers(context);
  const waiting = yieldToEventLoop();
  assert.equal(await settled(waiting), false);
  setAppState("background");
  context.after(() => setAppState("active"));
  assert.equal(await settled(waiting), true);
});

test("afterRender runs its task after a yield, unless it was cancelled", async (context) => {
  provideIdleCallbacks(context);
  let ran = 0;
  afterRender(() => ran++);
  assert.equal(ran, 0, "not within the same turn");
  afterRender(() => ran++).cancel();
  await settled(Promise.resolve());
  assert.equal(ran, 1);
});

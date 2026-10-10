import { AppState } from "react-native";

import { recordLocalDuration } from "@/utils/perf";

// Yields that are waiting, so the app leaving the foreground can release
// them: timers may never fire once it is no longer visible.
const waiting = new Set<() => void>();

AppState.addEventListener("change", (state) => {
  if (state === "active") return;
  for (const release of [...waiting]) release();
});

/**
 * Hand the thread back to input and rendering, then carry on.
 *
 * In the foreground this resolves on whichever comes first of an idle
 * callback and a zero-delay timer. The timer alone waits for the next frame,
 * and an idle callback alone can be starved by other work. Outside the
 * foreground it does not wait: nothing on screen needs the thread, and on
 * Android a timer started there would not fire until the app is reopened.
 */
export function yieldToEventLoop(): Promise<void> {
  if (AppState.currentState !== "active") return Promise.resolve();
  return new Promise((resolve) => {
    function release(): void {
      if (!waiting.delete(release)) return;
      clearTimeout(timer);
      if (idle !== null) cancelIdleCallback(idle);
      resolve();
    }
    waiting.add(release);
    const idle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(release)
        : null;
    const timer = setTimeout(release, 0);
  });
}

/**
 * Run `task` once the work already queued, such as the frame being rendered,
 * has had its turn. The handle cancels a task that has not started.
 */
export function afterRender(task: () => void): { cancel: () => void } {
  let cancelled = false;
  void yieldToEventLoop().then(() => {
    if (!cancelled) task();
  });
  return {
    cancel: () => {
      cancelled = true;
    },
  };
}

/** Run resumable CPU work without monopolizing the React Native JS thread. */
export async function runCooperatively<T>(
  work: Generator<void, T>,
  signal?: AbortSignal,
): Promise<T> {
  let started = performance.now();
  while (true) {
    if (signal?.aborted) throw new Error("Work cancelled");
    const before = performance.now();
    const next = work.next();
    const duration = performance.now() - before;
    if (duration > 8) recordLocalDuration("compute.over_budget_step", duration);
    if (next.done) return next.value;
    if (performance.now() - started >= 8) {
      await yieldToEventLoop();
      started = performance.now();
    }
  }
}

/**
 * For async loops that are not generators: await the returned function between
 * items and it yields only once the current time slice is spent.
 */
export function createCooperativeYield(): () => Promise<void> {
  let started = performance.now();
  return async () => {
    if (performance.now() - started < 8) return;
    await yieldToEventLoop();
    started = performance.now();
  };
}

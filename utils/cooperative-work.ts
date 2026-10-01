import { recordLocalDuration } from "@/utils/perf";
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
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
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
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    started = performance.now();
  };
}

import type { ActivityHistory } from "@/utils/activity-cache-loader";

export interface ActivityCacheSessionOptions {
  load(
    signal: AbortSignal,
    onProgress: (history: ActivityHistory) => void,
  ): Promise<ActivityHistory>;
  /**
   * Each report of a pass, then its result. `revision` is the one the pass
   * started from; its content is at least that new.
   */
  onHistory(history: ActivityHistory, revision: string, final: boolean): void;
  onLoading?(loading: boolean): void;
  onError(error: unknown): void;
  /** Quiet time required before a follow-up pass, so a burst of writes costs one pass. */
  settleMs?: number;
  /** Longest a follow-up waits for quiet while writes keep arriving. */
  maxSettleMs?: number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface ActivityCacheSession {
  /** Report the stored history's current revision; a new one schedules a pass. */
  noteRevision(revision: string): void;
  stop(): void;
}

const DEFAULT_SETTLE_MS = 1_500;
const DEFAULT_MAX_SETTLE_MS = 9_000;

function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

/**
 * Keeps one history load going for a screen. A pass is never cancelled because
 * the data moved: a collector reconcile writes past days in bursts, and
 * restarting on each one starved the load for as long as the writes lasted.
 * Passes are cheap to repeat instead, because each one only scores the days
 * whose revision moved, so a revision that arrives mid-pass just queues one
 * more pass once the writes pause (or after `maxSettleMs` if they never do).
 */
export function startActivityCacheSession(
  options: ActivityCacheSessionOptions,
): ActivityCacheSession {
  const controller = new AbortController();
  const { signal } = controller;
  const wait = options.wait ?? waitFor;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const maxSettleMs = options.maxSettleMs ?? DEFAULT_MAX_SETTLE_MS;
  let latest: string | null = null;
  let handled: string | null = null;
  let running = false;

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (!signal.aborted && latest !== null && latest !== handled) {
        // The first pass paints the screen at once. A later one follows writes,
        // so it waits until they pause: rescoring a day between every burst of
        // a long import would repeat the same work many times over.
        if (handled !== null) {
          for (let waited = 0; waited < maxSettleMs; waited += settleMs) {
            const seen: string | null = latest;
            await wait(settleMs, signal);
            if (signal.aborted) return;
            if (latest === seen) break;
          }
        }
        const revision = latest;
        if (revision === null) return;
        options.onLoading?.(true);
        try {
          const history = await options.load(signal, (progress) => {
            if (!signal.aborted) options.onHistory(progress, revision, false);
          });
          if (signal.aborted) return;
          options.onHistory(history, revision, true);
        } catch (error) {
          if (signal.aborted) return;
          options.onError(error);
        }
        // A failed pass is not retried in a loop: the next revision or an
        // explicit retry (a new session) tries again.
        handled = revision;
        options.onLoading?.(false);
      }
    } finally {
      running = false;
    }
  }

  return {
    noteRevision(revision) {
      if (signal.aborted) return;
      latest = revision;
      void run();
    },
    stop() {
      controller.abort();
    },
  };
}

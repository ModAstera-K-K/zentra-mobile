type PerfValue = string | number | boolean | null | undefined;

type PerfContext = Record<string, PerfValue>;

interface PerfAggregate {
  count: number;
  lastMs: number;
  maxMs: number;
  minMs: number;
  totalMs: number;
}

const perfAggregates = new Map<string, PerfAggregate>();
const SUMMARY_LOG_EVERY = 10;

function shouldLogPerf(): boolean {
  return typeof __DEV__ !== "undefined" ? __DEV__ : false;
}

function nowMs(): number {
  if (
    typeof globalThis.performance !== "undefined" &&
    typeof globalThis.performance.now === "function"
  ) {
    return globalThis.performance.now();
  }

  return Date.now();
}

function formatDuration(durationMs: number): string {
  return `${durationMs.toFixed(1)}ms`;
}

function recordPerfSample(label: string, durationMs: number): void {
  const previous = perfAggregates.get(label);

  if (!previous) {
    perfAggregates.set(label, {
      count: 1,
      lastMs: durationMs,
      maxMs: durationMs,
      minMs: durationMs,
      totalMs: durationMs,
    });
    return;
  }

  const next: PerfAggregate = {
    count: previous.count + 1,
    lastMs: durationMs,
    maxMs: Math.max(previous.maxMs, durationMs),
    minMs: Math.min(previous.minMs, durationMs),
    totalMs: previous.totalMs + durationMs,
  };

  perfAggregates.set(label, next);

  if (next.count % SUMMARY_LOG_EVERY !== 0) {
    return;
  }

  // eslint-disable-next-line no-console
  console.info("[perf-summary:auto]", {
    avgMs: Number((next.totalMs / next.count).toFixed(1)),
    count: next.count,
    label,
    lastMs: Number(next.lastMs.toFixed(1)),
    maxMs: Number(next.maxMs.toFixed(1)),
    minMs: Number(next.minMs.toFixed(1)),
  });
}

export function getPerfSummarySnapshot(): Record<
  string,
  {
    avgMs: number;
    count: number;
    lastMs: number;
    maxMs: number;
    minMs: number;
  }
> {
  const snapshot: Record<
    string,
    {
      avgMs: number;
      count: number;
      lastMs: number;
      maxMs: number;
      minMs: number;
    }
  > = {};

  for (const [label, stats] of perfAggregates.entries()) {
    snapshot[label] = {
      avgMs: Number((stats.totalMs / stats.count).toFixed(1)),
      count: stats.count,
      lastMs: Number(stats.lastMs.toFixed(1)),
      maxMs: Number(stats.maxMs.toFixed(1)),
      minMs: Number(stats.minMs.toFixed(1)),
    };
  }

  return snapshot;
}

export function logPerfSummary(tag = "manual"): void {
  if (!shouldLogPerf()) {
    return;
  }

  // eslint-disable-next-line no-console
  console.info(`[perf-summary:${tag}]`, getPerfSummarySnapshot());
}

export function startPerfTimer(label: string, context: PerfContext = {}) {
  if (!shouldLogPerf()) {
    return (_endContext: PerfContext = {}) => undefined;
  }

  const start = nowMs();

  return (endContext: PerfContext = {}) => {
    const durationMs = nowMs() - start;
    recordPerfSample(label, durationMs);

    const payload = {
      ...context,
      ...endContext,
      durationMs: Number(durationMs.toFixed(1)),
    };

    // eslint-disable-next-line no-console
    console.info(`[perf] ${label} ${formatDuration(durationMs)}`, payload);
  };
}

export function timeSyncOperation<T>(
  label: string,
  operation: () => T,
  context: PerfContext = {},
): T {
  const stop = startPerfTimer(label, context);

  try {
    return operation();
  } finally {
    stop();
  }
}

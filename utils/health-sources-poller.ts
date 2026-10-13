import type { HealthSyncState } from "@/types/health-sync";

const POLL_MS = 2000;

function statusKey(rows: HealthSyncState[]): string {
  return JSON.stringify(
    rows.map((row) => [
      row.record_type,
      row.status,
      row.message,
      row.updated_at,
      row.start_at,
      row.end_at,
    ]),
  );
}

/**
 * Keeps the Health sources card current. The status rows are cheap and are
 * read every two seconds, each read scheduled after the last one returns. The
 * record counts read every imported record, so they are read once at the
 * start and again only after a status has changed and no import is running.
 */
export function startHealthSourcesPolling(options: {
  readStatus: () => Promise<HealthSyncState[]>;
  readCounts: () => Promise<HealthSyncState[]>;
  onStates: (states: HealthSyncState[]) => void;
  onError: () => void;
  pollMs?: number;
}): () => void {
  const { readStatus, readCounts, onStates, onError } = options;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let counted: HealthSyncState[] = [];
  let countedKey: string | null = null;

  async function tick(): Promise<void> {
    try {
      const rows = await readStatus();
      if (stopped) return;
      const key = statusKey(rows);
      const importing = rows.some((row) => row.status === "importing");
      if (countedKey === null || (key !== countedKey && !importing)) {
        counted = await readCounts();
        if (stopped) return;
        // The counts are from now, which may be a status later than `rows`.
        countedKey = statusKey(counted);
        onStates(counted);
      } else {
        const counts = new Map(counted.map((row) => [row.record_type, row]));
        onStates(
          rows.map((row) => {
            const last = counts.get(row.record_type);
            return {
              ...row,
              record_count: last?.record_count,
              observed_start: last?.observed_start,
              observed_end: last?.observed_end,
            };
          }),
        );
      }
    } catch {
      if (!stopped) onError();
    }
    if (!stopped) timer = setTimeout(() => void tick(), options.pollMs ?? POLL_MS);
  }

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

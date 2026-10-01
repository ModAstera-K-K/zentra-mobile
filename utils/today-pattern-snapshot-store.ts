import type {
  ActivityNormalizationWindow,
  ActivityPatternCell,
  ActivityScoreMaxima,
} from "@/types/zentra";
import { repositoryEpoch } from "@/utils/repository-session";

/**
 * Last pattern and normalization the Today screen finished computing. Shown
 * immediately on the next open of the same day while fresh values compute;
 * it is a display cache only and never feeds stored data.
 */
export interface TodayPatternSnapshot {
  anchor: string;
  cells: ActivityPatternCell[];
  maxima: ActivityScoreMaxima;
  window: ActivityNormalizationWindow;
}

export interface SnapshotStorage {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
}

const TODAY_PATTERN_SNAPSHOT_KEY = "zentra-today-pattern-v1";

/**
 * Every read and write is bound to the repository epoch, which a data wipe
 * advances before deleting anything: a value read across a wipe is dropped,
 * a grid computed before a wipe is never written after it, and a write that
 * a wipe overtook removes itself.
 */
export function createTodayPatternSnapshotStore(storage: SnapshotStorage) {
  return {
    async load(): Promise<{
      epoch: number;
      snapshot: TodayPatternSnapshot;
    } | null> {
      const epoch = repositoryEpoch();
      try {
        const raw = await storage.getItem(TODAY_PATTERN_SNAPSHOT_KEY);
        if (!raw || epoch !== repositoryEpoch()) return null;
        return { epoch, snapshot: JSON.parse(raw) as TodayPatternSnapshot };
      } catch {
        return null;
      }
    },

    /** `epoch` is the one the grid's source data was read under. */
    async save(
      snapshot: TodayPatternSnapshot,
      epoch: number,
    ): Promise<boolean> {
      if (epoch !== repositoryEpoch()) return false;
      try {
        await storage.setItem(
          TODAY_PATTERN_SNAPSHOT_KEY,
          JSON.stringify(snapshot),
        );
      } catch {
        // A missing snapshot only costs the instant first paint.
        return false;
      }
      if (epoch === repositoryEpoch()) return true;
      await storage.removeItem(TODAY_PATTERN_SNAPSHOT_KEY).catch(() => {});
      return false;
    },

    async clear(): Promise<void> {
      try {
        await storage.removeItem(TODAY_PATTERN_SNAPSHOT_KEY);
      } catch {
        // Nothing to recover; a stale value is still rejected by its epoch.
      }
    },
  };
}

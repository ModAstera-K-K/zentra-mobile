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

interface StoredSnapshot {
  generation: string;
  snapshot: TodayPatternSnapshot;
}

const TODAY_PATTERN_SNAPSHOT_KEY = "zentra-today-pattern-v1";

/**
 * A snapshot is bound to the repository twice over. Within a session, every
 * read and write checks the repository epoch, which a data wipe advances
 * before deleting anything: a value read across a wipe is dropped, a grid
 * computed before a wipe is never written after it, and a write that a wipe
 * overtook removes itself. Across sessions, where the epoch starts over, the
 * value carries the repository generation it was saved under; a wipe retires
 * that generation with its first statement, so a value whose removal never
 * ran or failed is refused, and removed, the next time it is loaded.
 */
export function createTodayPatternSnapshotStore(
  storage: SnapshotStorage,
  readGeneration: () => Promise<string>,
) {
  return {
    async load(): Promise<{
      epoch: number;
      snapshot: TodayPatternSnapshot;
    } | null> {
      const epoch = repositoryEpoch();
      try {
        const [raw, generation] = await Promise.all([
          storage.getItem(TODAY_PATTERN_SNAPSHOT_KEY),
          readGeneration(),
        ]);
        if (!raw || epoch !== repositoryEpoch()) return null;
        const stored = JSON.parse(raw) as Partial<StoredSnapshot>;
        if (stored.generation === generation && stored.snapshot)
          return { epoch, snapshot: stored.snapshot };
        await storage.removeItem(TODAY_PATTERN_SNAPSHOT_KEY);
        return null;
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
        const generation = await readGeneration();
        // A wipe that began during that read has already advanced the epoch.
        if (epoch !== repositoryEpoch()) return false;
        const stored: StoredSnapshot = { generation, snapshot };
        await storage.setItem(
          TODAY_PATTERN_SNAPSHOT_KEY,
          JSON.stringify(stored),
        );
      } catch {
        // A missing snapshot only costs the instant first paint.
        return false;
      }
      if (epoch === repositoryEpoch()) return true;
      await storage.removeItem(TODAY_PATTERN_SNAPSHOT_KEY).catch(() => {});
      return false;
    },

    /** Rejects when the value could not be removed; `load` still refuses it. */
    async clear(): Promise<void> {
      await storage.removeItem(TODAY_PATTERN_SNAPSHOT_KEY);
    },
  };
}

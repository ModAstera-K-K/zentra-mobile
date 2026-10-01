import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createTodayPatternSnapshotStore,
  type SnapshotStorage,
  type TodayPatternSnapshot,
} from "@/utils/today-pattern-snapshot-store";
import { buildActivityScoreMaxima } from "@/utils/activity-intensity";
import {
  invalidateRepositorySession,
  repositoryEpoch,
} from "@/utils/repository-session";

const snapshot: TodayPatternSnapshot = {
  anchor: "2026-10-01",
  cells: [],
  maxima: buildActivityScoreMaxima([]),
  window: "year",
};

/** In-memory storage whose next operation can be held until released. */
function heldStorage() {
  const values = new Map<string, string>();
  let hold: Promise<void> | null = null;
  const settle = () => hold ?? Promise.resolve();
  const storage: SnapshotStorage = {
    async getItem(key) {
      const value = values.get(key) ?? null;
      await settle();
      return value;
    },
    async setItem(key, value) {
      await settle();
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
  return {
    storage,
    values,
    holdNext() {
      let release!: () => void;
      hold = new Promise<void>((resolve) => (release = resolve));
      return () => {
        hold = null;
        release();
      };
    },
  };
}

// The wipe: advance the epoch first, then delete, as clearRepositoryData does.
async function wipe(store: ReturnType<typeof createTodayPatternSnapshotStore>) {
  invalidateRepositorySession();
  await store.clear();
}

test("a saved snapshot loads back tagged with its epoch", async () => {
  const { storage } = heldStorage();
  const store = createTodayPatternSnapshotStore(storage);
  assert.equal(await store.save(snapshot, repositoryEpoch()), true);
  assert.deepEqual(await store.load(), {
    epoch: repositoryEpoch(),
    snapshot,
  });
});

test("a save overtaken by a wipe removes itself", async () => {
  const { storage, values, holdNext } = heldStorage();
  const store = createTodayPatternSnapshotStore(storage);
  const release = holdNext();
  const saving = store.save(snapshot, repositoryEpoch());
  await wipe(store);
  release();
  assert.equal(await saving, false);
  assert.equal(values.size, 0);
  assert.equal(await store.load(), null);
});

test("a grid computed before a wipe is never written after it", async () => {
  const { storage, values } = heldStorage();
  const store = createTodayPatternSnapshotStore(storage);
  const computedUnder = repositoryEpoch();
  await wipe(store);
  assert.equal(await store.save(snapshot, computedUnder), false);
  assert.equal(values.size, 0);
});

test("a load that spans a wipe returns nothing", async () => {
  const { storage, holdNext } = heldStorage();
  const store = createTodayPatternSnapshotStore(storage);
  await store.save(snapshot, repositoryEpoch());
  const release = holdNext();
  const loading = store.load();
  await wipe(store);
  release();
  assert.equal(await loading, null);
});

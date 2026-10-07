import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  REVISION_SCHEMA,
  readRepositoryGeneration,
} from "@/utils/repository-revision";
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

/**
 * In-memory storage whose next operation can be held until released, plus the
 * repository generation the database would report.
 */
function heldStorage() {
  const values = new Map<string, string>();
  let hold: Promise<void> | null = null;
  let generation = 1;
  let removalFails = false;
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
      if (removalFails) throw new Error("storage unavailable");
      values.delete(key);
    },
  };
  const store = createTodayPatternSnapshotStore(
    storage,
    async () => `generation-${generation}`,
  );
  return {
    storage,
    store,
    values,
    failRemovals(fails = true) {
      removalFails = fails;
    },
    holdNext() {
      let release!: () => void;
      hold = new Promise<void>((resolve) => (release = resolve));
      return () => {
        hold = null;
        release();
      };
    },
    // As clearRepositoryData does: advance the epoch, then delete the rows,
    // which retires the generation with them.
    wipeDatabase() {
      invalidateRepositorySession();
      generation++;
    },
    // The same store after the app restarts: the epoch no longer tells a
    // value saved before the wipe from one saved after it.
    restarted() {
      return createTodayPatternSnapshotStore(
        storage,
        async () => `generation-${generation}`,
      );
    },
  };
}

async function wipe(fixture: ReturnType<typeof heldStorage>) {
  fixture.wipeDatabase();
  await fixture.store.clear();
}

/** Lets a started save run up to the storage write being held. */
const untilWriteIsPending = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

test("a saved snapshot loads back tagged with its epoch", async () => {
  const { store, restarted } = heldStorage();
  assert.equal(await store.save(snapshot, repositoryEpoch()), true);
  const loaded = { epoch: repositoryEpoch(), snapshot };
  assert.deepEqual(await store.load(), loaded);
  assert.deepEqual(await restarted().load(), loaded);
});

test("a save overtaken by a wipe removes itself", async () => {
  const fixture = heldStorage();
  const { store, values, holdNext } = fixture;
  const release = holdNext();
  const saving = store.save(snapshot, repositoryEpoch());
  await untilWriteIsPending();
  await wipe(fixture);
  release();
  assert.equal(await saving, false);
  assert.equal(values.size, 0);
  assert.equal(await store.load(), null);
});

test("a save still reading the generation when a wipe starts writes nothing", async () => {
  const fixture = heldStorage();
  const saving = fixture.store.save(snapshot, repositoryEpoch());
  fixture.wipeDatabase();
  assert.equal(await saving, false);
  assert.equal(fixture.values.size, 0);
});

test("a grid computed before a wipe is never written after it", async () => {
  const fixture = heldStorage();
  const computedUnder = repositoryEpoch();
  await wipe(fixture);
  assert.equal(await fixture.store.save(snapshot, computedUnder), false);
  assert.equal(fixture.values.size, 0);
});

test("a load that spans a wipe returns nothing", async () => {
  const fixture = heldStorage();
  const { store, holdNext } = fixture;
  await store.save(snapshot, repositoryEpoch());
  const release = holdNext();
  const loading = store.load();
  await wipe(fixture);
  release();
  assert.equal(await loading, null);
});

test("a snapshot whose removal never ran is refused and removed after a restart", async () => {
  const fixture = heldStorage();
  await fixture.store.save(snapshot, repositoryEpoch());
  // The app stops after the rows are deleted, before the snapshot is.
  fixture.wipeDatabase();
  assert.equal(fixture.values.size, 1);

  assert.equal(await fixture.restarted().load(), null);
  assert.equal(fixture.values.size, 0);
});

test("a failed removal fails the wipe, and the value it left is still refused", async () => {
  const fixture = heldStorage();
  await fixture.store.save(snapshot, repositoryEpoch());
  fixture.failRemovals();
  await assert.rejects(wipe(fixture), /storage unavailable/);
  assert.equal(fixture.values.size, 1);

  const reopened = fixture.restarted();
  assert.equal(await reopened.load(), null);
  fixture.failRemovals(false);
  assert.equal(await reopened.load(), null);
  assert.equal(fixture.values.size, 0);
});

test("a save a wipe overtook is refused even if it never removed itself", async () => {
  const fixture = heldStorage();
  const release = fixture.holdNext();
  const saving = fixture.store.save(snapshot, repositoryEpoch());
  await untilWriteIsPending();
  await wipe(fixture);
  // The late write lands, then the app stops before it can clean up.
  fixture.failRemovals();
  release();
  assert.equal(await saving, false);
  assert.equal(fixture.values.size, 1);

  assert.equal(await fixture.restarted().load(), null);
});

test("a value saved before generations existed is refused", async () => {
  const fixture = heldStorage();
  await fixture.store.save(snapshot, repositoryEpoch());
  const [key] = [...fixture.values.keys()];
  fixture.values.set(key, JSON.stringify(snapshot));
  assert.equal(await fixture.store.load(), null);
  assert.equal(fixture.values.size, 0);
});

test("the repository generation is stable until a wipe drops it, then never repeats", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE events(id TEXT,source TEXT,metadata TEXT,timestamp_start TEXT,timestamp_end TEXT,data_type TEXT)",
    );
    db.exec(REVISION_SCHEMA);
    const adapter = {
      getFirstAsync: async (sql: string, ...values: unknown[]) =>
        db.prepare(sql).get(...(values as never[])),
      runAsync: async (sql: string, ...values: unknown[]) =>
        db.prepare(sql).run(...(values as never[])),
    } as unknown as SQLiteDatabase;

    const first = await readRepositoryGeneration(adapter);
    assert.match(first, /^[0-9a-f]{32}$/);
    assert.equal(await readRepositoryGeneration(adapter), first);

    // The wipe's first statement.
    db.exec("DELETE FROM derived_cache");
    const second = await readRepositoryGeneration(adapter);
    assert.notEqual(second, first);
    assert.equal(await readRepositoryGeneration(adapter), second);
  } finally {
    db.close();
  }
});

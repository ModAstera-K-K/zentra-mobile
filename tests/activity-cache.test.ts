import { test } from "node:test";
import assert from "node:assert/strict";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  activityMaximaKey,
  readActivityCacheManifest,
  readActivityCacheRevision,
} from "@/utils/activity-cache-manifest";
import { readDataRevision } from "@/utils/repository-revision";
import { shiftISODate } from "@/utils/dates";
import { createActivityCacheFixture } from "./activity-cache-fixtures";

test("a cached year uses two database reads instead of 730 with identical revisions and payloads", async (t) => {
  const fixture = createActivityCacheFixture("2025-09-28", "2026-09-27");
  try {
    const db = fixture.adapter as unknown as SQLiteDatabase;
    const before = performance.now();
    const expected = [];
    for (const date of fixture.dates) {
      const revision = Number(
        await readDataRevision(db, shiftISODate(date, -1), date),
      );
      const key = activityMaximaKey(date, 0);
      const row = await db.getFirstAsync<{ payload: string }>(
        "SELECT payload FROM derived_cache WHERE cache_key=? AND revision=?",
        key,
        revision,
      );
      expected.push({ date, key, revision, payload: row?.payload });
    }
    const oldMs = performance.now() - before,
      oldReads = fixture.readCount();
    const after = performance.now();
    const actual = await readActivityCacheManifest(
      db,
      fixture.dates[0],
      fixture.dates.at(-1)!,
      0,
    );
    assert.deepEqual(actual, expected);
    assert.equal(oldReads, 730);
    assert.equal(fixture.readCount() - oldReads, 2);
    t.diagnostic(
      `Cached year: ${oldReads} -> 2 reads; desktop SQLite ${oldMs.toFixed(1)}ms -> ${(performance.now() - after).toFixed(1)}ms. Not device timing.`,
    );
  } finally {
    fixture.db.close();
  }
});

test("batched cache checks invalidate corrected and deleted dates, overnight neighbors, and timezone changes", async () => {
  const fixture = createActivityCacheFixture("2026-09-01", "2026-09-05");
  try {
    fixture.db
      .prepare(
        "INSERT INTO event_changes(start_date,end_date,data_type) VALUES('2026-09-02','2026-09-03','steps')",
      )
      .run();
    const db = fixture.adapter as unknown as SQLiteDatabase;
    const result = await readActivityCacheManifest(
      db,
      "2026-09-01",
      "2026-09-05",
      0,
    );
    assert.deepEqual(
      result.filter((day) => day.payload === undefined).map((day) => day.date),
      ["2026-09-02", "2026-09-03", "2026-09-04"],
    );
    const moved = await readActivityCacheManifest(
      db,
      "2026-09-01",
      "2026-09-05",
      -540,
    );
    assert.ok(moved.every((day) => day.payload === undefined));
  } finally {
    fixture.db.close();
  }
});

test("a sleep change also invalidates the earlier days whose nights it settles", async () => {
  const fixture = createActivityCacheFixture("2026-09-01", "2026-09-08");
  try {
    const db = fixture.adapter as unknown as SQLiteDatabase;
    const stale = async () =>
      (await readActivityCacheManifest(db, "2026-09-01", "2026-09-08", 0))
        .filter((day) => day.payload === undefined)
        .map((day) => day.date);
    const insert = fixture.db.prepare(
      "INSERT INTO event_changes(start_date,end_date,data_type) VALUES(?,?,?)",
    );

    // An import that begins after midnight decides whether the rest inferred
    // for the evening before still counts, and whether the night after it ran on.
    insert.run("2026-09-05", "2026-09-05", "sleep_inferred");
    assert.deepEqual(await stale(), [
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);

    // Anything else only reaches forward, as before.
    insert.run("2026-09-08", "2026-09-08", "steps");
    assert.deepEqual((await stale()).slice(-1), ["2026-09-08"]);
    assert.ok(!(await stale()).includes("2026-09-07"));
  } finally {
    fixture.db.close();
  }
});

test("the history revision moves exactly when a stored day goes stale", async () => {
  const fixture = createActivityCacheFixture("2026-09-01", "2026-09-10");
  try {
    const db = fixture.adapter as unknown as SQLiteDatabase;
    const insert = fixture.db.prepare(
      "INSERT INTO event_changes(start_date,end_date,data_type) VALUES(?,?,?)",
    );
    // History is everything up to yesterday; "today" is 2026-09-09.
    const history = ["2026-09-01", "2026-09-08"] as const;
    const revision = () => readActivityCacheRevision(db, ...history);
    const staleDays = async () =>
      (await readActivityCacheManifest(db, ...history, 0)).filter(
        (day) => day.payload === undefined,
      ).length;
    const settled = await revision();
    assert.equal(await staleDays(), 0);

    // Live writes for today leave stored days, and so the revision, alone.
    insert.run("2026-09-09", "2026-09-09", "steps");
    insert.run("2026-09-11", "2026-09-11", "sleep_inferred");
    assert.equal(await revision(), settled);
    assert.equal(await staleDays(), 0);

    // Sleep that starts today or tomorrow can still change yesterday.
    insert.run("2026-09-10", "2026-09-10", "sleep_inferred");
    const afterSleep = await revision();
    assert.ok(Number(afterSleep) > Number(settled));
    assert.equal(await staleDays(), 1);

    insert.run("2026-09-04", "2026-09-04", "steps");
    assert.ok(Number(await revision()) > Number(afterSleep));
  } finally {
    fixture.db.close();
  }
});

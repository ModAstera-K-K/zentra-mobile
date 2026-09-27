import { test } from "node:test";
import assert from "node:assert/strict";
import type { SQLiteDatabase } from "expo-sqlite";
import { readActivityCacheManifest } from "@/utils/activity-cache-manifest";
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
      const key = `hourly-maxima-v2:${date}:0`;
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

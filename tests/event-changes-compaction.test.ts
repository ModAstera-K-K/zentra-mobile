import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  REVISION_SCHEMA,
  compactEventChangesFrom,
  markEventChangesCompacted,
  readEventChangeCompactionState,
} from "@/utils/repository-revision";
import { readActivityCacheManifest } from "@/utils/activity-cache-manifest";
import { enumerateISODateRange, shiftISODate } from "@/utils/dates";

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE events(id TEXT,source TEXT,metadata TEXT,timestamp_start TEXT,timestamp_end TEXT,data_type TEXT)",
  );
  db.exec(REVISION_SCHEMA);
  const adapter = {
    getAllAsync: async (sql: string, ...values: unknown[]) =>
      db.prepare(sql).all(...(values as never[])),
    getFirstAsync: async (sql: string, ...values: unknown[]) =>
      db.prepare(sql).get(...(values as never[])),
    runAsync: async (sql: string, ...values: unknown[]) =>
      db.prepare(sql).run(...(values as never[])),
  };
  return { db, adapter: adapter as unknown as SQLiteDatabase };
}

// Every query shape that reads event_changes, over a spread of ranges.
function readerResults(db: DatabaseSync, dates: string[]) {
  const results: unknown[] = [];
  results.push(
    db
      .prepare("SELECT COALESCE(MAX(revision),0) AS r FROM event_changes")
      .get(),
  );
  for (const start of dates.filter((_, i) => i % 3 === 0))
    for (const days of [0, 1, 6, 30]) {
      const end = shiftISODate(start, days);
      results.push(
        db
          .prepare(
            "SELECT COALESCE(MAX(revision),0) AS r FROM event_changes WHERE start_date <= ? AND end_date >= ?",
          )
          .get(end, start),
        db
          .prepare(
            "SELECT COALESCE(MAX(revision),0) AS r FROM event_changes WHERE data_type='steps' AND start_date <= ? AND end_date >= ?",
          )
          .get(end, start),
        db
          .prepare(
            "SELECT COALESCE(MAX(revision),0) AS r FROM event_changes WHERE data_type IN ('steps','activity','exercise_session','motion_context') AND start_date <= ? AND end_date >= ?",
          )
          .get(end, start),
      );
    }
  return results;
}

test("compacting event_changes keeps every revision reader's answer", async () => {
  const { db, adapter } = createDatabase();
  try {
    const dates = enumerateISODateRange("2026-08-01", "2026-09-30");
    const insert = db.prepare(
      "INSERT INTO event_changes(start_date,end_date,data_type) VALUES(?,?,?)",
    );
    const types = ["steps", "activity", "heart_rate", "motion_context"];
    for (let round = 0; round < 6; round++)
      dates.forEach((date, index) => {
        for (const type of types) {
          insert.run(date, date, type);
          if ((index + round) % 4 === 0)
            insert.run(date, shiftISODate(date, 1), type); // overnight record
        }
      });
    const before = readerResults(db, dates);
    const manifestBefore = await readActivityCacheManifest(
      adapter,
      dates[0],
      dates.at(-1)!,
      0,
    );
    const rowsBefore = (
      db.prepare("SELECT COUNT(*) AS n FROM event_changes").get() as {
        n: number;
      }
    ).n;

    const state = await readEventChangeCompactionState(adapter);
    let cursor: string | null = state.firstDate;
    let chunks = 0;
    while (cursor) {
      cursor = await compactEventChangesFrom(
        adapter,
        cursor,
        shiftISODate(cursor, 7),
      );
      chunks++;
    }
    await markEventChangesCompacted(adapter, state.maxRevision);

    const rowsAfter = (
      db.prepare("SELECT COUNT(*) AS n FROM event_changes").get() as {
        n: number;
      }
    ).n;
    assert.deepEqual(readerResults(db, dates), before);
    assert.deepEqual(
      await readActivityCacheManifest(adapter, dates[0], dates.at(-1)!, 0),
      manifestBefore,
    );
    assert.ok(rowsAfter < rowsBefore / 3, `${rowsBefore} -> ${rowsAfter}`);
    assert.ok(chunks >= 9 && chunks <= 10);
    const after = await readEventChangeCompactionState(adapter);
    assert.equal(after.compactedRevision, state.maxRevision);
    assert.equal(after.maxRevision, state.maxRevision);

    // New writes after compaction still advance revisions past old ones.
    insert.run(dates[0], dates[0], "steps");
    assert.ok(
      (await readEventChangeCompactionState(adapter)).maxRevision >
        state.maxRevision,
    );
  } finally {
    db.close();
  }
});

test("the manifest returns cached hourly samples only for current revisions from samplesFrom", async () => {
  const { db, adapter } = createDatabase();
  try {
    const dates = enumerateISODateRange("2026-09-20", "2026-09-30");
    dates.forEach((date) =>
      db
        .prepare(
          "INSERT INTO event_changes(start_date,end_date,data_type) VALUES(?,?,'steps')",
        )
        .run(date, date),
    );
    const manifest = await readActivityCacheManifest(
      adapter,
      dates[0],
      dates.at(-1)!,
      0,
    );
    for (const day of manifest) {
      db.prepare(
        "INSERT INTO derived_cache(cache_key,revision,payload) VALUES(?,?,?)",
      ).run(
        `hourly-samples-v1:${day.date}:0`,
        // One stale entry: written before a later change to that day.
        day.date === "2026-09-28" ? day.revision - 1 : day.revision,
        `[${day.revision}]`,
      );
    }

    const withSamples = await readActivityCacheManifest(
      adapter,
      dates[0],
      dates.at(-1)!,
      0,
      "2026-09-25",
    );
    assert.deepEqual(
      withSamples.filter((day) => day.samplesKey).map((day) => day.date),
      enumerateISODateRange("2026-09-25", "2026-09-30"),
    );
    assert.deepEqual(
      withSamples
        .filter((day) => day.samplesKey && !day.samples)
        .map((day) => day.date),
      ["2026-09-28"],
    );
    assert.deepEqual(
      withSamples.map(({ date, key, revision, payload }) => ({
        date,
        key,
        revision,
        payload,
      })),
      manifest,
    );
  } finally {
    db.close();
  }
});

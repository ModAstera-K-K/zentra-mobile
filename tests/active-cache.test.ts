import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { ACTIVE_MINUTES_MIGRATION } from "@/utils/active-minutes-migration";
import {
  cachedActiveMinutes,
  isActiveSummaryCurrent,
} from "@/utils/active-minutes-cache";
import { event } from "./fixtures";
import { invalidateRepositorySession } from "@/utils/repository-session";

test("v3 migration preserves legacy aggregate values; cache detects corrections, adjacent days and calibration changes", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE daily_aggregates(date TEXT,active_minutes INTEGER); INSERT INTO daily_aggregates VALUES('2026-09-10',5); CREATE TABLE event_changes(revision INTEGER PRIMARY KEY AUTOINCREMENT,start_date TEXT,end_date TEXT,data_type TEXT); CREATE TABLE derived_cache(cache_key TEXT PRIMARY KEY,revision INTEGER,payload TEXT);",
  );
  db.exec(ACTIVE_MINUTES_MIGRATION);
  assert.equal(
    db.prepare("SELECT active_minutes FROM daily_aggregates").get()!
      .active_minutes,
    5,
  );
  assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 3);
  const adapter = {
    getFirstAsync: async (sql: string, ...args: unknown[]) =>
      db.prepare(sql).get(...(args as never[])),
    getAllAsync: async (sql: string, ...args: unknown[]) =>
      db.prepare(sql).all(...(args as never[])),
    runAsync: async (sql: string, ...args: unknown[]) =>
      db.prepare(sql).run(...(args as never[])),
  };
  const date = "2026-09-10";
  const record = {
    ...event("a", 5),
    timestampStart: new Date(`${date}T09:00:00`).toISOString(),
    timestampEnd: new Date(`${date}T09:00:00`).toISOString(),
    metadata: { step_delta: 5, step_timing_verified: true },
  };
  const first = await cachedActiveMinutes(adapter as never, date, [record]);
  assert.equal(first.supportedMinutes, 1);
  assert.equal(
    await isActiveSummaryCurrent(adapter as never, date, JSON.stringify(first)),
    true,
  );
  db.exec(
    "INSERT INTO event_changes(start_date,end_date,data_type) VALUES('2026-09-09','2026-09-09','activity')",
  );
  assert.equal(
    await isActiveSummaryCurrent(adapter as never, date, JSON.stringify(first)),
    false,
  );
  const deleted = await cachedActiveMinutes(adapter as never, date, []);
  assert.equal(deleted.supportedMinutes, null);
  db.exec(
    "INSERT INTO event_changes(start_date,end_date,data_type) VALUES('2026-09-01','2026-09-01','steps')",
  );
  assert.equal(
    await isActiveSummaryCurrent(
      adapter as never,
      date,
      JSON.stringify(deleted),
    ),
    false,
  );
  invalidateRepositorySession();
  db.exec("DELETE FROM derived_cache; DELETE FROM event_changes;");
  assert.equal(
    (await cachedActiveMinutes(adapter as never, date, [])).supportedMinutes,
    null,
  );
  db.close();
});

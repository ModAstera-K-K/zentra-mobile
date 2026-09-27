import { DatabaseSync } from "node:sqlite";
import { REVISION_SCHEMA } from "@/utils/repository-revision";
import { enumerateISODateRange } from "@/utils/dates";

export function createActivityCacheFixture(start: string, end: string) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE events(id TEXT,source TEXT,metadata TEXT,timestamp_start TEXT,timestamp_end TEXT,data_type TEXT)",
  );
  db.exec(REVISION_SCHEMA);
  const dates = enumerateISODateRange(start, end);
  dates.forEach((date, index) => {
    db.prepare(
      "INSERT INTO event_changes(start_date,end_date,data_type) VALUES(?,?,'steps')",
    ).run(date, date);
    db.prepare(
      "INSERT INTO derived_cache(cache_key,revision,payload) VALUES(?,?,?)",
    ).run(
      `hourly-maxima-v2:${date}:0`,
      index + 1,
      JSON.stringify({ steps: index }),
    );
  });
  let reads = 0;
  const adapter = {
    getAllAsync: async (sql: string, ...values: unknown[]) => {
      reads++;
      return db.prepare(sql).all(...(values as never[]));
    },
    getFirstAsync: async (sql: string, ...values: unknown[]) => {
      reads++;
      return db.prepare(sql).get(...(values as never[]));
    },
  };
  return { db, adapter, dates, readCount: () => reads };
}

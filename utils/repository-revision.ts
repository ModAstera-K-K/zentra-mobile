import type { SQLiteDatabase } from "expo-sqlite";

// Written by triggers in the same transaction as the underlying event change.
export const REVISION_SCHEMA = `
CREATE INDEX IF NOT EXISTS events_health_record_id ON events(source, json_extract(metadata,'$.record_id'));
CREATE TABLE IF NOT EXISTS event_changes (
 revision INTEGER PRIMARY KEY AUTOINCREMENT,
 start_date TEXT NOT NULL, end_date TEXT NOT NULL, data_type TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS event_changes_range ON event_changes(start_date, end_date);
CREATE TRIGGER IF NOT EXISTS events_revision_insert AFTER INSERT ON events BEGIN
 INSERT INTO event_changes(start_date,end_date,data_type) VALUES(date(NEW.timestamp_start,'localtime'),date(NEW.timestamp_end,'localtime'),NEW.data_type);
END;
CREATE TRIGGER IF NOT EXISTS events_revision_update AFTER UPDATE ON events BEGIN
 INSERT INTO event_changes(start_date,end_date,data_type) VALUES(min(date(OLD.timestamp_start,'localtime'),date(NEW.timestamp_start,'localtime')),max(date(OLD.timestamp_end,'localtime'),date(NEW.timestamp_end,'localtime')),NEW.data_type);
END;
CREATE TRIGGER IF NOT EXISTS events_revision_delete AFTER DELETE ON events BEGIN
 INSERT INTO event_changes(start_date,end_date,data_type) VALUES(date(OLD.timestamp_start,'localtime'),date(OLD.timestamp_end,'localtime'),OLD.data_type);
END;
CREATE TABLE IF NOT EXISTS derived_cache (cache_key TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS health_sync_state (record_type TEXT PRIMARY KEY, cursor TEXT, history_days INTEGER NOT NULL DEFAULT 30, status TEXT NOT NULL DEFAULT 'idle', message TEXT, updated_at TEXT, start_at TEXT, end_at TEXT);
CREATE TABLE IF NOT EXISTS health_snapshot_runs(record_type TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS health_snapshot_records(record_type TEXT NOT NULL,event_id TEXT NOT NULL,PRIMARY KEY(record_type,event_id));
PRAGMA user_version = 2;
`;

export async function readDataRevision(
  db: SQLiteDatabase,
  start?: string,
  end?: string,
): Promise<string> {
  const row =
    start && end
      ? await db.getFirstAsync<{ revision: number }>(
          "SELECT COALESCE(MAX(revision),0) AS revision FROM event_changes WHERE start_date <= ? AND end_date >= ?",
          end,
          start,
        )
      : await db.getFirstAsync<{ revision: number }>(
          "SELECT COALESCE(MAX(revision),0) AS revision FROM event_changes",
        );
  return String(row?.revision ?? 0);
}

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

/**
 * Change rows written when derived step-timing evidence is rebuilt for a day.
 * The day's events did not change, so anything computed from events alone
 * (the stored activity days) must not count these as a change to the day.
 */
export const ACTIVE_TIMING_CHANGE_TYPE = "active_timing";

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

const GENERATION_KEY = "repository-generation";

/**
 * Identifies the stored data that values kept outside the database were
 * computed from. It lives in derived_cache, so a wipe deletes it and the next
 * read mints a different one: nothing saved before a wipe matches after it,
 * even across a restart.
 */
export async function readRepositoryGeneration(
  db: SQLiteDatabase,
): Promise<string> {
  const read = () =>
    db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM derived_cache WHERE cache_key=?",
      GENERATION_KEY,
    );
  const existing = await read();
  if (existing) return existing.payload;
  await db.runAsync(
    "INSERT OR IGNORE INTO derived_cache(cache_key,revision,payload) VALUES(?,0,lower(hex(randomblob(16))))",
    GENERATION_KEY,
  );
  return (await read())!.payload;
}

const COMPACTION_MARKER_KEY = "event-changes-compacted";

export interface EventChangeCompactionState {
  compactedRevision: number;
  firstDate: string | null;
  maxRevision: number;
}

export async function readEventChangeCompactionState(
  db: SQLiteDatabase,
): Promise<EventChangeCompactionState> {
  const row = await db.getFirstAsync<{
    compacted_revision: number | null;
    first_date: string | null;
    max_revision: number;
  }>(
    `SELECT
      (SELECT COALESCE(MAX(revision),0) FROM event_changes) AS max_revision,
      (SELECT revision FROM derived_cache WHERE cache_key=?) AS compacted_revision,
      (SELECT MIN(start_date) FROM event_changes) AS first_date`,
    COMPACTION_MARKER_KEY,
  );
  return {
    compactedRevision: Number(row?.compacted_revision ?? 0),
    firstDate: row?.first_date ?? null,
    maxRevision: Number(row?.max_revision ?? 0),
  };
}

/**
 * Drop change rows superseded by a later row with the same dates and data
 * type. Every reader takes MAX(revision) filtered on those columns, so their
 * results are unchanged, but the table no longer grows with every write.
 * Returns the next start_date to compact, or null when the table is done.
 */
export async function compactEventChangesFrom(
  db: SQLiteDatabase,
  fromDate: string,
  toDateExclusive: string,
): Promise<string | null> {
  await db.runAsync(
    `DELETE FROM event_changes
      WHERE start_date >= ? AND start_date < ?
      AND revision NOT IN (
        SELECT MAX(revision) FROM event_changes
          WHERE start_date >= ? AND start_date < ?
          GROUP BY start_date, end_date, data_type
      )`,
    fromDate,
    toDateExclusive,
    fromDate,
    toDateExclusive,
  );
  const next = await db.getFirstAsync<{ start_date: string | null }>(
    "SELECT MIN(start_date) AS start_date FROM event_changes WHERE start_date >= ?",
    toDateExclusive,
  );
  return next?.start_date ?? null;
}

export async function markEventChangesCompacted(
  db: SQLiteDatabase,
  revision: number,
): Promise<void> {
  await db.runAsync(
    "INSERT OR REPLACE INTO derived_cache(cache_key,revision,payload) VALUES(?,?,'')",
    COMPACTION_MARKER_KEY,
    revision,
  );
}

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'zentra.db';

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  timestamp_start TEXT NOT NULL,
  timestamp_end TEXT NOT NULL,
  data_type TEXT NOT NULL,
  source TEXT NOT NULL,
  value_numeric REAL,
  value_text TEXT,
  value_json TEXT,
  unit TEXT NOT NULL,
  confidence REAL NOT NULL,
  metadata TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp_start ON events(timestamp_start);
CREATE INDEX IF NOT EXISTS idx_events_data_type_timestamp_start ON events(data_type, timestamp_start);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);

CREATE TABLE IF NOT EXISTS daily_aggregates (
  date TEXT PRIMARY KEY NOT NULL,
  steps_total INTEGER NOT NULL,
  active_minutes INTEGER NOT NULL,
  distance_meters REAL NOT NULL,
  screen_time_seconds INTEGER NOT NULL,
  unlock_count INTEGER NOT NULL,
  sleep_estimate_minutes INTEGER,
  mobility_radius_meters REAL,
  top_activity TEXT,
  data_completeness REAL NOT NULL,
  computed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collector_diagnostics (
  id TEXT PRIMARY KEY NOT NULL,
  collector_key TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  event_count INTEGER NOT NULL,
  consecutive_failures INTEGER NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collector_diagnostics_collector_recorded
  ON collector_diagnostics(collector_key, recorded_at DESC);
`;

let databasePromise: Promise<SQLiteDatabase> | null = null;

async function initializeDatabase(database: SQLiteDatabase): Promise<SQLiteDatabase> {
  await database.execAsync(SCHEMA_SQL);
  return database;
}

export async function getLocalDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME).then(initializeDatabase);
  }

  return databasePromise;
}

import { ACTIVITY_HISTORY_MIGRATION } from "@/utils/activity-history-migration";
import { ACTIVE_MINUTES_MIGRATION } from "@/utils/active-minutes-migration";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { REVISION_SCHEMA } from "@/utils/repository-revision";

const DATABASE_NAME = "zentra.db";
const SQLITE_LOCK_RETRY_DELAYS_MS = [150, 300, 600, 1200, 2000];

const SCHEMA_SQL = `
PRAGMA busy_timeout = 5000;
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

const MIGRATIONS_SQL = [
  `ALTER TABLE collector_diagnostics ADD COLUMN last_successful_sync_at TEXT`,
  `ALTER TABLE collector_diagnostics ADD COLUMN imported_record_count INTEGER`,
  `ALTER TABLE collector_diagnostics ADD COLUMN time_since_last_good_run_ms INTEGER`,
];

let databasePromise: Promise<SQLiteDatabase> | null = null;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDatabaseLockedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /database is locked|sqlite_busy/i.test(error.message);
}

async function retryLockedExecAsync(
  database: SQLiteDatabase,
  sql: string,
): Promise<void> {
  let attempt = 0;

  while (true) {
    try {
      await database.execAsync(sql);
      return;
    } catch (error) {
      if (
        !isDatabaseLockedError(error) ||
        attempt >= SQLITE_LOCK_RETRY_DELAYS_MS.length
      ) {
        throw error;
      }

      await wait(SQLITE_LOCK_RETRY_DELAYS_MS[attempt] ?? 0);
      attempt += 1;
    }
  }
}

async function runMigrations(database: SQLiteDatabase): Promise<void> {
  for (const migration of MIGRATIONS_SQL) {
    try {
      await retryLockedExecAsync(database, migration);
    } catch (error) {
      // Only a duplicate column is safe to skip; failed migrations must surface.
      if (!(error instanceof Error) || !/duplicate column/i.test(error.message))
        throw error;
    }
  }
}

async function initializeDatabase(
  database: SQLiteDatabase,
): Promise<SQLiteDatabase> {
  await retryLockedExecAsync(database, SCHEMA_SQL);
  await runMigrations(database);
  const version = await database.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  if ((version?.user_version ?? 0) < 2) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(REVISION_SCHEMA);
      await database.execAsync("DELETE FROM daily_aggregates");
    });
  }
  if ((version?.user_version ?? 0) < 3) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(ACTIVE_MINUTES_MIGRATION);
    });
  }
  if ((version?.user_version ?? 0) < 4) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(ACTIVITY_HISTORY_MIGRATION);
    });
  }
  return database;
}

export async function getLocalDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME)
      .then(initializeDatabase)
      .catch((error) => {
        databasePromise = null;
        throw error;
      });
  }

  return databasePromise;
}

import { cancelNativeActivityHistory } from "@/utils/native/zentra-native-signals";
import { loadActivityContext } from "@/utils/activity-context";
import { cancelActivityHistory } from "@/utils/activity-history-session";
import { upsertActivityEvent } from "@/utils/activity-history-sql";
import {
  cachedActiveMinutes,
  isActiveSummaryCurrent,
} from "@/utils/active-minutes-cache";
import { startPerfTimer } from "@/utils/perf";
import { runCooperatively } from "@/utils/cooperative-work";
import { readEventPages, type PagedEventRow } from "@/utils/event-pages";
import { invalidateRepositorySession } from "@/utils/repository-session";
import { cancelHealthSync } from "@/utils/health-sync-session";
import {
  compactEventChangesFrom,
  markEventChangesCompacted,
  readDataRevision,
  readEventChangeCompactionState,
} from "@/utils/repository-revision";
import type { SQLiteDatabase } from "expo-sqlite";

import type {
  CollectorDiagnosticRecord,
  CollectorKey,
  DailyAggregateRecord,
  TodayLiveSnapshot,
  ZentraEventRecord,
} from "@/types/zentra";
import { getLocalDatabase } from "@/utils/local-database";
import {
  buildDailyAggregateRecord,
  buildTodaySnapshot,
  getLocalDatesForEvents,
  getRangeBounds,
} from "@/utils/repository-aggregates";
import { parseISODate, shiftISODate, toISODate } from "@/utils/dates";

export interface EventRow {
  id: string;
  timestamp_start: string;
  timestamp_end: string;
  data_type: ZentraEventRecord["dataType"];
  source: ZentraEventRecord["source"];
  value_numeric: number | null;
  value_text: string | null;
  value_json: string | null;
  unit: string;
  confidence: number;
  metadata: string;
  schema_version: number;
  created_at: string;
}

interface AggregateRow {
  date: string;
  steps_total: number;
  active_minutes: number;
  active_summary: string | null;
  distance_meters: number;
  screen_time_seconds: number;
  unlock_count: number;
  sleep_estimate_minutes: number | null;
  mobility_radius_meters: number | null;
  top_activity: string | null;
  data_completeness: number;
  computed_at: string;
}

interface DiagnosticRow {
  id: string;
  collector_key: CollectorKey;
  status: "success" | "failure";
  message: string | null;
  event_count: number;
  consecutive_failures: number;
  recorded_at: string;
  last_successful_sync_at?: string | null;
  imported_record_count?: number | null;
  time_since_last_good_run_ms?: number | null;
}

let databaseOperationQueue: Promise<void> = Promise.resolve();
const WRITE_LOCK_RETRY_DELAYS_MS = [150, 300, 600, 1200];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDatabaseLockedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /database is locked|sqlite_busy/i.test(error.message);
}

async function retryLockedWrite<T>(task: () => Promise<T>): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await task();
    } catch (error) {
      if (
        !isDatabaseLockedError(error) ||
        attempt >= WRITE_LOCK_RETRY_DELAYS_MS.length
      ) {
        throw error;
      }

      await wait(WRITE_LOCK_RETRY_DELAYS_MS[attempt] ?? 0);
      attempt += 1;
    }
  }
}

function enqueueRetriedWrite<T>(task: () => Promise<T>): Promise<T> {
  return enqueueWrite(() => retryLockedWrite(task));
}

export function enqueueDatabaseOperation<T>(
  task: () => Promise<T>,
): Promise<T> {
  const nextTask = databaseOperationQueue.then(task, task);
  databaseOperationQueue = nextTask.then(
    () => undefined,
    () => undefined,
  );
  return nextTask;
}

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  return enqueueDatabaseOperation(task);
}

function createDiagnosticId(collectorKey: CollectorKey): string {
  return `${collectorKey}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseMetadata(metadata: string): ZentraEventRecord["metadata"] {
  try {
    return JSON.parse(metadata) as ZentraEventRecord["metadata"];
  } catch {
    return {};
  }
}

export function mapEventRow(row: EventRow): ZentraEventRecord {
  return {
    id: row.id,
    timestampStart: row.timestamp_start,
    timestampEnd: row.timestamp_end,
    dataType: row.data_type,
    source: row.source,
    valueNumeric: row.value_numeric ?? undefined,
    valueText: row.value_text ?? undefined,
    valueJson: row.value_json ?? undefined,
    unit: row.unit,
    confidence: row.confidence,
    metadata: parseMetadata(row.metadata),
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
  };
}

function mapAggregateRow(row: AggregateRow): DailyAggregateRecord {
  return {
    date: row.date,
    stepsTotal: row.steps_total,
    activeMinutes: row.active_minutes,
    activeSummary: row.active_summary
      ? JSON.parse(row.active_summary)
      : undefined,
    distanceMeters: row.distance_meters,
    screenTimeSeconds: row.screen_time_seconds,
    unlockCount: row.unlock_count,
    sleepEstimateMinutes: row.sleep_estimate_minutes,
    mobilityRadiusMeters: row.mobility_radius_meters,
    topActivity: row.top_activity,
    dataCompleteness: row.data_completeness,
    computedAt: row.computed_at,
  };
}

function mapDiagnosticRow(row: DiagnosticRow): CollectorDiagnosticRecord {
  return {
    id: row.id,
    collectorKey: row.collector_key,
    status: row.status,
    message: row.message,
    eventCount: row.event_count,
    consecutiveFailures: row.consecutive_failures,
    recordedAt: row.recorded_at,
    lastSuccessfulSyncAt: row.last_successful_sync_at ?? null,
    importedRecordCount: row.imported_record_count ?? null,
    timeSinceLastGoodRunMs: row.time_since_last_good_run_ms ?? null,
  };
}

async function getEventsBetweenWithDatabase(
  database: SQLiteDatabase,
  startIso: string,
  endExclusiveIso: string,
  activityContext = false,
): Promise<ZentraEventRecord[]> {
  const stopQuery = startPerfTimer("repository.range_query");
  const rows = await database.getAllAsync<EventRow>(
    `SELECT * FROM events
      WHERE timestamp_start >= ? AND timestamp_start < ?
      ${activityContext ? "AND data_type IN ('activity','steps')" : ""}
      ORDER BY timestamp_start ASC`,
    startIso,
    endExclusiveIso,
  );

  stopQuery({ rows: rows.length });
  const stopMap = startPerfTimer("repository.range_decode");
  const events = await runCooperatively(decodeEventRowsWork(rows));
  stopMap({ rows: rows.length });
  return events;
}

function* decodeEventRowsWork(
  rows: EventRow[],
): Generator<void, ZentraEventRecord[]> {
  const events: ZentraEventRecord[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (i && i % 50 === 0) yield;
    events.push(mapEventRow(rows[i]));
  }
  return events;
}

/**
 * Paged, cooperatively decoded read for screens. Each page is its own queued
 * database operation, so writes and other reads interleave between pages.
 */
async function readEventRange(
  start: string,
  end: string,
  filter?: { where: string; params: string[] },
): Promise<ZentraEventRecord[]> {
  const { startIso, endExclusiveIso } = getRangeBounds(start, end);
  const stopRead = startPerfTimer("repository.range_read");
  const events = await readEventPages<
    EventRow & PagedEventRow,
    ZentraEventRecord
  >(
    (sql, params) =>
      enqueueDatabaseOperation(async () =>
        (await getLocalDatabase()).getAllAsync<EventRow & PagedEventRow>(
          sql,
          ...params,
        ),
      ),
    {
      start: startIso,
      endExclusive: endExclusiveIso,
      where: filter?.where,
      params: filter?.params,
    },
    mapEventRow,
  );
  stopRead({ rows: events.length });
  return events;
}

async function getEventsBetween(
  startIso: string,
  endExclusiveIso: string,
): Promise<ZentraEventRecord[]> {
  const database = await getLocalDatabase();
  return getEventsBetweenWithDatabase(database, startIso, endExclusiveIso);
}

async function getAggregateEventsForDateWithDatabase(
  database: SQLiteDatabase,
  date: string,
): Promise<ZentraEventRecord[]> {
  const { startIso, endExclusiveIso } = getRangeBounds(date, date);
  const dayEvents = await getEventsBetweenWithDatabase(
    database,
    startIso,
    endExclusiveIso,
  );
  const overlappingAppUsageRows = await database.getAllAsync<EventRow>(
    `SELECT * FROM events
      WHERE data_type IN ('app_usage','sleep_inferred','exercise_session','steps')
      AND timestamp_start < ?
      AND timestamp_end > ?
      ORDER BY timestamp_start ASC`,
    endExclusiveIso,
    startIso,
  );

  const eventsById = new Map(dayEvents.map((event) => [event.id, event]));

  overlappingAppUsageRows.map(mapEventRow).forEach((event) => {
    eventsById.set(event.id, event);
  });

  return Array.from(eventsById.values()).sort((left, right) =>
    left.timestampStart.localeCompare(right.timestampStart),
  );
}

export async function rebuildAggregateForDate(
  database: SQLiteDatabase,
  date: string,
): Promise<void> {
  const events = await getAggregateEventsForDateWithDatabase(database, date);

  if (!events.length) {
    await database.runAsync(
      "DELETE FROM daily_aggregates WHERE date = ?",
      date,
    );
    return;
  }

  const activeSummary = await cachedActiveMinutes(database, date, events, () =>
    loadActivityContext(database, date, mapEventRow),
  );
  const aggregate = buildDailyAggregateRecord(date, events, activeSummary);

  await database.runAsync(
    `INSERT OR REPLACE INTO daily_aggregates (
      date,
      steps_total,
      active_minutes,
      active_summary,
      distance_meters,
      screen_time_seconds,
      unlock_count,
      sleep_estimate_minutes,
      mobility_radius_meters,
      top_activity,
      data_completeness,
      computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    aggregate.date,
    aggregate.stepsTotal,
    aggregate.activeMinutes,
    JSON.stringify(aggregate.activeSummary),
    aggregate.distanceMeters,
    aggregate.screenTimeSeconds,
    aggregate.unlockCount,
    aggregate.sleepEstimateMinutes,
    aggregate.mobilityRadiusMeters,
    aggregate.topActivity,
    aggregate.dataCompleteness,
    aggregate.computedAt,
  );
}

async function getLastConsecutiveFailures(
  database: SQLiteDatabase,
  collectorKey: CollectorKey,
): Promise<number> {
  const row = await database.getFirstAsync<{ consecutive_failures: number }>(
    `SELECT consecutive_failures
      FROM collector_diagnostics
      WHERE collector_key = ?
      ORDER BY recorded_at DESC
      LIMIT 1`,
    collectorKey,
  );

  return row?.consecutive_failures ?? 0;
}

async function getLatestSuccessMetadata(
  database: SQLiteDatabase,
  collectorKey: CollectorKey,
): Promise<{
  importedRecordCount: number | null;
  recordedAt: string | null;
}> {
  const row = await database.getFirstAsync<{
    imported_record_count: number | null;
    recorded_at: string | null;
  }>(
    `SELECT imported_record_count, recorded_at
      FROM collector_diagnostics
      WHERE collector_key = ? AND status = 'success'
      ORDER BY recorded_at DESC
      LIMIT 1`,
    collectorKey,
  );

  return {
    importedRecordCount: row?.imported_record_count ?? null,
    recordedAt: row?.recorded_at ?? null,
  };
}

export async function getLatestCollectorDiagnosticForKey(
  collectorKey: CollectorKey,
): Promise<CollectorDiagnosticRecord | null> {
  const database = await getLocalDatabase();
  const row = await database.getFirstAsync<DiagnosticRow>(
    `SELECT *
      FROM collector_diagnostics
      WHERE collector_key = ?
      ORDER BY recorded_at DESC
      LIMIT 1`,
    collectorKey,
  );

  return row ? mapDiagnosticRow(row) : null;
}

export async function initializeEventRepository(): Promise<void> {
  await enqueueDatabaseOperation(async () => {
    await getLocalDatabase();
  });
}

export async function getStoredEventCount(): Promise<number> {
  return enqueueDatabaseOperation(async () => {
    const database = await getLocalDatabase();
    const row = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM events",
    );
    return row?.count ?? 0;
  });
}

export async function getRepositoryDateBounds(): Promise<{
  end: string;
  start: string;
} | null> {
  return enqueueDatabaseOperation(async () => {
    const database = await getLocalDatabase();
    const row = await database.getFirstAsync<{
      max_timestamp_end: string | null;
      min_timestamp_start: string | null;
    }>(
      `SELECT
        MIN(timestamp_start) AS min_timestamp_start,
        MAX(timestamp_end) AS max_timestamp_end
        FROM events`,
    );

    if (!row?.min_timestamp_start || !row.max_timestamp_end) {
      return null;
    }

    return {
      end: toISODate(new Date(row.max_timestamp_end)),
      start: toISODate(new Date(row.min_timestamp_start)),
    };
  });
}

export async function logCollectorSuccess(
  collectorKey: CollectorKey,
  message: string,
  eventCount: number,
): Promise<void> {
  await enqueueRetriedWrite(async () => {
    const database = await getLocalDatabase();
    const timestamp = new Date().toISOString();
    const importedRecordCount =
      collectorKey === "healthConnect" ? eventCount : null;
    await database.runAsync(
      `INSERT INTO collector_diagnostics (
        id,
        collector_key,
        status,
        message,
        event_count,
        consecutive_failures,
        recorded_at,
        last_successful_sync_at,
        imported_record_count,
        time_since_last_good_run_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      createDiagnosticId(collectorKey),
      collectorKey,
      "success",
      message,
      eventCount,
      0,
      timestamp,
      timestamp,
      importedRecordCount,
      0,
    );
  });
}

export async function logCollectorFailure(
  collectorKey: CollectorKey,
  message: string,
): Promise<void> {
  await enqueueRetriedWrite(async () => {
    const database = await getLocalDatabase();
    const previousFailures = await getLastConsecutiveFailures(
      database,
      collectorKey,
    );
    const lastSuccess = await getLatestSuccessMetadata(database, collectorKey);
    const timestamp = new Date().toISOString();
    const timeSinceLastGoodRunMs = lastSuccess.recordedAt
      ? Math.max(
          0,
          new Date(timestamp).getTime() -
            new Date(lastSuccess.recordedAt).getTime(),
        )
      : null;

    await database.runAsync(
      `INSERT INTO collector_diagnostics (
        id,
        collector_key,
        status,
        message,
        event_count,
        consecutive_failures,
        recorded_at,
        last_successful_sync_at,
        imported_record_count,
        time_since_last_good_run_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      createDiagnosticId(collectorKey),
      collectorKey,
      "failure",
      message,
      0,
      previousFailures + 1,
      timestamp,
      lastSuccess.recordedAt,
      lastSuccess.importedRecordCount,
      timeSinceLastGoodRunMs,
    );
  });
}

export async function ensureCollectorFailureState(
  collectorKey: CollectorKey,
  message: string,
): Promise<void> {
  await enqueueRetriedWrite(async () => {
    const database = await getLocalDatabase();
    const row = await database.getFirstAsync<DiagnosticRow>(
      `SELECT *
        FROM collector_diagnostics
        WHERE collector_key = ?
        ORDER BY recorded_at DESC
        LIMIT 1`,
      collectorKey,
    );

    const latestDiagnostic = row ? mapDiagnosticRow(row) : null;

    if (
      latestDiagnostic?.status === "failure" &&
      latestDiagnostic.message === message
    ) {
      return;
    }

    const previousFailures = await getLastConsecutiveFailures(
      database,
      collectorKey,
    );
    const lastSuccess = await getLatestSuccessMetadata(database, collectorKey);
    const timestamp = new Date().toISOString();
    const timeSinceLastGoodRunMs = lastSuccess.recordedAt
      ? Math.max(
          0,
          new Date(timestamp).getTime() -
            new Date(lastSuccess.recordedAt).getTime(),
        )
      : null;

    await database.runAsync(
      `INSERT INTO collector_diagnostics (
        id,
        collector_key,
        status,
        message,
        event_count,
        consecutive_failures,
        recorded_at,
        last_successful_sync_at,
        imported_record_count,
        time_since_last_good_run_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      createDiagnosticId(collectorKey),
      collectorKey,
      "failure",
      message,
      0,
      previousFailures + 1,
      timestamp,
      lastSuccess.recordedAt,
      lastSuccess.importedRecordCount,
      timeSinceLastGoodRunMs,
    );
  });
}

export async function appendEventsForCollector(
  collectorKey: CollectorKey,
  events: ZentraEventRecord[],
  successMessage: string,
  assertActive?: () => void,
): Promise<void> {
  if (!events.length) {
    return;
  }

  await enqueueRetriedWrite(async () => {
    const database = await getLocalDatabase();
    const affectedDates = getLocalDatesForEvents(events);
    assertActive?.();
    const timestamp = new Date().toISOString();
    const importedRecordCount =
      collectorKey === "healthConnect" ? events.length : null;

    await database.execAsync("BEGIN IMMEDIATE");
    try {
      for (const event of events) {
        assertActive?.();
        if (
          event.dataType === "activity" &&
          event.metadata.activity_stream === "ios:core_motion"
        ) {
          await upsertActivityEvent(database, event);
          continue;
        }
        await database.runAsync(
          `INSERT OR IGNORE INTO events (
            id,
            timestamp_start,
            timestamp_end,
            data_type,
            source,
            value_numeric,
            value_text,
            value_json,
            unit,
            confidence,
            metadata,
            schema_version,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          event.id,
          event.timestampStart,
          event.timestampEnd,
          event.dataType,
          event.source,
          event.valueNumeric ?? null,
          event.valueText ?? null,
          event.valueJson ?? null,
          event.unit,
          event.confidence,
          JSON.stringify(event.metadata),
          event.schemaVersion,
          event.createdAt,
        );
      }

      await database.runAsync(
        `INSERT INTO collector_diagnostics (
          id,
          collector_key,
          status,
          message,
          event_count,
          consecutive_failures,
          recorded_at,
          last_successful_sync_at,
          imported_record_count,
          time_since_last_good_run_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        createDiagnosticId(collectorKey),
        collectorKey,
        "success",
        successMessage,
        events.length,
        0,
        timestamp,
        timestamp,
        importedRecordCount,
        0,
      );
      assertActive?.();
      await database.execAsync("COMMIT");
    } catch (error) {
      await database.execAsync("ROLLBACK");
      throw error;
    }

    for (const date of affectedDates) {
      await rebuildAggregateForDate(database, date);
    }
  });
}

export async function seedRepositoryEvents(
  events: ZentraEventRecord[],
): Promise<void> {
  if (!events.length || (await getStoredEventCount()) > 0) {
    return;
  }

  await enqueueRetriedWrite(async () => {
    const database = await getLocalDatabase();
    const affectedDates = getLocalDatesForEvents(events);

    await database.execAsync("BEGIN IMMEDIATE");
    try {
      for (const event of events) {
        await database.runAsync(
          `INSERT OR IGNORE INTO events (
            id,
            timestamp_start,
            timestamp_end,
            data_type,
            source,
            value_numeric,
            value_text,
            value_json,
            unit,
            confidence,
            metadata,
            schema_version,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          event.id,
          event.timestampStart,
          event.timestampEnd,
          event.dataType,
          event.source,
          event.valueNumeric ?? null,
          event.valueText ?? null,
          event.valueJson ?? null,
          event.unit,
          event.confidence,
          JSON.stringify(event.metadata),
          event.schemaVersion,
          event.createdAt,
        );
      }
      await database.execAsync("COMMIT");
    } catch (error) {
      await database.execAsync("ROLLBACK");
      throw error;
    }

    for (const date of affectedDates) {
      await rebuildAggregateForDate(database, date);
    }
  });
}

export async function getTodayLiveSnapshot(): Promise<TodayLiveSnapshot> {
  return enqueueDatabaseOperation(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const events = await getEventsBetween(
      today.toISOString(),
      tomorrow.toISOString(),
    );

    return buildTodaySnapshot(events);
  });
}

export async function getLatestCollectorDiagnostics(): Promise<
  CollectorDiagnosticRecord[]
> {
  return enqueueDatabaseOperation(async () => {
    const database = await getLocalDatabase();
    const rows = await database.getAllAsync<DiagnosticRow>(
      `SELECT diagnostics.*
        FROM collector_diagnostics diagnostics
        INNER JOIN (
          SELECT collector_key, MAX(recorded_at) AS max_recorded_at
          FROM collector_diagnostics
          GROUP BY collector_key
        ) latest
        ON diagnostics.collector_key = latest.collector_key
        AND diagnostics.recorded_at = latest.max_recorded_at
        ORDER BY diagnostics.collector_key ASC`,
    );

    return rows.map(mapDiagnosticRow);
  });
}

export async function getCollectorDiagnosticsHistory(
  limit = 50,
): Promise<CollectorDiagnosticRecord[]> {
  return enqueueDatabaseOperation(async () => {
    const database = await getLocalDatabase();
    const rows = await database.getAllAsync<DiagnosticRow>(
      `SELECT *
        FROM collector_diagnostics
        ORDER BY recorded_at DESC
        LIMIT ?`,
      limit,
    );

    return rows.map(mapDiagnosticRow);
  });
}

export async function getCollectorDiagnosticHistoryForKey(
  collectorKey: CollectorKey,
  limit = 20,
): Promise<CollectorDiagnosticRecord[]> {
  return enqueueDatabaseOperation(async () => {
    const database = await getLocalDatabase();
    const rows = await database.getAllAsync<DiagnosticRow>(
      `SELECT *
        FROM collector_diagnostics
        WHERE collector_key = ?
        ORDER BY recorded_at DESC
        LIMIT ?`,
      collectorKey,
      limit,
    );

    return rows.map(mapDiagnosticRow);
  });
}

export async function getDailyAggregatesForRange(
  start: string,
  end: string,
): Promise<DailyAggregateRecord[]> {
  return enqueueDatabaseOperation(async () => {
    const database = await getLocalDatabase();
    const dates = await database.getAllAsync<{ date: string }>(
      `SELECT DISTINCT date(timestamp_start,'localtime') AS date FROM events WHERE date(timestamp_start,'localtime') BETWEEN ? AND ? UNION SELECT DISTINCT date(timestamp_end,'localtime') AS date FROM events WHERE data_type='sleep_inferred' AND date(timestamp_end,'localtime') BETWEEN ? AND ?`,
      start,
      end,
      start,
      end,
    );
    const cached = await database.getAllAsync<{
      date: string;
      active_summary: string | null;
    }>(
      "SELECT date,active_summary FROM daily_aggregates WHERE date BETWEEN ? AND ?",
      start,
      end,
    );
    const present = new Set(cached.map((row) => row.date));
    for (const row of dates)
      if (!present.has(row.date))
        await rebuildAggregateForDate(database, row.date);
    for (const row of cached)
      if (
        !(await isActiveSummaryCurrent(database, row.date, row.active_summary))
      )
        await rebuildAggregateForDate(database, row.date);
    const rows = await database.getAllAsync<AggregateRow>(
      `SELECT * FROM daily_aggregates
        WHERE date >= ? AND date <= ?
        ORDER BY date ASC`,
      start,
      end,
    );

    return rows.map(mapAggregateRow);
  });
}

export async function getDailyAggregateForDate(
  date: string,
): Promise<DailyAggregateRecord | null> {
  return enqueueDatabaseOperation(async () => {
    const database = await getLocalDatabase();
    const row = await database.getFirstAsync<AggregateRow>(
      `SELECT * FROM daily_aggregates
        WHERE date = ?
        LIMIT 1`,
      date,
    );

    if (row) {
      if (await isActiveSummaryCurrent(database, date, row.active_summary))
        return mapAggregateRow(row);
      await rebuildAggregateForDate(database, date);
      const refreshed = await database.getFirstAsync<AggregateRow>(
        "SELECT * FROM daily_aggregates WHERE date=?",
        date,
      );
      return refreshed ? mapAggregateRow(refreshed) : null;
    }

    const events = await getAggregateEventsForDateWithDatabase(database, date);

    if (!events.length) {
      return null;
    }

    const activeSummary = await cachedActiveMinutes(
      database,
      date,
      events,
      () => loadActivityContext(database, date, mapEventRow),
    );
    const aggregate = buildDailyAggregateRecord(date, events, activeSummary);

    await database.runAsync(
      `INSERT OR REPLACE INTO daily_aggregates (
        date,
        steps_total,
        active_minutes,
        active_summary,
        distance_meters,
        screen_time_seconds,
        unlock_count,
        sleep_estimate_minutes,
        mobility_radius_meters,
        top_activity,
        data_completeness,
        computed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      aggregate.date,
      aggregate.stepsTotal,
      aggregate.activeMinutes,
      JSON.stringify(aggregate.activeSummary),
      aggregate.distanceMeters,
      aggregate.screenTimeSeconds,
      aggregate.unlockCount,
      aggregate.sleepEstimateMinutes,
      aggregate.mobilityRadiusMeters,
      aggregate.topActivity,
      aggregate.dataCompleteness,
      aggregate.computedAt,
    );

    return aggregate;
  });
}

export async function getGroupedEventsForRange(
  start: string,
  end: string,
): Promise<Record<string, ZentraEventRecord[]>> {
  return enqueueDatabaseOperation(async () => {
    const { startIso, endExclusiveIso } = getRangeBounds(start, end);
    const events = await getEventsBetween(startIso, endExclusiveIso);

    return events.reduce<Record<string, ZentraEventRecord[]>>(
      (result, event) => {
        result[event.dataType] = [...(result[event.dataType] ?? []), event];
        return result;
      },
      {},
    );
  });
}

export async function clearRepositoryData(): Promise<void> {
  cancelActivityHistory();
  cancelHealthSync();
  invalidateRepositorySession();
  await cancelNativeActivityHistory().catch(() => undefined);
  await enqueueRetriedWrite(async () => {
    const database = await getLocalDatabase();

    await database.runAsync("DELETE FROM events");
    await database.runAsync("DELETE FROM daily_aggregates");
    await database.runAsync("DELETE FROM derived_cache");
    await database.runAsync("DELETE FROM health_sync_state");
    await database.runAsync("DELETE FROM activity_history_state");
    await database.runAsync("DELETE FROM activity_history_records");
    await database.runAsync("DELETE FROM health_snapshot_records");
    await database.runAsync("DELETE FROM health_snapshot_runs");
    await database.runAsync("DELETE FROM event_changes");
    await database.runAsync("DELETE FROM collector_diagnostics");
  });
}

export async function recomputeDailyAggregatesForRange(
  start: string,
  end: string,
): Promise<void> {
  await enqueueRetriedWrite(async () => {
    const database = await getLocalDatabase();
    let current = start;

    while (current <= end) {
      await rebuildAggregateForDate(database, current);
      current = shiftISODate(current, 1);
    }
  });
}

export async function getEventsForRange(
  start: string,
  end: string,
): Promise<ZentraEventRecord[]> {
  return readEventRange(start, end);
}

/**
 * Events that touch a local day, including records from the day before that
 * run past midnight. The overlap filter runs in SQLite so the earlier day's
 * other rows never cross the bridge.
 */
export async function getEventsOverlappingDay(
  date: string,
): Promise<ZentraEventRecord[]> {
  return readEventRange(shiftISODate(date, -1), date, {
    where: "timestamp_end >= ?",
    params: [getRangeBounds(date, date).startIso],
  });
}

/** Records from the previous day that are still running at local midnight. */
export async function getEventsCarriedIntoDay(
  date: string,
): Promise<ZentraEventRecord[]> {
  const prior = shiftISODate(date, -1);
  return readEventRange(prior, prior, {
    where: "timestamp_end > ?",
    params: [getRangeBounds(date, date).startIso],
  });
}

export async function getLatestEventByType(
  dataType: ZentraEventRecord["dataType"],
): Promise<ZentraEventRecord | null> {
  return enqueueDatabaseOperation(async () => {
    const database = await getLocalDatabase();
    const row = await database.getFirstAsync<EventRow>(
      `SELECT * FROM events
        WHERE data_type = ?
        ORDER BY timestamp_start DESC
        LIMIT 1`,
      dataType,
    );

    return row ? mapEventRow(row) : null;
  });
}

export async function pruneLocationEventsBefore(
  cutoffIso: string,
): Promise<number> {
  return enqueueRetriedWrite(async () => {
    const database = await getLocalDatabase();
    const countRow = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count
        FROM events
        WHERE data_type = 'location' AND timestamp_start < ?`,
      cutoffIso,
    );
    const deletedCount = countRow?.count ?? 0;

    if (!deletedCount) {
      return 0;
    }

    await database.runAsync(
      `DELETE FROM events
        WHERE data_type = 'location' AND timestamp_start < ?`,
      cutoffIso,
    );

    return deletedCount;
  });
}

export async function getRepositoryRevision(
  start?: string,
  end?: string,
): Promise<string> {
  return enqueueDatabaseOperation(async () =>
    readDataRevision(await getLocalDatabase(), start, end),
  );
}

// Collectors add a change row per write; compact once a day's worth piles up.
const EVENT_CHANGE_COMPACTION_THRESHOLD = 5_000;
const EVENT_CHANGE_COMPACTION_CHUNK_DAYS = 7;

/**
 * Compact event_changes in short, separately queued chunks so screens reading
 * the database are never stuck behind one long delete. Resumes from the start
 * next time if the budget runs out before the marker is written.
 */
export async function compactEventChanges(
  options: { budgetMs?: number } = {},
): Promise<"skipped" | "partial" | "complete"> {
  const startedAtMs = Date.now();
  const state = await enqueueDatabaseOperation(async () =>
    readEventChangeCompactionState(await getLocalDatabase()),
  );
  if (
    !state.firstDate ||
    state.maxRevision - state.compactedRevision <
      EVENT_CHANGE_COMPACTION_THRESHOLD
  )
    return "skipped";

  let cursor: string | null = state.firstDate;
  while (cursor) {
    if (
      options.budgetMs != null &&
      Date.now() - startedAtMs >= options.budgetMs
    )
      return "partial";
    const from: string = cursor;
    cursor = await enqueueRetriedWrite(async () =>
      compactEventChangesFrom(
        await getLocalDatabase(),
        from,
        shiftISODate(from, EVENT_CHANGE_COMPACTION_CHUNK_DAYS),
      ),
    );
  }

  await enqueueRetriedWrite(async () =>
    markEventChangesCompacted(await getLocalDatabase(), state.maxRevision),
  );
  return "complete";
}

export async function getEventsByIds(
  ids: string[],
): Promise<ZentraEventRecord[]> {
  if (!ids.length) return [];
  return enqueueDatabaseOperation(async () => {
    const db = await getLocalDatabase();
    const rows = await db.getAllAsync<EventRow>(
      "SELECT * FROM events WHERE id IN (SELECT value FROM json_each(?)) ORDER BY timestamp_start",
      JSON.stringify(ids),
    );
    return rows.map(mapEventRow);
  });
}

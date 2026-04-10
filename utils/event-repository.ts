import type {
  CollectorDiagnosticRecord,
  CollectorKey,
  DailyAggregateRecord,
  TodayLiveSnapshot,
  ZentraEventRecord,
} from '@/types/zentra';
import { getLocalDatabase } from '@/utils/local-database';
import {
  buildDailyAggregateRecord,
  buildTodaySnapshot,
  getLocalDatesForEvents,
  getRangeBounds,
} from '@/utils/repository-aggregates';

interface EventRow {
  id: string;
  timestamp_start: string;
  timestamp_end: string;
  data_type: ZentraEventRecord['dataType'];
  source: ZentraEventRecord['source'];
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
  status: 'success' | 'failure';
  message: string | null;
  event_count: number;
  consecutive_failures: number;
  recorded_at: string;
}

function createDiagnosticId(collectorKey: CollectorKey): string {
  return `${collectorKey}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseMetadata(metadata: string): ZentraEventRecord['metadata'] {
  try {
    return JSON.parse(metadata) as ZentraEventRecord['metadata'];
  } catch {
    return {};
  }
}

function mapEventRow(row: EventRow): ZentraEventRecord {
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
  };
}

async function getEventsBetween(startIso: string, endExclusiveIso: string): Promise<ZentraEventRecord[]> {
  const database = await getLocalDatabase();
  const rows = await database.getAllAsync<EventRow>(
    `SELECT * FROM events
      WHERE timestamp_start >= ? AND timestamp_start < ?
      ORDER BY timestamp_start ASC`,
    startIso,
    endExclusiveIso,
  );

  return rows.map(mapEventRow);
}

async function rebuildAggregateForDate(date: string): Promise<void> {
  const database = await getLocalDatabase();
  const { startIso, endExclusiveIso } = getRangeBounds(date, date);
  const events = await getEventsBetween(startIso, endExclusiveIso);

  await database.runAsync('DELETE FROM daily_aggregates WHERE date = ?', date);

  if (!events.length) {
    return;
  }

  const aggregate = buildDailyAggregateRecord(date, events);

  await database.runAsync(
    `INSERT INTO daily_aggregates (
      date,
      steps_total,
      active_minutes,
      distance_meters,
      screen_time_seconds,
      unlock_count,
      sleep_estimate_minutes,
      mobility_radius_meters,
      top_activity,
      data_completeness,
      computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    aggregate.date,
    aggregate.stepsTotal,
    aggregate.activeMinutes,
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

async function getLastConsecutiveFailures(collectorKey: CollectorKey): Promise<number> {
  const database = await getLocalDatabase();
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

async function getLatestCollectorDiagnostic(
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
  await getLocalDatabase();
}

export async function getStoredEventCount(): Promise<number> {
  const database = await getLocalDatabase();
  const row = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM events');
  return row?.count ?? 0;
}

export async function logCollectorSuccess(
  collectorKey: CollectorKey,
  message: string,
  eventCount: number,
): Promise<void> {
  const database = await getLocalDatabase();
  await database.runAsync(
    `INSERT INTO collector_diagnostics (
      id,
      collector_key,
      status,
      message,
      event_count,
      consecutive_failures,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    createDiagnosticId(collectorKey),
    collectorKey,
    'success',
    message,
    eventCount,
    0,
    new Date().toISOString(),
  );
}

export async function logCollectorFailure(
  collectorKey: CollectorKey,
  message: string,
): Promise<void> {
  const database = await getLocalDatabase();
  const previousFailures = await getLastConsecutiveFailures(collectorKey);

  await database.runAsync(
    `INSERT INTO collector_diagnostics (
      id,
      collector_key,
      status,
      message,
      event_count,
      consecutive_failures,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    createDiagnosticId(collectorKey),
    collectorKey,
    'failure',
    message,
    0,
    previousFailures + 1,
    new Date().toISOString(),
  );
}

export async function ensureCollectorFailureState(
  collectorKey: CollectorKey,
  message: string,
): Promise<void> {
  const latestDiagnostic = await getLatestCollectorDiagnostic(collectorKey);

  if (latestDiagnostic?.status === 'failure' && latestDiagnostic.message === message) {
    return;
  }

  await logCollectorFailure(collectorKey, message);
}

export async function appendEventsForCollector(
  collectorKey: CollectorKey,
  events: ZentraEventRecord[],
  successMessage: string,
): Promise<void> {
  if (!events.length) {
    return;
  }

  const database = await getLocalDatabase();
  const affectedDates = getLocalDatesForEvents(events);

  await database.withTransactionAsync(async () => {
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

    await logCollectorSuccess(collectorKey, successMessage, events.length);

    for (const date of affectedDates) {
      await rebuildAggregateForDate(date);
    }
  });
}

export async function seedRepositoryEvents(
  events: ZentraEventRecord[],
): Promise<void> {
  if (!events.length || await getStoredEventCount() > 0) {
    return;
  }

  const database = await getLocalDatabase();
  const affectedDates = getLocalDatesForEvents(events);

  await database.withTransactionAsync(async () => {
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

    for (const date of affectedDates) {
      await rebuildAggregateForDate(date);
    }
  });
}

export async function getTodayLiveSnapshot(): Promise<TodayLiveSnapshot> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const events = await getEventsBetween(today.toISOString(), tomorrow.toISOString());

  return buildTodaySnapshot(events);
}

export async function getLatestCollectorDiagnostics(): Promise<CollectorDiagnosticRecord[]> {
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
}

export async function getDailyAggregatesForRange(
  start: string,
  end: string,
): Promise<DailyAggregateRecord[]> {
  const database = await getLocalDatabase();
  const rows = await database.getAllAsync<AggregateRow>(
    `SELECT * FROM daily_aggregates
      WHERE date >= ? AND date <= ?
      ORDER BY date ASC`,
    start,
    end,
  );

  return rows.map(mapAggregateRow);
}

export async function getGroupedEventsForRange(
  start: string,
  end: string,
): Promise<Record<string, ZentraEventRecord[]>> {
  const { startIso, endExclusiveIso } = getRangeBounds(start, end);
  const events = await getEventsBetween(startIso, endExclusiveIso);

  return events.reduce<Record<string, ZentraEventRecord[]>>((result, event) => {
    result[event.dataType] = [...(result[event.dataType] ?? []), event];
    return result;
  }, {});
}

export async function clearRepositoryData(): Promise<void> {
  const database = await getLocalDatabase();

  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM events');
    await database.runAsync('DELETE FROM daily_aggregates');
    await database.runAsync('DELETE FROM collector_diagnostics');
  });
}

import { reconcileHealthSnapshot } from "@/utils/health-snapshot";
import {
  cancelHealthSync,
  assertHealthSyncGeneration,
} from "@/utils/health-sync-session";
import { getLocalDatabase } from "@/utils/local-database";
import {
  enqueueDatabaseOperation,
  rebuildAggregateForDate,
} from "@/utils/event-repository";
import { getLocalDatesForEvents } from "@/utils/repository-aggregates";
import { toISODate } from "@/utils/dates";
import {
  HEALTH_RECORD_TYPES,
  type HealthRecordType,
  type HealthSyncState,
} from "@/types/health-sync";
import type { ZentraEventRecord } from "@/types/zentra";
import { upsertHealthEvent } from "@/utils/health-sync-sql";

/**
 * The import state of each record type, without the record counts. Four rows
 * read by primary key: use this wherever the counts are not shown.
 */
export async function getHealthSyncStatus(): Promise<HealthSyncState[]> {
  return enqueueDatabaseOperation(async () =>
    (await getLocalDatabase()).getAllAsync<HealthSyncState>(
      "SELECT * FROM health_sync_state ORDER BY record_type",
    ),
  );
}
/**
 * The same rows with how many records each type has imported and the span
 * they cover. It reads every imported record, so it is for the Health sources
 * card only.
 */
export async function getHealthSyncStates(): Promise<HealthSyncState[]> {
  return enqueueDatabaseOperation(async () =>
    (await getLocalDatabase()).getAllAsync<HealthSyncState>(
      `SELECT s.*,COUNT(e.id) AS record_count,MIN(e.timestamp_start) AS observed_start,MAX(e.timestamp_end) AS observed_end
       FROM health_sync_state s LEFT JOIN events e ON e.source='health_connect'
       AND e.data_type=CASE WHEN s.record_type='sleep' THEN 'sleep_inferred' ELSE s.record_type END
       AND json_extract(e.metadata,'$.platform_aggregate') IS NOT 1 AND json_extract(e.metadata,'$.stale_import') IS NOT 1 GROUP BY s.record_type`,
    ),
  );
}
export async function setHealthSyncStatus(
  type: HealthRecordType,
  status: string,
  message: string | null,
): Promise<void> {
  await enqueueDatabaseOperation(async () => {
    const db = await getLocalDatabase();
    await db.runAsync(
      "INSERT INTO health_sync_state(record_type,status,message) VALUES(?,?,?) ON CONFLICT(record_type) DO UPDATE SET status=excluded.status,message=excluded.message",
      type,
      status,
      message,
    );
  });
}
export async function resetHealthHistory(days: 30 | 90): Promise<void> {
  cancelHealthSync();
  await enqueueDatabaseOperation(async () => {
    const db = await getLocalDatabase();
    for (const type of HEALTH_RECORD_TYPES)
      await db.runAsync(
        "INSERT INTO health_sync_state(record_type,history_days,status) VALUES(?,?,'idle') ON CONFLICT(record_type) DO UPDATE SET cursor=NULL,history_days=excluded.history_days,status='idle',start_at=NULL,end_at=NULL",
        type,
        days,
      );
  });
}
export async function commitHealthPage(
  type: HealthRecordType,
  events: ZentraEventRecord[],
  deletedIds: string[],
  cursor: string | null,
  start: string,
  end: string,
  historyDays: number,
  hasMore: boolean,
  generation: number,
  statisticsRange?: { start: string; end: string },
  snapshotStart = false,
): Promise<void> {
  await enqueueDatabaseOperation(async () => {
    assertHealthSyncGeneration(generation);
    const db = await getLocalDatabase();
    const dates = new Set(getLocalDatesForEvents(events));
    await db.execAsync("BEGIN IMMEDIATE");
    try {
      for (const id of [
        ...deletedIds,
        ...events.map((event) => String(event.metadata.record_id)),
      ]) {
        const old = await db.getAllAsync<{
          timestamp_start: string;
          timestamp_end: string;
        }>(
          "SELECT timestamp_start,timestamp_end FROM events WHERE source='health_connect' AND json_extract(metadata,'$.record_id')=?",
          id,
        );
        for (const event of old) {
          dates.add(toISODate(new Date(event.timestamp_start)));
          dates.add(toISODate(new Date(event.timestamp_end)));
        }
      }
      if (type === "steps" && deletedIds.length) {
        // Recomputed statistics below replace affected totals, including newly empty days.
        for (const date of dates)
          await db.runAsync(
            "DELETE FROM events WHERE data_type='steps' AND source='health_connect' AND json_extract(metadata,'$.platform_aggregate')=1 AND date(timestamp_start,'localtime')=?",
            date,
          );
      }
      for (const id of deletedIds)
        await db.runAsync(
          "DELETE FROM events WHERE source='health_connect' AND data_type=? AND json_extract(metadata,'$.record_id')=?",
          type === "sleep" ? "sleep_inferred" : type,
          id,
        );
      if (statisticsRange) {
        const previous = await db.getAllAsync<{ date: string }>(
          "SELECT DISTINCT date(timestamp_start,'localtime') AS date FROM events WHERE source='health_connect' AND data_type='steps' AND json_extract(metadata,'$.platform_aggregate')=1 AND timestamp_start>=? AND timestamp_start<?",
          statisticsRange.start,
          statisticsRange.end,
        );
        for (const row of previous) dates.add(row.date);
        // Null platform buckets mean no readable total; remove obsolete totals too.
        await db.runAsync(
          "DELETE FROM events WHERE source='health_connect' AND data_type='steps' AND json_extract(metadata,'$.platform_aggregate')=1 AND timestamp_start>=? AND timestamp_start<? AND id NOT IN (SELECT value FROM json_each(?))",
          statisticsRange.start,
          statisticsRange.end,
          JSON.stringify(
            events
              .filter((event) => event.metadata.platform_aggregate === true)
              .map((event) => event.id),
          ),
        );
      }
      for (const event of events) await upsertHealthEvent(db, event);
      for (const date of await reconcileHealthSnapshot(
        db,
        type,
        events,
        start,
        end,
        snapshotStart,
        !hasMore,
      ))
        dates.add(date);
      for (const date of dates) await rebuildAggregateForDate(db, date);
      await db.runAsync(
        "INSERT INTO health_sync_state(record_type,cursor,history_days,status,message,updated_at,start_at,end_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(record_type) DO UPDATE SET cursor=excluded.cursor,history_days=excluded.history_days,status=excluded.status,message=excluded.message,updated_at=excluded.updated_at,start_at=excluded.start_at,end_at=excluded.end_at",
        type,
        cursor,
        historyDays,
        hasMore ? "importing" : "ready",
        events.length ? null : "No new readable records",
        new Date().toISOString(),
        start,
        end,
      );
      await db.execAsync("COMMIT");
    } catch (error) {
      await db.execAsync("ROLLBACK");
      throw error;
    }
  });
}

import type { SQLiteDatabase } from "expo-sqlite";
import type { ZentraEventRecord } from "@/types/zentra";
import { toISODate } from "@/utils/dates";

/** A resnapshot cannot prove deletion (especially on iOS). Retain unreadable originals,
 * but exclude them from current metrics until observed again. Explicit deletions remove rows. */
export async function reconcileHealthSnapshot(
  db: SQLiteDatabase,
  type: string,
  events: ZentraEventRecord[],
  start: string,
  end: string,
  fresh: boolean,
  complete: boolean,
): Promise<string[]> {
  if (fresh) {
    await db.runAsync(
      "INSERT OR IGNORE INTO health_snapshot_runs(record_type) VALUES(?)",
      type,
    );
    await db.runAsync(
      "DELETE FROM health_snapshot_records WHERE record_type=?",
      type,
    );
  }
  const active = await db.getFirstAsync(
    "SELECT record_type FROM health_snapshot_runs WHERE record_type=?",
    type,
  );
  if (!active) return [];
  for (const event of events.filter(
    (e) => e.metadata.platform_aggregate !== true,
  ))
    await db.runAsync(
      "INSERT OR IGNORE INTO health_snapshot_records(record_type,event_id) VALUES(?,?)",
      type,
      event.id,
    );
  if (!complete) return [];
  const dataType = type === "sleep" ? "sleep_inferred" : type;
  const unseen = await db.getAllAsync<{
    id: string;
    timestamp_start: string;
    timestamp_end: string;
  }>(
    `SELECT id,timestamp_start,timestamp_end FROM events WHERE source='health_connect' AND data_type=? AND timestamp_start>=? AND timestamp_start<? AND json_extract(metadata,'$.platform_aggregate') IS NOT 1 AND id NOT IN(SELECT event_id FROM health_snapshot_records WHERE record_type=?)`,
    dataType,
    start,
    end,
    type,
  );
  for (const row of unseen)
    await db.runAsync(
      "UPDATE events SET metadata=json_set(metadata,'$.stale_import',json('true')) WHERE id=? AND json_extract(metadata,'$.stale_import') IS NOT 1",
      row.id,
    );
  await db.runAsync(
    "DELETE FROM health_snapshot_records WHERE record_type=?",
    type,
  );
  await db.runAsync(
    "DELETE FROM health_snapshot_runs WHERE record_type=?",
    type,
  );
  return unseen.flatMap((row) => [
    toISODate(new Date(row.timestamp_start)),
    toISODate(new Date(row.timestamp_end)),
  ]);
}

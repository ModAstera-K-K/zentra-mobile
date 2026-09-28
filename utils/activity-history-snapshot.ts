import type { SQLiteDatabase } from "expo-sqlite";
import {
  CORE_MOTION_STREAM,
  type ActivityHistoryWindow,
  type ActivityHistoryPage,
} from "@/types/activity-history";

export interface ActivitySnapshot {
  window: ActivityHistoryWindow;
  page: ActivityHistoryPage;
}

export async function beginActivitySnapshot(
  db: SQLiteDatabase,
  snapshot: ActivitySnapshot,
): Promise<string> {
  const key = `${snapshot.window.start}|${snapshot.window.end}`;
  if (!snapshot.window.cursor)
    await db.runAsync(
      "DELETE FROM activity_history_records WHERE window_key=?",
      key,
    );
  return key;
}

/** Only a completed, nonempty OS snapshot can supersede earlier Core Motion classifications. */
export async function finishActivitySnapshot(
  db: SQLiteDatabase,
  snapshot: ActivitySnapshot,
  key: string,
): Promise<void> {
  if (snapshot.page.hasMore) return;
  const seen = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM activity_history_records WHERE window_key=?",
    key,
  );
  if (seen?.count) {
    await db.runAsync(
      `UPDATE events SET metadata=json_set(metadata,'$.stale_import',json('true'))
       WHERE data_type='activity' AND source IN ('activity_recognition','native_buffered')
       AND (json_extract(metadata,'$.activity_stream')=? OR json_extract(metadata,'$.activity_stream') IS NULL)
       AND julianday(timestamp_start)>=julianday(?) AND julianday(timestamp_start)<julianday(?)
       AND json_extract(metadata,'$.stale_import') IS NOT 1
       AND id NOT IN (SELECT event_id FROM activity_history_records WHERE window_key=?)`,
      CORE_MOTION_STREAM,
      snapshot.page.queriedStart,
      snapshot.page.queriedEnd,
      key,
    );
  }
  await db.runAsync(
    "DELETE FROM activity_history_records WHERE window_key=?",
    key,
  );
}

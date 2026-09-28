import type { SQLiteDatabase } from "expo-sqlite";
import type { EventRow } from "@/utils/event-repository";
import type { ZentraEventRecord } from "@/types/zentra";
import { parseISODate, shiftISODate } from "@/utils/dates";

/** Read only adjacent-day evidence; a real next-day exit can close yesterday's bout. */
export async function loadActivityContext(
  db: SQLiteDatabase,
  date: string,
  map: (row: EventRow) => ZentraEventRecord,
): Promise<ZentraEventRecord[]> {
  const begin = parseISODate(date).toISOString();
  const end = parseISODate(shiftISODate(date, 1)).toISOString();
  const rows = await db.getAllAsync<EventRow>(
    `SELECT * FROM events WHERE timestamp_start >= ? AND timestamp_start < ?
     AND ((data_type IN ('activity','steps') AND timestamp_start < ?)
       OR (data_type='activity' AND timestamp_start >= ?)) ORDER BY timestamp_start`,
    parseISODate(shiftISODate(date, -1)).toISOString(),
    parseISODate(shiftISODate(date, 2)).toISOString(),
    begin,
    end,
  );
  return rows.map(map);
}

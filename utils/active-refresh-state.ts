import { enqueueDatabaseOperation } from "@/utils/event-repository";
import { getLocalDatabase } from "@/utils/local-database";
import { shiftISODate } from "@/utils/dates";
/** Cheap signature checks avoid rescanning calibration history on unrelated collector writes. */
export async function activeRangeRevision(
  start: string,
  end: string,
): Promise<string> {
  return enqueueDatabaseOperation(async () => {
    const row = await (
      await getLocalDatabase()
    ).getFirstAsync<{ revision: number }>(
      "SELECT COALESCE(MAX(revision),0) AS revision FROM event_changes WHERE data_type IN ('steps','activity','exercise_session','motion_context','active_timing') AND start_date <= ? AND end_date >= ?",
      end,
      shiftISODate(start, -1),
    );
    return `${start}:${end}:${row?.revision ?? 0}`;
  });
}

/** Only days with walking evidence can contribute a calibration bout. */
export async function calibrationDates(
  start: string,
  end: string,
): Promise<Set<string>> {
  return enqueueDatabaseOperation(async () => {
    const rows = await (
      await getLocalDatabase()
    ).getAllAsync<{ date: string }>(
      `SELECT DISTINCT date(timestamp_start,'localtime') AS date FROM events WHERE data_type IN ('activity','exercise_session') AND value_text IN ('walking','on_foot','hiking') AND date(timestamp_start,'localtime') BETWEEN ? AND ? AND json_extract(metadata,'$.stale_import') IS NOT 1`,
      start,
      end,
    );
    return new Set(rows.map((r) => r.date));
  });
}

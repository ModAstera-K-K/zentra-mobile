import type { SQLiteDatabase } from "expo-sqlite";
import type { ZentraEventRecord } from "@/types/zentra";
export async function upsertHealthEvent(
  db: SQLiteDatabase,
  e: ZentraEventRecord,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO events(id,timestamp_start,timestamp_end,data_type,source,value_numeric,value_text,value_json,unit,confidence,metadata,schema_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(id) DO UPDATE SET timestamp_start=excluded.timestamp_start,timestamp_end=excluded.timestamp_end,value_numeric=excluded.value_numeric,value_text=excluded.value_text,value_json=excluded.value_json,unit=excluded.unit,metadata=excluded.metadata
 WHERE events.source='health_connect' AND (events.timestamp_start IS NOT excluded.timestamp_start OR events.timestamp_end IS NOT excluded.timestamp_end OR events.value_numeric IS NOT excluded.value_numeric OR events.value_text IS NOT excluded.value_text OR events.value_json IS NOT excluded.value_json OR events.unit IS NOT excluded.unit OR events.metadata IS NOT excluded.metadata)`,
    e.id,
    e.timestampStart,
    e.timestampEnd,
    e.dataType,
    e.source,
    e.valueNumeric ?? null,
    e.valueText ?? null,
    e.valueJson ?? null,
    e.unit,
    e.confidence,
    JSON.stringify(e.metadata),
    e.schemaVersion,
    e.createdAt,
  );
}

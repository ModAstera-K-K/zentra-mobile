import type { DatabaseSync } from "node:sqlite";
import type { ZentraEventRecord } from "@/types/zentra";

export function restRows(db: DatabaseSync): ZentraEventRecord[] {
  return db.prepare("SELECT * FROM events").all().map((row) => ({
    id: String(row.id), timestampStart: String(row.timestamp_start), timestampEnd: String(row.timestamp_end),
    dataType: row.data_type as ZentraEventRecord["dataType"], source: row.source as ZentraEventRecord["source"],
    valueNumeric: row.value_numeric === null ? undefined : Number(row.value_numeric),
    unit: String(row.unit), confidence: Number(row.confidence), metadata: JSON.parse(String(row.metadata)),
    schemaVersion: Number(row.schema_version), createdAt: String(row.created_at),
  }));
}

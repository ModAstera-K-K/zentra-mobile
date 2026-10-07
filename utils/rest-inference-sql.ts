import type { SQLiteDatabase } from "expo-sqlite";
import type { ZentraEventRecord } from "@/types/zentra";

/** Derived records are replaceable; replaying unchanged evidence must not churn revisions. */
export async function upsertRestEvent(db: SQLiteDatabase, event: ZentraEventRecord): Promise<void> {
  await db.runAsync(`INSERT INTO events(id,timestamp_start,timestamp_end,data_type,source,value_numeric,unit,confidence,metadata,schema_version,created_at)
    VALUES(?,?,?,'sleep_inferred','inferred',?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET timestamp_start=excluded.timestamp_start,timestamp_end=excluded.timestamp_end,
      value_numeric=excluded.value_numeric,confidence=excluded.confidence,metadata=excluded.metadata,created_at=excluded.created_at
    WHERE events.source='inferred' AND events.data_type='sleep_inferred' AND
      (events.timestamp_start IS NOT excluded.timestamp_start OR events.timestamp_end IS NOT excluded.timestamp_end
       OR events.value_numeric IS NOT excluded.value_numeric OR events.confidence IS NOT excluded.confidence OR events.metadata IS NOT excluded.metadata)`,
  event.id, event.timestampStart, event.timestampEnd, event.valueNumeric ?? null, event.unit, event.confidence,
  JSON.stringify(event.metadata), event.schemaVersion, event.createdAt);
}

export function isOwnedAutomaticRest(event: ZentraEventRecord): boolean {
  return event.source === "inferred" && event.dataType === "sleep_inferred" && event.metadata.rest_user_adjusted !== true
    && (event.id.startsWith("rest-inferred-v2-") || event.id.startsWith("sleep-inferred-"));
}

export async function commitRestEstimates(db: SQLiteDatabase, next: ZentraEventRecord[], previous: ZentraEventRecord[], dates: string[], assertActive: () => void): Promise<ZentraEventRecord[]> {
  const ids = new Set(next.map((e) => e.id));
  const affected: ZentraEventRecord[] = [];
  const oldById = new Map(previous.map((e) => [e.id, e]));
  assertActive();
  await db.execAsync("BEGIN IMMEDIATE");
  try {
    for (const event of previous) {
      const date = String(event.metadata.rest_wake_date ?? event.metadata.inferred_for_date ?? "");
      if (isOwnedAutomaticRest(event) && dates.includes(date) && !ids.has(event.id) && event.metadata.stale_import !== true) {
        await db.runAsync("UPDATE events SET metadata=json_set(metadata,'$.stale_import',json('true')) WHERE id=? AND json_extract(metadata,'$.stale_import') IS NOT 1", event.id);
        affected.push(event);
      }
    }
    for (const event of next) {
      assertActive();
      const old = oldById.get(event.id);
      if (old && old.timestampStart === event.timestampStart && old.timestampEnd === event.timestampEnd
        && old.valueNumeric === event.valueNumeric && old.confidence === event.confidence
        && JSON.stringify(old.metadata) === JSON.stringify(event.metadata)) continue;
      await upsertRestEvent(db, event);
      if (old) affected.push(old);
      affected.push(event);
    }
    assertActive();
    await db.execAsync("COMMIT");
    return affected;
  } catch (error) {
    await db.execAsync("ROLLBACK");
    throw error;
  }
}

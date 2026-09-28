import {
  beginActivitySnapshot,
  finishActivitySnapshot,
  type ActivitySnapshot,
} from "@/utils/activity-history-snapshot";
import type { SQLiteDatabase } from "expo-sqlite";
import type { ActivityHistoryState } from "@/types/activity-history";
import { CORE_MOTION_STREAM } from "@/types/activity-history";
import type { ZentraEventRecord } from "@/types/zentra";

export async function readActivityHistoryState(
  db: SQLiteDatabase,
): Promise<ActivityHistoryState | null> {
  const row = await db.getFirstAsync<{ payload: string }>(
    "SELECT payload FROM activity_history_state WHERE stream_id=?",
    CORE_MOTION_STREAM,
  );
  return row ? JSON.parse(row.payload) : null;
}

export async function writeActivityHistoryState(
  db: SQLiteDatabase,
  state: ActivityHistoryState,
): Promise<void> {
  await db.runAsync(
    "INSERT OR REPLACE INTO activity_history_state(stream_id,payload) VALUES(?,?)",
    CORE_MOTION_STREAM,
    JSON.stringify(state),
  );
  await db.runAsync(
    "DELETE FROM activity_history_records WHERE window_key NOT IN (SELECT value FROM json_each(?))",
    JSON.stringify(
      state.windows.map((window) => `${window.start}|${window.end}`),
    ),
  );
}

/** Preserve the first delivery's raw identity/source while enriching its provenance. */
export async function upsertActivityEvent(
  db: SQLiteDatabase,
  event: ZentraEventRecord,
): Promise<string> {
  const old = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM events WHERE data_type='activity' AND (
      id=? OR (timestamp_start IN (?,?) AND value_text=? AND json_extract(metadata,'$.transition')=?
      AND source IN ('activity_recognition','native_buffered')
      AND (json_extract(metadata,'$.activity_stream') IS NULL OR json_extract(metadata,'$.activity_stream')=?))
    ) ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END LIMIT 1`,
    event.id,
    event.timestampStart,
    event.timestampStart.replace(".000Z", "Z"),
    event.valueText ?? null,
    event.metadata.transition,
    CORE_MOTION_STREAM,
    event.id,
  );
  const metadata: ZentraEventRecord["metadata"] = {
    ...event.metadata,
    stale_import: false,
    ...(event.metadata.activity_delivery === "history"
      ? { activity_history: true }
      : { activity_live: true }),
  };
  // Delivery flags accumulate without making each replay alternate the stored metadata.
  delete metadata.activity_delivery;
  await db.runAsync(
    `INSERT INTO events(id,timestamp_start,timestamp_end,data_type,source,value_text,unit,confidence,metadata,schema_version,created_at)
     VALUES(?,?,?,'activity',?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET confidence=excluded.confidence,metadata=json_patch(events.metadata,excluded.metadata)
     WHERE events.data_type='activity' AND (events.confidence IS NOT excluded.confidence
       OR events.metadata IS NOT json_patch(events.metadata,excluded.metadata))`,
    old?.id ?? event.id,
    event.timestampStart,
    event.timestampEnd,
    event.source,
    event.valueText ?? null,
    event.unit,
    event.confidence,
    JSON.stringify(metadata),
    event.schemaVersion,
    event.createdAt,
  );
  return old?.id ?? event.id;
}

/** Cursor durability and event durability share the same transaction, even for empty pages. */
export async function commitActivityHistoryPage(
  db: SQLiteDatabase,
  events: ZentraEventRecord[],
  state: ActivityHistoryState,
  assertActive: () => void,
  snapshot?: ActivitySnapshot,
): Promise<void> {
  assertActive();
  await db.execAsync("BEGIN IMMEDIATE");
  try {
    const key = snapshot ? await beginActivitySnapshot(db, snapshot) : null;
    for (const event of events) {
      assertActive();
      const id = await upsertActivityEvent(db, event);
      if (key)
        await db.runAsync(
          "INSERT OR IGNORE INTO activity_history_records(window_key,event_id) VALUES(?,?)",
          key,
          id,
        );
    }
    assertActive();
    if (snapshot && key) await finishActivitySnapshot(db, snapshot, key);
    await writeActivityHistoryState(db, state);
    assertActive();
    await db.execAsync("COMMIT");
  } catch (error) {
    await db.execAsync("ROLLBACK");
    throw error;
  }
}

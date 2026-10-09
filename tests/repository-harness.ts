import type { ZentraEventRecord } from "@/types/zentra";
import { parseISODate } from "@/utils/dates";
import { getLocalDatabase } from "@/utils/local-database";
import type { SqliteAdapter } from "./sqlite-adapter";

const MINUTE = 60_000;

/** The app's own database, opened and migrated by the app's own code. */
export async function openTestRepository(): Promise<SqliteAdapter> {
  return (await getLocalDatabase()) as unknown as SqliteAdapter;
}

/** Rows written straight to the table, as stored events look after a collector ran. */
export function insertEvents(
  adapter: SqliteAdapter,
  events: ZentraEventRecord[],
): void {
  const insert = adapter.db.prepare(
    `INSERT INTO events (id, timestamp_start, timestamp_end, data_type, source,
      value_numeric, value_text, value_json, unit, confidence, metadata,
      schema_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  adapter.db.exec("BEGIN");
  for (const event of events)
    insert.run(
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
  adapter.db.exec("COMMIT");
}

export function storedEvent(
  id: string,
  dataType: ZentraEventRecord["dataType"],
  startMs: number,
  fields: Partial<ZentraEventRecord> = {},
): ZentraEventRecord {
  const timestamp = new Date(startMs).toISOString();
  return {
    id,
    timestampStart: timestamp,
    timestampEnd: timestamp,
    dataType,
    source: "sensor",
    unit: "count",
    confidence: 1,
    metadata: {},
    schemaVersion: 1,
    createdAt: timestamp,
    ...fields,
  };
}

/**
 * A local day of default-collector data up to `untilMs`: battery readings,
 * step deltas, app sessions, unlocks and the usage coverage row. About 1,200
 * rows for a whole day, so a day read spans several 500-row pages.
 */
export function ordinaryDay(date: string, untilMs = Infinity): ZentraEventRecord[] {
  const dayStart = parseISODate(date).getTime();
  const end = Math.min(untilMs, dayStart + 24 * 60 * MINUTE);
  const events: ZentraEventRecord[] = [];
  for (let at = dayStart, minute = 0; at < end; at += MINUTE, minute++) {
    if (minute % 2 === 0)
      events.push(
        storedEvent(`battery-${date}-${minute}`, "charging_state", at, {
          source: "system_broadcast",
          valueNumeric: 0.8,
          valueText: "Unplugged",
          unit: "fraction",
        }),
      );
    if (minute % 5 === 0)
      events.push(
        storedEvent(`steps-${date}-${minute}`, "steps", at, {
          valueNumeric: minute * 4,
        }),
      );
    if (minute % 10 === 0)
      events.push(
        storedEvent(`usage-${date}-${minute}`, "app_usage", at, {
          source: "usage_stats",
          timestampEnd: new Date(Math.min(at + MINUTE, end)).toISOString(),
          valueNumeric: 45,
          valueText: "com.example.app",
          unit: "seconds",
        }),
      );
    if (minute % 20 === 0)
      events.push(
        storedEvent(`unlock-${date}-${minute}`, "unlock_event", at, {
          source: "usage_stats",
        }),
      );
  }
  if (end > dayStart)
    events.push(
      storedEvent(`usage-coverage-${date}`, "app_usage", dayStart, {
        source: "usage_stats",
        timestampEnd: new Date(end).toISOString(),
        valueNumeric: 0,
        unit: "seconds",
        metadata: { coverage_window: true },
      }),
    );
  return events;
}

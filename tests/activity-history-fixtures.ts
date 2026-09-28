import { URL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { REVISION_SCHEMA } from "@/utils/repository-revision";
import { ACTIVE_MINUTES_MIGRATION } from "@/utils/active-minutes-migration";
import { ACTIVITY_HISTORY_MIGRATION } from "@/utils/activity-history-migration";
import { activityTransitionMetadata } from "@/utils/activity-stream";
import type {
  ActivityHistoryPage,
  ActivityHistoryWindow,
  ActivityTransition,
} from "@/types/activity-history";
import type { ZentraEventRecord } from "@/types/zentra";

export function activityDatabase() {
  const db = new DatabaseSync(":memory:");
  const schema = readFileSync(
    new URL("../utils/local-database.ts", import.meta.url),
    "utf8",
  );
  db.exec(schema.match(/const SCHEMA_SQL = `([\s\S]*?)`;/)![1]);
  db.exec(REVISION_SCHEMA);
  db.exec(ACTIVE_MINUTES_MIGRATION);
  db.exec(ACTIVITY_HISTORY_MIGRATION);
  const adapter = {
    execAsync: async (sql: string) => db.exec(sql),
    runAsync: async (sql: string, ...values: unknown[]) =>
      db.prepare(sql).run(...(values as never[])),
    getFirstAsync: async (sql: string, ...values: unknown[]) =>
      db.prepare(sql).get(...(values as never[])),
    getAllAsync: async (sql: string, ...values: unknown[]) =>
      db.prepare(sql).all(...(values as never[])),
  };
  return { db, adapter };
}

export function activityRecord(
  time: string,
  transition: "enter" | "exit",
  kind = "walking",
  delivery: "live" | "history" = "history",
): ZentraEventRecord {
  const payload: ActivityTransition = {
    id: `activity-${kind}-${transition}-${time}`,
    timestamp: time,
    transitionType: transition,
    activityType: kind,
    confidence: 0.95,
    platform: "ios",
    streamId: "ios:core_motion",
    delivery,
  };
  return {
    id: payload.id,
    timestampStart: time,
    timestampEnd: time,
    dataType: "activity",
    source: delivery === "live" ? "activity_recognition" : "native_buffered",
    valueText: kind,
    unit: "transition",
    confidence: 0.95,
    metadata: activityTransitionMetadata(payload),
    createdAt: time,
    schemaVersion: 1,
  };
}

export function activityPage(
  window: ActivityHistoryWindow,
  overrides: Partial<ActivityHistoryPage> = {},
): ActivityHistoryPage {
  return {
    transitions: [],
    nextCursor: null,
    hasMore: false,
    queriedStart: window.start,
    queriedEnd: window.end,
    availableStart: "2026-09-21T03:00:00.000Z",
    truncated: false,
    ...overrides,
  };
}

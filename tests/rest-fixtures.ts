import type { ZentraEventRecord } from "@/types/zentra";
import { activityRecord } from "./activity-history-fixtures";

export const restNow = () => new Date("2026-09-30T10:00:00");
export const localStamp = (value: string) => new Date(value).toISOString();

export function restEvent(type: ZentraEventRecord["dataType"], start: string, end = start, extra: Partial<ZentraEventRecord> = {}): ZentraEventRecord {
  return { id: `${type}-${start}-${end}`, dataType: type, timestampStart: localStamp(start), timestampEnd: localStamp(end),
    source: "sensor", confidence: 1, unit: "count", metadata: {}, createdAt: restNow().toISOString(), schemaVersion: 1, ...extra };
}
export function stillNight(start = "2026-09-29T23:00:00", end = "2026-09-30T07:00:00", stream = "ios:core_motion"): ZentraEventRecord[] {
  return [activityRecord(localStamp(start), "enter", "still"), activityRecord(localStamp(end), "exit", "still")]
    .map((e) => ({ ...e, metadata: { ...e.metadata, activity_stream: stream } }));
}
export function screenNight(start = "2026-09-29T23:00:00", end = "2026-09-30T07:00:00"): ZentraEventRecord[] {
  return [restEvent("screen_state", start, start, { source: "usage_stats", valueText: "non_interactive" }),
    restEvent("screen_state", end, end, { source: "usage_stats", valueText: "interactive" }),
    restEvent("app_usage", "2026-09-29T00:00:00", "2026-09-30T09:00:00", { source: "usage_stats", valueNumeric: 0, metadata: { coverage_window: true } })];
}
export function restTimezone<T>(zone: string, work: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try { return work(); } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

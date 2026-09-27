import type { ZentraEventRecord } from "@/types/zentra";
import type { MetricObservation } from "@/types/insights";
import { shiftISODate } from "@/utils/dates";
export function event(
  id: string,
  value: number,
  source: ZentraEventRecord["source"] = "sensor",
  metadata: ZentraEventRecord["metadata"] = {},
): ZentraEventRecord {
  return {
    id,
    timestampStart: "2026-09-10T10:00:00Z",
    timestampEnd: "2026-09-10T11:00:00Z",
    dataType: "steps",
    source,
    valueNumeric: value,
    unit: "count",
    confidence: 1,
    metadata,
    schemaVersion: 1,
    createdAt: "2026-09-10T11:00:00Z",
  };
}
export function history(value = 100): MetricObservation[] {
  return Array.from({ length: 14 }, (_, i) => ({
    date: shiftISODate("2026-09-27", i - 14),
    metric: "steps",
    revision: "1",
    value: i < 7 ? value : 200,
    unit: "steps",
    quality: "measured",
    provenance: "healthkit",
    coverage: "available records",
    updatedAt: null,
    recordIds: [],
  }));
}

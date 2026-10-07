import type { ZentraEventRecord } from "@/types/zentra";

interface QueryCoverage { start: number; end: number; recordIds: string[] }
/** Disjoint queried spans retain the earliest covering records as stable provenance. */
export function mergedRestQueryCoverage(events: ZentraEventRecord[]): QueryCoverage[] {
  const result: QueryCoverage[] = [];
  for (const event of events) {
    if (event.source !== "usage_stats" || event.metadata.coverage_window !== true) continue;
    const start = Date.parse(event.timestampStart), end = Date.parse(event.timestampEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const coveredThrough = result.at(-1)?.end ?? -Infinity;
    if (end > Math.max(start, coveredThrough)) result.push({ start: Math.max(start, coveredThrough), end, recordIds: [event.id] });
  }
  return result;
}

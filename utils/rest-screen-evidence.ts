import type { ZentraEventRecord } from "@/types/zentra";
import type { RestInterval } from "@/types/rest-inference";
import { mergedRestQueryCoverage } from "@/utils/rest-query-coverage";

/** Only queried portions of a closed screen state count as evidence. */
export function screenRestEvidence(events: ZentraEventRecord[]): RestInterval[] {
  const coverage = mergedRestQueryCoverage(events);
  const states = events.filter((e) => e.dataType === "screen_state" && ["interactive", "non_interactive"].includes(e.valueText ?? ""));
  const result: RestInterval[] = [];
  let first: ZentraEventRecord | undefined;
  let coverageIndex = 0;
  for (const event of states) {
    if (first?.valueText === event.valueText) continue;
    if (first) {
      const intervalStart = Date.parse(first.timestampStart), intervalEnd = Date.parse(event.timestampStart);
      while (coverageIndex < coverage.length && coverage[coverageIndex].end <= intervalStart) coverageIndex++;
      for (let index = coverageIndex; index < coverage.length && coverage[index].start < intervalEnd; index++) {
        const query = coverage[index];
        const start = Math.max(Date.parse(first.timestampStart), query.start);
        const end = Math.min(Date.parse(event.timestampStart), query.end);
        if (end > start) result.push({ start, end, kind: first.valueText === "non_interactive" ? "rest" : "active",
          signals: [first.valueText === "non_interactive" ? "Covered screen-off history" : "Screen interaction"],
          recordIds: [first.id, event.id, ...query.recordIds] });
      }
    }
    first = event;
  }
  return result;
}

import type { RestCandidate } from "@/types/rest-inference";
import type { ZentraEventRecord } from "@/types/zentra";
import { restContext } from "@/utils/rest-context";
import { REST_ALGORITHM_VERSION } from "@/utils/rest-window";

export function createRestEvent(candidate: RestCandidate, events: ZentraEventRecord[], wakeDate: string, now: Date): ZentraEventRecord {
  const signals = [...new Set(candidate.intervals.filter((i) => i.kind === "rest").flatMap((i) => i.signals))];
  const evidence = [...signals, ...restContext(candidate, events)];
  const moderate = signals.includes("Phone stillness") && signals.includes("Covered screen-off history");
  return {
    id: `rest-inferred-v2-${wakeDate}`, timestampStart: new Date(candidate.start).toISOString(), timestampEnd: new Date(candidate.end).toISOString(),
    dataType: "sleep_inferred", source: "inferred", valueNumeric: Math.round(candidate.supportedMinutes), unit: "minutes",
    // Compatibility score only; never display it as a calibrated probability.
    confidence: moderate ? 0.6 : 0.4, schemaVersion: 1, createdAt: now.toISOString(),
    metadata: {
      inferred_for_date: wakeDate, rest_wake_date: wakeDate, rest_algorithm_version: REST_ALGORITHM_VERSION,
      rest_evidence_quality: moderate ? "moderate" : "limited", rest_coverage: Number(candidate.coverage.toFixed(4)),
      rest_unknown_minutes: Number(candidate.unknownMinutes.toFixed(2)), rest_interruption_minutes: Number(candidate.interruptionMinutes.toFixed(2)),
      rest_intervals: JSON.stringify(candidate.intervals.filter((i) => i.kind === "rest").map((i) => [new Date(i.start).toISOString(), new Date(i.end).toISOString()])),
      rest_evidence: evidence.join("; "), rest_record_ids: JSON.stringify([...new Set(candidate.intervals.flatMap((i) => i.recordIds))]),
      rest_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, rest_timezone_offset: new Date(candidate.end).getTimezoneOffset(),
      heuristic: "closed_motion_and_covered_screen_v2", sleep_estimated: true,
    },
  };
}

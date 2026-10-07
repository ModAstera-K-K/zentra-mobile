import type { ZentraEventRecord } from "@/types/zentra";
import type { RestInterval } from "@/types/rest-inference";
import { REST_MINUTE } from "@/utils/rest-window";

export function restConflictEvidence(events: ZentraEventRecord[]): RestInterval[] {
  return events.flatMap((event): RestInterval[] => {
    const start = Date.parse(event.timestampStart), end = Date.parse(event.timestampEnd);
    const point = event.dataType === "unlock_event"
      || (event.dataType === "steps" && event.source === "sensor" && event.metadata.step_timing_verified === true && Number(event.metadata.step_delta) > 0);
    const timed = (event.dataType === "app_usage" && event.metadata.coverage_window !== true && Number(event.valueNumeric) > 0)
      || event.dataType === "exercise_session"
      || (event.dataType === "motion_context" && ["moderate_movement", "burst_activity"].includes(event.valueText ?? "") && end - start <= REST_MINUTE)
      || (event.dataType === "steps" && event.source !== "sensor" && Number(event.valueNumeric) > 0 && end - start <= REST_MINUTE &&
        (event.metadata.platform_aggregate !== true || event.metadata.timing_verified === true));
    if (point || (timed && end > start)) return [{ start, end: point ? start + REST_MINUTE : end,
      kind: "active", signals: ["Recorded activity"], recordIds: [event.id] }];
    return [];
  });
}

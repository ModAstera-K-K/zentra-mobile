import type { ZentraEventRecord } from "@/types/zentra";
import type { RestInterval } from "@/types/rest-inference";
import { activityStream } from "@/utils/activity-stream";
import { restActivityStart } from "@/utils/rest-boundaries";

function activityKind(event: ZentraEventRecord): RestInterval["kind"] {
  if (Number(event.metadata.confidence ?? event.confidence) < 0.65) return "unknown";
  if (event.valueText === "still") return "rest";
  return ["walking", "running", "on_bicycle", "in_vehicle", "on_foot"].includes(event.valueText ?? "") ? "active" : "unknown";
}

function activitySpan(first: ZentraEventRecord, end: number, lastId?: string): RestInterval {
  return { start: restActivityStart(first), end, kind: activityKind(first),
    signals: [activityKind(first) === "rest" ? "Phone stillness" : "Motion activity"],
    recordIds: lastId ? [first.id, lastId] : [first.id] };
}

/** Only same-stream, real endpoints close a classification. Open starts add no rest. */
export function activityRestEvidence(events: ZentraEventRecord[], through: number): RestInterval[] {
  const opened = new Map<string, ZentraEventRecord>(), result: RestInterval[] = [];
  for (const event of events) {
    if (event.dataType !== "activity" || event.metadata.coverage_window === true) continue;
    const stream = activityStream(event), first = opened.get(stream), time = Date.parse(event.timestampStart);
    if (event.metadata.transition === "enter") {
      if (first && first.valueText === event.valueText && activityKind(first) === activityKind(event)) continue;
      if (first && time > Date.parse(first.timestampStart)) result.push(activitySpan(first, time, event.id));
      opened.set(stream, event);
    } else if (event.metadata.transition === "exit") {
      if (first && first.valueText === event.valueText) {
        if (time > Date.parse(first.timestampStart)) result.push(activitySpan(first, time, event.id));
        opened.delete(stream);
      }
    } else if (Date.parse(event.timestampEnd) > time) {
      result.push(activitySpan(event, Date.parse(event.timestampEnd)));
    }
  }
  for (const first of opened.values()) {
    if (activityKind(first) !== "rest") result.push({ ...activitySpan(first, through), kind: "unknown", signals: ["Unclosed activity"] });
  }
  return result;
}

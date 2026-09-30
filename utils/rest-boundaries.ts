import type { ZentraEventRecord } from "@/types/zentra";
import type { RestInterval } from "@/types/rest-inference";

export function restActivityStart(event: ZentraEventRecord): number {
  const original = event.metadata.boundary_context === true && typeof event.metadata.original_timestamp === "string"
    ? Date.parse(event.metadata.original_timestamp) : NaN;
  return Number.isFinite(original) ? original : Date.parse(event.timestampStart);
}

/** Query/snapshot/calendar bounds are not bedtime or wake observations. */
export function observedRestBoundaries(events: ZentraEventRecord[], conflicts: RestInterval[]): Set<number> {
  const boundaries = new Set(conflicts.flatMap((i) => [i.start, i.end]));
  for (const event of events) {
    if (event.dataType === "screen_state") boundaries.add(Date.parse(event.timestampStart));
    if (event.dataType === "activity") {
      boundaries.add(restActivityStart(event));
      if (event.metadata.boundary_context !== true) boundaries.add(Date.parse(event.timestampEnd));
    }
  }
  return boundaries;
}

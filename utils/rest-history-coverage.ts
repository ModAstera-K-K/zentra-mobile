import type { ActivityHistoryState } from "@/types/activity-history";
import type { RestInterval } from "@/types/rest-inference";

/** In-flight history pages cannot establish continuity across a whole requested day. */
export function pendingRestHistoryGaps(state: ActivityHistoryState | null): RestInterval[] {
  return (state?.windows ?? []).map((window) => ({ start: Date.parse(window.start), end: Date.parse(window.end),
    kind: "unknown", signals: ["Motion history still importing"], recordIds: [] }));
}

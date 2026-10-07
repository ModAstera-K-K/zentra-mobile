import type { ZentraEventRecord } from "@/types/zentra";
import { toISODate } from "@/utils/dates";
import { sleepSummaryEvent } from "@/utils/sleep-summary";

/** One resolved window per wake date for timing charts, including edited windows. */
export function sleepNightSummaries(events: ZentraEventRecord[]): ZentraEventRecord[] {
  const dates = new Set(events.filter((e) => e.dataType === "sleep_inferred" && Number.isFinite(Date.parse(e.timestampEnd)))
    .map((e) => String(e.metadata.rest_wake_date ?? toISODate(new Date(e.timestampEnd)))));
  return [...dates].flatMap((date) => {
    const summary = sleepSummaryEvent(events, date);
    return summary ? [summary] : [];
  });
}

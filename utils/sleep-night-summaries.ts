import type { ZentraEventRecord } from "@/types/zentra";
import { toISODate } from "@/utils/dates";
import { sleepSummaryEvent } from "@/utils/sleep-summary";
import { sleepEventsByWakeDate } from "@/utils/sleep-wake-date";

/** One resolved window per wake date for timing charts, including edited windows. */
export function sleepNightSummaries(events: ZentraEventRecord[]): ZentraEventRecord[] {
  const dates = new Set(events.filter((e) => e.dataType === "sleep_inferred" && Number.isFinite(Date.parse(e.timestampEnd)))
    .map((e) => String(e.metadata.rest_wake_date ?? toISODate(new Date(e.timestampEnd)))));
  // Group the records into nights once; a night resolves the same from its own
  // records as from the whole list, without regrouping the list per date.
  const nights = sleepEventsByWakeDate(events);
  return [...dates].flatMap((date) => {
    const summary = sleepSummaryEvent(nights.get(date) ?? [], date);
    return summary ? [summary] : [];
  });
}

import type { ZentraEventRecord } from "@/types/zentra";
import { compareTimestamps, toISODate } from "@/utils/dates";
import { selectSleepForWakeDate } from "@/utils/sleep-selection";
import { sleepIntervals } from "@/utils/sleep-intervals";

/** Expand only selected supported intervals, and never count overlapping copies twice. */
export function sleepTimelineEvents(events: ZentraEventRecord[]): ZentraEventRecord[] {
  const sleep = events.filter((e) => e.dataType === "sleep_inferred" && Number.isFinite(Date.parse(e.timestampEnd)));
  const dates = new Set(sleep.map((e) => String(e.metadata.rest_wake_date ?? toISODate(new Date(e.timestampEnd)))));
  const result: ZentraEventRecord[] = [];
  for (const date of dates) {
    const intervals = sleepIntervals(selectSleepForWakeDate(sleep, date)).sort((a, b) => compareTimestamps(a.timestampStart, b.timestampStart));
    let through = -Infinity;
    for (const [index, event] of intervals.entries()) {
      const start = Math.max(through, Date.parse(event.timestampStart)), end = Date.parse(event.timestampEnd);
      if (end <= start) continue;
      result.push({ ...event, id: `${event.id}:interval-${index}`, timestampStart: new Date(start).toISOString(),
        valueNumeric: (end - start) / 60_000 });
      through = end;
    }
  }
  return result;
}

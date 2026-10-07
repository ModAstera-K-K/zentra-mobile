import type { ZentraEventRecord } from "@/types/zentra";
import { compareTimestamps, toISODate } from "@/utils/dates";

/**
 * Resolving the nights that touch a local day takes sleep records from the day
 * before it through this many days after: the night that begins that evening
 * ends the next day, and only a record past that shows it did not run on.
 */
export const SLEEP_NIGHT_DAYS_AFTER = 2;

/**
 * Join adjacent stages from one origin into a night and attribute it to the
 * final wake date, for every wake date in `events` at once.
 */
export function sleepEventsByWakeDate(
  events: ZentraEventRecord[],
): Map<string, ZentraEventRecord[]> {
  const origins = new Map<string, ZentraEventRecord[]>();
  const byDate = new Map<string, ZentraEventRecord[]>();
  const select = (date: string, group: ZentraEventRecord[]) => {
    const selected = byDate.get(date);
    if (selected) selected.push(...group);
    else byDate.set(date, [...group]);
  };
  for (const event of events) {
    if (
      event.dataType !== "sleep_inferred" ||
      event.metadata.stale_import === true
    )
      continue;
    if (typeof event.metadata.rest_wake_date === "string") {
      select(event.metadata.rest_wake_date, [event]);
      continue;
    }
    const key = `${event.source}:${event.metadata.health_platform ?? ""}:${event.metadata.source_app ?? ""}`;
    const group = origins.get(key) ?? [];
    group.push(event);
    origins.set(key, group);
  }
  for (const records of origins.values()) {
    records.sort((a, b) =>
      compareTimestamps(a.timestampStart, b.timestampStart),
    );
    let group: ZentraEventRecord[] = [],
      end = 0;
    for (const event of records) {
      if (group.length && Date.parse(event.timestampStart) > end + 90 * 60000) {
        select(toISODate(new Date(end)), group);
        group = [];
      }
      group.push(event);
      end = Math.max(
        group.length === 1 ? 0 : end,
        Date.parse(event.timestampEnd),
      );
    }
    if (group.length) select(toISODate(new Date(end)), group);
  }
  return byDate;
}

/** The night attributed to one wake date; see `sleepEventsByWakeDate`. */
export function sleepEventsForWakeDate(
  events: ZentraEventRecord[],
  date: string,
): ZentraEventRecord[] {
  return sleepEventsByWakeDate(events).get(date) ?? [];
}

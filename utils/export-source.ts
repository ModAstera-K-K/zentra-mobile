import type { ZentraEventRecord } from "@/types/zentra";
import { compareTimestamps, toISODate } from "@/utils/dates";
import {
  getChangedDatesSince,
  getDailyAggregatesForRange,
  getEventsForRange,
  getRepositoryRevision,
} from "@/utils/event-repository";
import type { ExportSource } from "@/utils/export-job";

/** The records stored on this device. */
export const repositoryExportSource: ExportSource = {
  revision: getRepositoryRevision,
  changedDates: getChangedDatesSince,
  readDay: (date, signal) => getEventsForRange(date, date, { signal }),
  aggregates: getDailyAggregatesForRange,
};

/** Records already in memory, which never change: the demo's sample data. */
export function memoryExportSource(events: ZentraEventRecord[]): ExportSource {
  const byDate = new Map<string, ZentraEventRecord[]>();
  for (const event of events) {
    const date = toISODate(new Date(event.timestampStart));
    const day = byDate.get(date);
    if (day) day.push(event);
    else byDate.set(date, [event]);
  }
  for (const day of byDate.values())
    day.sort((left, right) =>
      compareTimestamps(left.timestampStart, right.timestampStart),
    );
  return {
    revision: async () => "0",
    changedDates: async () => [],
    readDay: async (date) => byDate.get(date) ?? [],
    aggregates: async () => [],
  };
}

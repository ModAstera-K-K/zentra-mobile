import type { ZentraEventRecord, EventDataType } from "@/types/zentra";

/**
 * Whether a stored record is one of the user's own. Platform step totals and
 * app-usage coverage rows are bookkeeping the app adds, and stay out of
 * exported records.
 */
export function isExportedRecord(event: ZentraEventRecord): boolean {
  return (
    event.metadata.platform_aggregate !== true &&
    event.metadata.coverage_window !== true
  );
}

export function groupExportEvents(
  events: ZentraEventRecord[],
): Partial<Record<EventDataType, ZentraEventRecord[]>> {
  return events
    .filter(isExportedRecord)
    .reduce<Partial<Record<EventDataType, ZentraEventRecord[]>>>(
      (groups, event) => {
        (groups[event.dataType] ??= []).push(event);
        return groups;
      },
      {},
    );
}

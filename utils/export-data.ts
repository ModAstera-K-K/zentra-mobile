import type { ZentraEventRecord, EventDataType } from "@/types/zentra";
export function groupExportEvents(
  events: ZentraEventRecord[],
): Partial<Record<EventDataType, ZentraEventRecord[]>> {
  return events
    .filter(
      (event) =>
        event.metadata.platform_aggregate !== true &&
        event.metadata.coverage_window !== true,
    )
    .reduce<Partial<Record<EventDataType, ZentraEventRecord[]>>>(
      (groups, event) => {
        (groups[event.dataType] ??= []).push(event);
        return groups;
      },
      {},
    );
}

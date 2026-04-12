import type { ZentraEventRecord } from "@/types/zentra";

export interface ActivityCountSummary {
  count: number;
  label: string;
}

export function formatActivityLabel(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getActivityEvents(
  events: ZentraEventRecord[],
): ZentraEventRecord[] {
  const activityEvents = events.filter(
    (event) => event.dataType === "activity",
  );
  // Fall back to motion_context events when no activity transitions exist
  return activityEvents.length > 0
    ? activityEvents
    : events.filter((event) => event.dataType === "motion_context");
}

export function getLatestActivityEvent(
  events: ZentraEventRecord[],
): ZentraEventRecord | null {
  const latest = getActivityEvents(events)
    .slice()
    .sort((left, right) =>
      right.timestampStart.localeCompare(left.timestampStart),
    )[0];

  return latest ?? null;
}

export function getCurrentActivityLabel(
  events: ZentraEventRecord[],
): string | null {
  const latest = getLatestActivityEvent(events);
  return latest?.valueText ? formatActivityLabel(latest.valueText) : null;
}

export function countActivityTypes(
  events: ZentraEventRecord[],
): ActivityCountSummary[] {
  const counts = getActivityEvents(events).reduce<Map<string, number>>(
    (result, event) => {
      const label = formatActivityLabel(event.valueText);
      result.set(label, (result.get(label) ?? 0) + 1);
      return result;
    },
    new Map<string, number>(),
  );

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([label, count]) => ({ label, count }));
}

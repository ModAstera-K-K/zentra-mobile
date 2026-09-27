import { sleepEventsForWakeDate } from "@/utils/sleep-wake-date";
import { sleepIntervals } from "@/utils/sleep-intervals";
import type { ZentraEventRecord } from "@/types/zentra";
import { toISODate } from "@/utils/dates";

export function sourceIdentity(event: ZentraEventRecord): string {
  return `${event.source}:${event.metadata.health_platform ?? ""}:${event.metadata.source_app ?? "unknown"}`;
}

/** Statistics already reconcile overlapping providers. Never add phone counters to them. */
export function selectResolvedStepEvents(
  events: ZentraEventRecord[],
): ZentraEventRecord[] {
  const days = new Map<string, ZentraEventRecord[]>();
  for (const event of events) {
    if (event.dataType !== "steps" || event.metadata.stale_import === true)
      continue;
    const day = toISODate(new Date(event.timestampStart));
    const group = days.get(day) ?? [];
    group.push(event);
    days.set(day, group);
  }
  return [...days.values()].flatMap((group) => {
    const statistics = group.filter(
      (event) => event.metadata.platform_aggregate === true,
    );
    if (statistics.length) return statistics;
    const sensor = group.filter((event) => event.source === "sensor");
    if (sensor.length) return sensor;
    // Legacy imports have no platform statistics. Keep one origin, never sum providers.
    const firstSource = [...new Set(group.map(sourceIdentity))].sort()[0];
    return group.filter((event) => sourceIdentity(event) === firstSource);
  });
}

export function resolveStepTotal(events: ZentraEventRecord[]): number | null {
  const selected = selectResolvedStepEvents(events).sort((a, b) =>
    a.timestampStart.localeCompare(b.timestampStart),
  );
  if (!selected.length) return null;
  let total = 0;
  let previous: number | null = null;
  for (const event of selected) {
    const count = Math.max(0, event.valueNumeric ?? 0);
    total +=
      typeof event.metadata.step_delta === "number"
        ? event.metadata.step_delta
        : event.source === "sensor"
          ? previous === null || count < previous
            ? count
            : count - previous
          : count;
    if (event.source === "sensor") previous = count;
  }
  return Math.round(total);
}

export function resolvedTimelineEvents(
  events: ZentraEventRecord[],
): ZentraEventRecord[] {
  const selected = new Set(
    selectResolvedStepEvents(events).map((event) => event.id),
  );
  return events.filter(
    (event) =>
      event.metadata.stale_import !== true &&
      (event.dataType !== "steps" || selected.has(event.id)),
  );
}

export function mergedDurationMinutes(events: ZentraEventRecord[]): number {
  const intervals = events
    .map((event) => [
      Date.parse(event.timestampStart),
      Date.parse(event.timestampEnd),
    ])
    .filter(([start, end]) => Number.isFinite(start) && end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0,
    end = -Infinity;
  for (const [start, nextEnd] of intervals) {
    total += Math.max(0, nextEnd - Math.max(start, end));
    end = Math.max(end, nextEnd);
  }
  return total / 60000;
}

export function resolvedSleepMinutes(
  events: ZentraEventRecord[],
  wakeDate: string,
): number | null {
  const sleep = sleepEventsForWakeDate(events, wakeDate);
  const imported = sleep.filter((event) => event.source === "health_connect");
  const source = [...new Set(imported.map(sourceIdentity))].sort()[0];
  const chosen = imported.length
    ? imported.filter((event) => sourceIdentity(event) === source)
    : sleep.filter((event) => event.source === "inferred");
  return chosen.length
    ? Math.round(mergedDurationMinutes(sleepIntervals(chosen)))
    : null;
}

/** Preserve recorded workout duration (including pauses), without summing overlapping copies. */
export function recordedDurationMinutes(events: ZentraEventRecord[]): number {
  const sorted = [...events].sort(
    (a, b) =>
      a.timestampStart.localeCompare(b.timestampStart) ||
      b.timestampEnd.localeCompare(a.timestampEnd),
  );
  let previousEnd = -Infinity,
    total = 0;
  for (const event of sorted) {
    const start = Date.parse(event.timestampStart),
      end = Date.parse(event.timestampEnd);
    if (end <= start) continue;
    const duration =
      event.unit === "seconds"
        ? (event.valueNumeric ?? 0) / 60
        : (event.valueNumeric ?? 0);
    const fraction =
      Math.max(0, end - Math.max(start, previousEnd)) / (end - start);
    total += Math.min(duration, (end - start) / 60000) * fraction;
    previousEnd = Math.max(previousEnd, end);
  }
  return total;
}

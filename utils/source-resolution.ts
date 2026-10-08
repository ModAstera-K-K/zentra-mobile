import { sleepTimelineEvents } from "@/utils/sleep-timeline";
import { sleepIntervals } from "@/utils/sleep-intervals";
import type { ZentraEventRecord } from "@/types/zentra";
import { compareTimestamps, toISODate } from "@/utils/dates";
import { selectSleepForWakeDate } from "@/utils/sleep-selection";

export function sourceIdentity(event: ZentraEventRecord): string {
  return `${event.source}:${event.metadata.health_platform ?? ""}:${event.metadata.source_app ?? "unknown"}`;
}

/** Statistics already reconcile overlapping providers. Never add phone counters to them. */
function selectStepGroup(group: ZentraEventRecord[]): ZentraEventRecord[] {
  const statistics = group.filter(
    (event) => event.metadata.platform_aggregate === true,
  );
  if (statistics.length) return statistics;
  const sensor = group.filter((event) => event.source === "sensor");
  if (sensor.length) return sensor;
  // Legacy imports have no platform statistics. Keep one origin, never sum providers.
  const firstSource = [...new Set(group.map(sourceIdentity))].sort()[0];
  return group.filter((event) => sourceIdentity(event) === firstSource);
}

function addStepEventToDay(
  days: Map<string, ZentraEventRecord[]>,
  event: ZentraEventRecord,
): void {
  if (event.dataType !== "steps" || event.metadata.stale_import === true)
    return;
  const day = toISODate(new Date(event.timestampStart));
  const group = days.get(day) ?? [];
  group.push(event);
  days.set(day, group);
}

export function selectResolvedStepEvents(
  events: ZentraEventRecord[],
): ZentraEventRecord[] {
  const days = new Map<string, ZentraEventRecord[]>();
  for (const event of events) addStepEventToDay(days, event);
  return [...days.values()].flatMap(selectStepGroup);
}

export function resolveStepTotal(events: ZentraEventRecord[]): number | null {
  const selected = selectResolvedStepEvents(events).sort((a, b) =>
    compareTimestamps(a.timestampStart, b.timestampStart),
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
  const work = resolvedTimelineEventsWork(events);
  let next = work.next();
  while (!next.done) next = work.next();
  return next.value;
}

/** Resumable form of `resolvedTimelineEvents` for runCooperatively callers. */
export function* resolvedTimelineEventsWork(
  events: ZentraEventRecord[],
): Generator<void, ZentraEventRecord[]> {
  const days = new Map<string, ZentraEventRecord[]>();
  const sleep: ZentraEventRecord[] = [];
  for (let i = 0; i < events.length; i++) {
    if (i && i % 200 === 0) yield;
    addStepEventToDay(days, events[i]);
    if (events[i].dataType === "sleep_inferred") sleep.push(events[i]);
  }

  const selected = new Set<string>();
  for (const group of days.values()) {
    yield;
    for (const event of selectStepGroup(group)) selected.add(event.id);
  }

  const kept: ZentraEventRecord[] = [];
  for (let i = 0; i < events.length; i++) {
    if (i && i % 500 === 0) yield;
    const event = events[i];
    if (
      event.metadata.stale_import !== true &&
      event.dataType !== "sleep_inferred" &&
      (event.dataType !== "steps" || selected.has(event.id))
    )
      kept.push(event);
  }
  yield;
  // sleepTimelineEvents only reads sleep records, so the subset is equivalent.
  return [...kept, ...sleepTimelineEvents(sleep)];
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
  const chosen = selectSleepForWakeDate(events, wakeDate);
  return chosen.length
    ? Math.round(mergedDurationMinutes(sleepIntervals(chosen)))
    : null;
}

/** Preserve recorded workout duration (including pauses), without summing overlapping copies. */
export function recordedDurationMinutes(events: ZentraEventRecord[]): number {
  const sorted = [...events].sort(
    (a, b) =>
      compareTimestamps(a.timestampStart, b.timestampStart) ||
      compareTimestamps(b.timestampEnd, a.timestampEnd),
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

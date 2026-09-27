import type { ActiveInterval, ActiveKind } from "@/types/active-minutes";
import type { ZentraEventRecord } from "@/types/zentra";
import { sourceIdentity } from "@/utils/source-resolution";

export const MINUTE_MS = 60_000;
export function physicalKind(label?: string): ActiveKind | null {
  if (["walking", "on_foot", "hiking"].includes(label ?? "")) return "walking";
  if (label === "running") return "running";
  if (
    ["bike", "biking", "cycling", "on_bicycle", "stationary_biking"].includes(
      label ?? "",
    )
  )
    return "cycling";
  return null;
}
export function isPhysicalWorkout(event: ZentraEventRecord): boolean {
  return (
    event.dataType === "exercise_session" &&
    !!event.valueText &&
    ![
      "unknown",
      "other",
      "meditation",
      "guided_breathing",
      "breathing",
      "vehicle",
      "in_vehicle",
      "still",
    ].includes(event.valueText)
  );
}
export function activityInterval(
  event: ZentraEventRecord,
  start: number,
  end: number,
  kind: ActiveKind,
  priority: number,
  weight = 1,
  estimated = false,
): ActiveInterval {
  return {
    start,
    end,
    kind,
    priority,
    weight,
    estimated,
    recordIds: [event.id],
    source: sourceIdentity(event),
  };
}
export function workoutIntervals(event: ZentraEventRecord): ActiveInterval[] {
  if (!isPhysicalWorkout(event)) return [];
  const start = Date.parse(event.timestampStart),
    end = Date.parse(event.timestampEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return [];
  const kind = physicalKind(event.valueText) ?? "workout";
  if (typeof event.metadata.active_intervals === "string") {
    try {
      const intervals: unknown = JSON.parse(event.metadata.active_intervals);
      if (Array.isArray(intervals))
        return intervals.flatMap((pair) => {
          if (!Array.isArray(pair)) return [];
          const a = Math.max(start, Date.parse(pair[0])),
            b = Math.min(end, Date.parse(pair[1]));
          return b > a ? [activityInterval(event, a, b, kind, 0)] : [];
        });
    } catch {
      /* Legacy records fall back to recorded duration below. */
    }
  }
  const minutes =
    event.unit === "seconds"
      ? (event.valueNumeric ?? 0) / 60
      : (event.valueNumeric ?? 0);
  const weight = Math.max(
    0,
    Math.min(1, (minutes * MINUTE_MS) / (end - start)),
  );
  return weight > 0
    ? [activityInterval(event, start, end, kind, 0, weight, weight < 1)]
    : [];
}

/** Attribution uses remaining capacity, never adds two sources for the same elapsed time. */
export function* attributeIntervals(
  intervals: ActiveInterval[],
  start: number,
  end: number,
): Generator<void, Map<ActiveKind, number>> {
  const boundaries = new Map<
    number,
    { add: ActiveInterval[]; remove: ActiveInterval[] }
  >();
  for (const interval of intervals) {
    const a = Math.max(start, interval.start),
      b = Math.min(end, interval.end);
    if (b > a && interval.weight > 0) {
      if (!boundaries.has(a)) boundaries.set(a, { add: [], remove: [] });
      if (!boundaries.has(b)) boundaries.set(b, { add: [], remove: [] });
      boundaries.get(a)!.add.push(interval);
      boundaries.get(b)!.remove.push(interval);
    }
    yield;
  }
  const active = new Set<ActiveInterval>();
  const totals = new Map<ActiveKind, number>();
  let previous = start;
  for (const time of [...boundaries.keys()].sort((a, b) => a - b)) {
    let capacity = 1;
    // Prefer the longest record when duplicate workouts have identical priority.
    const ranked = [...active].sort(
      (a, b) =>
        a.priority - b.priority ||
        b.weight - a.weight ||
        a.source.localeCompare(b.source) ||
        a.recordIds[0].localeCompare(b.recordIds[0]),
    );
    const priorities = new Set<number>();
    for (const interval of ranked) {
      if (priorities.has(interval.priority)) continue;
      priorities.add(interval.priority);
      const share = Math.max(0, interval.weight - (1 - capacity));
      totals.set(
        interval.kind,
        (totals.get(interval.kind) ?? 0) +
          ((time - previous) / MINUTE_MS) * share,
      );
      // Same-priority duplicates describe the same capacity, not extra activity.
      capacity = Math.max(0, capacity - share);
      if (capacity === 0) break;
    }
    const changes = boundaries.get(time)!;
    changes.remove.forEach((interval) => active.delete(interval));
    changes.add.forEach((interval) => active.add(interval));
    previous = time;
    yield;
  }
  return totals;
}
export function roundedContributions(totals: Map<ActiveKind, number>) {
  const parts = [...totals].map(([activity, value]) => ({
    activity,
    value,
    minutes: Math.floor(value),
  }));
  let remaining =
    Math.round(parts.reduce((n, p) => n + p.value, 0)) -
    parts.reduce((n, p) => n + p.minutes, 0);
  for (const part of [...parts].sort(
    (a, b) => b.value - b.minutes - (a.value - a.minutes),
  )) {
    if (remaining-- > 0) part.minutes++;
  }
  return parts
    .filter((p) => p.minutes > 0)
    .map(({ activity, minutes }) => ({ activity, minutes }));
}

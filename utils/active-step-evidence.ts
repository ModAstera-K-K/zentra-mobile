import type { ActiveInterval, WalkingBout } from "@/types/active-minutes";
import type { ZentraEventRecord } from "@/types/zentra";
import { activityInterval, MINUTE_MS } from "@/utils/active-intervals";
import { sourceIdentity } from "@/utils/source-resolution";

export interface TimedSteps {
  start: number;
  end: number;
  count: number;
  source: string;
  id: string;
  authoritative?: boolean;
}
export function* collectTimedSteps(
  events: ZentraEventRecord[],
  reasons: Set<string>,
): Generator<void, { intervals: ActiveInterval[]; samples: TimedSteps[] }> {
  const intervals: ActiveInterval[] = [],
    samples: TimedSteps[] = [];
  let previous: { count: number; time: number } | null = null;
  for (const event of events) {
    if (event.dataType !== "steps") continue;
    const start = Date.parse(event.timestampStart),
      end = Date.parse(event.timestampEnd);
    const value = Math.max(0, event.valueNumeric ?? 0);
    let count = value;
    let fine = end > start && end - start <= MINUTE_MS;
    if (event.source === "sensor") {
      count =
        typeof event.metadata.step_delta === "number"
          ? Math.max(0, event.metadata.step_delta)
          : previous && value >= previous.count
            ? value - previous.count
            : value;
      fine =
        typeof event.metadata.step_delta === "number"
          ? event.metadata.step_timing_verified === true ||
            (event.metadata.step_timing_verified === undefined &&
              !!previous &&
              start - previous.time <= MINUTE_MS &&
              start >= previous.time)
          : !!previous &&
            start - previous.time <= MINUTE_MS &&
            start >= previous.time;
      previous = { count: value, time: start };
    } else if (event.metadata.platform_aggregate === true) {
      fine = fine && event.metadata.timing_verified === true;
    }
    if (count > 0 && fine && Number.isFinite(start)) {
      const binStart = Math.floor(start / MINUTE_MS) * MINUTE_MS;
      const interval = activityInterval(
        event,
        binStart,
        end > start
          ? Math.ceil(end / MINUTE_MS) * MINUTE_MS
          : binStart + MINUTE_MS,
        "steps",
        2,
        1,
        true,
      );
      if (typeof event.metadata.supporting_record_ids === "string") {
        try {
          const ids: unknown = JSON.parse(event.metadata.supporting_record_ids);
          if (Array.isArray(ids))
            interval.recordIds.push(
              ...ids.filter((id): id is string => typeof id === "string"),
            );
        } catch {
          /* Retain the timing record identifier for older cached profiles. */
        }
      }
      intervals.push(interval);
      samples.push({
        start: fine && end > start ? start : binStart,
        end: fine && end > start ? end : binStart + MINUTE_MS,
        count,
        source: sourceIdentity(event),
        id: event.id,
        authoritative: event.metadata.platform_aggregate === true,
      });
    } else if (count > 0)
      reasons.add("Some steps lack reliable minute-level timing.");
    yield;
  }
  const authoritativeBins = new Set(
    samples
      .filter((s) => s.authoritative)
      .map((s) => Math.floor(s.start / MINUTE_MS)),
  );
  return {
    intervals,
    samples: samples.filter(
      (s) =>
        s.authoritative ||
        !authoritativeBins.has(Math.floor(s.start / MINUTE_MS)),
    ),
  };
}
export function* qualifyingWalkingBouts(
  date: string,
  intervals: ActiveInterval[],
  samples: TimedSteps[],
): Generator<void, WalkingBout[]> {
  const bouts: WalkingBout[] = [];
  for (const interval of intervals) {
    if (
      interval.kind !== "walking" ||
      interval.estimated ||
      interval.weight !== 1 ||
      interval.end - interval.start < 5 * MINUTE_MS
    )
      continue;
    if (bouts.some((b) => b.start < interval.end && b.end > interval.start))
      continue;
    const matching = samples.filter(
      (s) => s.start >= interval.start && s.end <= interval.end,
    );
    const sources = new Set(matching.map((s) => s.source));
    if (sources.size !== 1) continue;
    let coveredEnd = interval.start,
      steps = 0;
    const seen = new Set<string>();
    let valid = matching.length > 0;
    for (const sample of matching.sort((a, b) => a.start - b.start)) {
      if (seen.has(sample.id)) continue;
      seen.add(sample.id);
      if (
        sample.start > coveredEnd ||
        (sample.start < coveredEnd && coveredEnd > interval.start)
      ) {
        valid = false;
        break;
      }
      coveredEnd = Math.max(coveredEnd, sample.end);
      steps += sample.count;
      yield;
    }
    if (valid && coveredEnd >= interval.end && steps > 0)
      bouts.push({
        date,
        start: interval.start,
        end: interval.end,
        steps,
        minutes: (interval.end - interval.start) / MINUTE_MS,
        source: matching[0].source,
      });
    yield;
  }
  return bouts;
}

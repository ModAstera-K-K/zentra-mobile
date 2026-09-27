import { sleepEventsForWakeDate } from "@/utils/sleep-wake-date";
import { sleepIntervals } from "@/utils/sleep-intervals";
import type { MetricObservation, InsightMetric } from "@/types/insights";
import type { HealthSyncState } from "@/types/health-sync";
import type { ZentraEventRecord } from "@/types/zentra";
import {
  mergedDurationMinutes,
  recordedDurationMinutes,
  resolveStepTotal,
  sourceIdentity,
} from "@/utils/source-resolution";
import { parseISODate, shiftISODate, toISODate } from "@/utils/dates";

export const METRIC_LABELS: Record<InsightMetric, string> = {
  steps: "Steps",
  sleep: "Sleep duration",
  exercise: "Workout duration",
  usage: "App usage",
};
export const INSIGHT_METRICS: InsightMetric[] = [
  "steps",
  "sleep",
  "exercise",
  "usage",
];

export function buildMetricObservation(
  metric: InsightMetric,
  date: string,
  events: ZentraEventRecord[],
  states: HealthSyncState[],
): MetricObservation {
  const type = {
    steps: "steps",
    sleep: "sleep_inferred",
    exercise: "exercise_session",
    usage: "app_usage",
  }[metric];
  const records =
    metric === "sleep"
      ? sleepEventsForWakeDate(events, date)
      : events.filter(
          (e) =>
            e.metadata.stale_import !== true &&
            e.dataType === type &&
            (metric === "usage"
              ? e.timestampStart <
                  parseISODate(shiftISODate(date, 1)).toISOString() &&
                e.timestampEnd > parseISODate(date).toISOString()
              : toISODate(new Date(e.timestampStart)) === date),
        );
  const start = parseISODate(date).toISOString(),
    end = parseISODate(shiftISODate(date, 1)).toISOString();
  const state = states.find(
    (s) => s.record_type === (metric === "sleep" ? "sleep" : type),
  );
  const readComplete =
    state?.status === "ready" &&
    !!state.start_at &&
    !!state.end_at &&
    state.start_at <= start &&
    state.end_at >= end;
  let selected = records;
  if (metric === "steps")
    selected = records.filter((e) => e.metadata.platform_aggregate === true);
  else if (metric !== "usage") {
    selected = records.filter((e) => e.source === "health_connect");
    const origin = [...new Set(selected.map(sourceIdentity))].sort()[0];
    selected = selected.filter((e) => sourceIdentity(e) === origin);
  }
  const captureWindows =
    metric === "usage"
      ? events
          .filter(
            (e) =>
              e.dataType === "app_usage" &&
              e.metadata.coverage_window === true &&
              e.timestampStart < end &&
              e.timestampEnd > start,
          )
          .map((e) => ({
            ...e,
            timestampStart: e.timestampStart < start ? start : e.timestampStart,
            timestampEnd: e.timestampEnd > end ? end : e.timestampEnd,
          }))
      : [];
  const usageComplete =
    mergedDurationMinutes(captureWindows) >=
    (Date.parse(end) - Date.parse(start)) / 60000 - 1;
  if (metric === "usage")
    selected = records.filter((e) => e.metadata.coverage_window !== true);
  const value = !selected.length
    ? null
    : metric === "steps"
      ? resolveStepTotal(selected)
      : metric === "usage"
        ? selected.reduce(
            (n, e) =>
              n +
              Math.max(
                0,
                Math.min(Date.parse(e.timestampEnd), Date.parse(end)) -
                  Math.max(Date.parse(e.timestampStart), Date.parse(start)),
              ) /
                60000,
            0,
          )
        : metric === "exercise"
          ? recordedDurationMinutes(selected)
          : mergedDurationMinutes(sleepIntervals(selected));
  // A successful query is import coverage, never proof of continuous wearing/capture.
  const eligible =
    metric === "usage" ? usageComplete : readComplete && selected.length > 0;
  return {
    date,
    revision: "unversioned",
    metric,
    value: value === null && metric === "usage" && usageComplete ? 0 : value,
    unit: metric === "steps" ? "steps" : "min",
    quality:
      metric === "sleep" &&
      selected.some((event) => event.metadata.sleep_estimated === true)
        ? "estimated"
        : eligible
          ? "measured"
          : value === null
            ? "missing"
            : "partial",
    provenance:
      metric === "usage"
        ? "usage_stats"
        : selected[0]
          ? sourceIdentity(selected[0])
          : "",
    coverage:
      metric === "usage"
        ? usageComplete
          ? "Recorded query covers this day"
          : "Partial usage history"
        : readComplete
          ? "Available records imported; capture may be incomplete"
          : "Import incomplete",
    updatedAt: state?.updated_at ?? selected.at(-1)?.createdAt ?? null,
    recordIds: selected.map((e) => e.id),
  };
}

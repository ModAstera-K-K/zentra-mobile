import type {
  MetricObservation,
  PersonalInsight,
  InsightMetric,
} from "@/types/insights";
import { METRIC_LABELS, INSIGHT_METRICS } from "@/utils/metric-observations";
import { shiftISODate } from "@/utils/dates";

export function compareMetric(
  metric: InsightMetric,
  observations: MetricObservation[],
  anchor: string,
): PersonalInsight {
  const currentStart = shiftISODate(anchor, -7),
    currentEnd = shiftISODate(anchor, -1);
  const previousStart = shiftISODate(anchor, -14),
    previousEnd = shiftISODate(anchor, -8);
  const byDate = new Map(
    observations.filter((o) => o.metric === metric).map((o) => [o.date, o]),
  );
  const pairs: { current: MetricObservation; previous: MetricObservation }[] =
    [];
  for (let offset = 7; offset >= 1; offset--) {
    const current = byDate.get(shiftISODate(anchor, -offset));
    const previous = byDate.get(shiftISODate(anchor, -offset - 7));
    if (
      current?.quality === "measured" &&
      previous?.quality === "measured" &&
      current.value !== null &&
      previous.value !== null &&
      current.provenance &&
      current.provenance === previous.provenance
    )
      pairs.push({ current, previous });
  }
  const sameSource = new Set(pairs.map((p) => p.current.provenance)).size === 1;
  const eligible = pairs.length >= 5 && sameSource;
  const currentMean = eligible
    ? pairs.reduce((n, p) => n + p.current.value!, 0) / pairs.length
    : null;
  const previousMean = eligible
    ? pairs.reduce((n, p) => n + p.previous.value!, 0) / pairs.length
    : null;
  const change =
    currentMean !== null && previousMean !== null
      ? currentMean - previousMean
      : null;
  return {
    metric,
    label: METRIC_LABELS[metric],
    eligible,
    pairs: pairs.length,
    currentMean,
    previousMean,
    absoluteChange: change,
    percentChange:
      change !== null && previousMean !== null && previousMean !== 0
        ? (change / previousMean) * 100
        : null,
    unit: metric === "steps" ? "steps" : "min",
    provenance: sameSource ? (pairs[0]?.current.provenance ?? "") : "",
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    calculationVersion: 1,
    observations: observations.filter((o) => o.metric === metric),
    contributors: eligible
      ? pairs
          .map((p) => ({
            date: p.current.date,
            previousDate: p.previous.date,
            change: p.current.value! - p.previous.value!,
          }))
          .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
          .slice(0, 2)
      : [],
  };
}
export function buildPersonalInsights(
  observations: MetricObservation[],
  anchor: string,
): PersonalInsight[] {
  return INSIGHT_METRICS.map((metric) =>
    compareMetric(metric, observations, anchor),
  );
}

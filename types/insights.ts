export type InsightMetric = "steps" | "sleep" | "exercise" | "usage";
export interface MetricObservation {
  date: string;
  revision: string;
  metric: InsightMetric;
  value: number | null;
  unit: string;
  quality: "measured" | "partial" | "missing" | "estimated" | "unavailable";
  provenance: string;
  coverage: string;
  updatedAt: string | null;
  /** Up to 50 of the records behind the value; `recordCount` is all of them. */
  recordIds: string[];
  recordCount?: number;
}
export interface PersonalInsight {
  metric: InsightMetric;
  label: string;
  eligible: boolean;
  pairs: number;
  currentMean: number | null;
  previousMean: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  unit: string;
  provenance: string;
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
  calculationVersion: 1;
  observations: MetricObservation[];
  contributors: { date: string; previousDate: string; change: number }[];
}

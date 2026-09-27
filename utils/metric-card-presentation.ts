import type { AppPalette } from "@/constants/theme";
import type { DashboardMetric, MetricTone } from "@/types/zentra";

export function metricToneColor(tone: MetricTone, palette: AppPalette): string {
  if (tone === "physical") return palette.signalPhysical;
  if (tone === "human") return palette.signalHuman;
  if (tone === "cool") return palette.signalCool;
  return palette.primary;
}

/** Split display units only. Do not infer a value or observation from availability. */
export function metricReadout(metric: Pick<DashboardMetric, "key" | "value" | "available">) {
  const { value, key } = metric;
  const unitMatch = value.match(/^([\d,.]+)\s*(km\/h|km|bpm|lux|%|min|sessions?|m)$/);
  if (unitMatch) {
    const unit = unitMatch[2] === "m" && ["screenTime", "activeMinutes"].includes(key) ? "min" : unitMatch[2];
    return { value: unitMatch[1].trim(), unit };
  }
  const numericUnits: Record<string, string> = {
    steps: "steps",
    unlockCount: "unlocks",
    activeMinutes: "min",
  };
  const unit = /^[\d,.]+$/.test(value) ? numericUnits[key] ?? "" : "";
  return { value, unit };
}

export function metricQuality(metric: DashboardMetric): string | null {
  if (!metric.available) return null;
  if (metric.key === "activeMinutes" && metric.value.endsWith(" min")) return "Partial";
  if (["mobilityRadius", "avgSpeed", "elevationGain"].includes(metric.key)) return "Estimated";
  return null;
}

export function metricColumnCount(width: number, fontScale: number): 1 | 2 {
  return width < 360 || fontScale >= 1.5 ? 1 : 2;
}

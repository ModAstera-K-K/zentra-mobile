import type { PersonalInsight } from "@/types/insights";
import type { TodayDetailPayload } from "@/utils/today-visualization";
export function insightSummary(insight: PersonalInsight): string {
  if (!insight.eligible)
    return "Not enough comparable days. At least five matching weekday pairs from the same source are needed.";
  const delta = Math.round(insight.absoluteChange!);
  if (delta === 0)
    return `${insight.label} was unchanged on average across comparable days.`;
  const percent =
    insight.percentChange === null
      ? ""
      : ` (${Math.abs(Math.round(insight.percentChange))}%)`;
  return `${insight.label} averaged ${Math.abs(delta)} ${insight.unit}${percent} ${delta < 0 ? "lower" : delta > 0 ? "higher" : "different"} per day than the preceding week.`;
}
export function insightDetail(insight: PersonalInsight): TodayDetailPayload {
  return {
    key: `insight-${insight.metric}`,
    eyebrow: "What changed",
    title: insight.label,
    value: `${Math.round(insight.currentMean ?? 0)} ${insight.unit}`,
    meta: "Daily average across comparable days",
    tone: "physical",
    summary: insightSummary(insight),
    visual: {
      type: "distribution",
      annotation: "Averages for matching weekdays",
      bars: [
        {
          label: "Previous week",
          value: insight.previousMean ?? 0,
          valueLabel: `${Math.round(insight.previousMean ?? 0)} ${insight.unit}`,
        },
        {
          label: "Latest week",
          value: insight.currentMean ?? 0,
          valueLabel: `${Math.round(insight.currentMean ?? 0)} ${insight.unit}`,
        },
      ],
    },
    facts: [
      {
        label: "Comparison",
        value: `${insight.currentStart}–${insight.currentEnd} versus ${insight.previousStart}–${insight.previousEnd}`,
      },
      {
        label: "Coverage",
        value: `${insight.pairs}/7 matched pairs; available records only`,
      },
      { label: "Source", value: insight.provenance },
      {
        label: "Contributing days",
        value: insight.contributors
          .map(
            (c) =>
              `${c.date}: ${c.change >= 0 ? "+" : ""}${Math.round(c.change)} ${insight.unit}`,
          )
          .join("; "),
      },
    ],
    rows: insight.observations
      .filter((o) => o.value !== null)
      .map((o) => ({
        label: o.date,
        value: `${Math.round(o.value!)} ${o.unit}. ${o.quality}. ${o.coverage}. Updated ${o.updatedAt ?? "unknown"}. Records: ${o.recordIds.slice(0, 3).join(", ")}${o.recordIds.length > 3 ? ` (+${o.recordIds.length - 3} more)` : ""}`,
      })),
  };
}

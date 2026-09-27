import type { ActiveMinutesSummary } from "@/types/active-minutes";
import type { ZentraEventRecord } from "@/types/zentra";
import type { TodayDetailPayload } from "@/utils/today-visualization";
import { RELEASE_FLAGS } from "@/constants/release-flags";

export function activeMinutesValue(summary?: ActiveMinutesSummary): string {
  return summary?.supportedMinutes != null
    ? `${summary.supportedMinutes} min`
    : "Unavailable";
}
export function activeMinutesDetail(
  summary: ActiveMinutesSummary | undefined,
  events: ZentraEventRecord[],
  steps: number,
): TodayDetailPayload {
  const estimate = RELEASE_FLAGS.walkingEquivalent
    ? summary?.walkingEquivalent
    : null;
  const records = new Set(summary?.recordIds ?? []);
  return {
    key: "activeMinutes",
    eyebrow: "Today detail",
    title: "Active Minutes",
    value: `${activeMinutesValue(summary)}${summary?.supportedMinutes != null ? " · Partial" : ""}`,
    tone: "physical",
    meta: "Supported by timed records · Estimated activity",
    summary:
      "This is not your complete day. Overlapping evidence counts once. Step-minute occupancy is not continuous walking duration.",
    visual: summary?.contributions.length
      ? {
          type: "distribution",
          annotation:
            "Minutes by activity; contributions add up to the supported total.",
          bars: summary.contributions.map((p) => ({
            label: p.activity,
            value: p.minutes,
            valueLabel: `${p.minutes} min`,
          })),
        }
      : null,
    facts: [
      {
        label: "Coverage",
        value:
          summary?.coverageReasons.join(" ") ??
          "No timed activity records available.",
      },
      { label: "Steps", value: steps.toLocaleString() },
      {
        label: "Sources",
        value: summary?.sources.join(", ") || "No supported sources",
      },
      {
        label: "Last updated",
        value: summary?.updatedAt
          ? new Date(summary.updatedAt).toLocaleString()
          : "No timed records",
      },
      ...(RELEASE_FLAGS.walkingEquivalent
        ? [
            {
              label: "Walking-equivalent estimate",
              value: estimate
                ? `${estimate.lowerMinutes}–${estimate.upperMinutes} min`
                : "Not enough personal timing history",
            },
            {
              label: "Estimate meaning",
              value:
                "Time to walk the recorded steps at your observed walking pace. This may overlap supported minutes; never add the two.",
            },
          ]
        : []),
    ],
    rows: events
      .filter((e) => records.has(e.id))
      .slice(0, 50)
      .map((e) => ({
        label: `${e.valueText ?? e.dataType} · ${e.id}`,
        value: `${e.timestampStart} – ${e.timestampEnd} · ${e.source}`,
      })),
  };
}

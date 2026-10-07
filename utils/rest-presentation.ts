import type { SleepEstimate, ZentraEventRecord } from "@/types/zentra";
import { RELEASE_FLAGS } from "@/constants/release-flags";

export function restPresentation(event: ZentraEventRecord): Partial<SleepEstimate> {
  if (event.source !== "inferred") return {};
  const adjusted = event.metadata.rest_user_adjusted === true;
  const quality = event.metadata.rest_evidence_quality === "moderate" ? "Moderate evidence" : "Limited evidence";
  const coverage = typeof event.metadata.rest_coverage === "number" ? `${Math.round(event.metadata.rest_coverage * 100)}% signal coverage` : "Coverage unavailable";
  const details = typeof event.metadata.rest_evidence === "string" ? event.metadata.rest_evidence : "Available phone signals";
  return {
    isAdjusted: adjusted, startTimestamp: event.timestampStart, endTimestamp: event.timestampEnd,
    wakeDate: typeof event.metadata.rest_wake_date === "string" ? event.metadata.rest_wake_date : undefined,
    canAdjust: RELEASE_FLAGS.restInference && event.metadata.rest_algorithm_version === 2,
    sourceLabel: adjusted ? "User-reported rest" : "Local inference",
    qualityLabel: adjusted ? "Your adjustment · user-reported duration" : `${quality} · ${coverage}`,
    detail: adjusted ? "You adjusted this rest window. It is user-reported, not measured sleep."
      : `${details}. Sleep itself was not measured.`,
    coverageDetail: adjusted ? undefined : `${Math.round(Number(event.metadata.rest_interruption_minutes ?? 0))} min activity · ${Math.round(Number(event.metadata.rest_unknown_minutes ?? 0))} min unknown within the window`,
  };
}

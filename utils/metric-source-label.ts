import type { ZentraEventRecord } from "@/types/zentra";
import { selectResolvedStepEvents } from "@/utils/source-resolution";

export function stepSourceLabel(events: ZentraEventRecord[]): string {
  const resolved = selectResolvedStepEvents(events);
  const platform = resolved.some(
    (event) => event.metadata.platform_aggregate === true,
  );
  const phone = resolved.some((event) => event.source === "sensor");
  if (platform && phone) return "Platform totals; phone fallback on other days";
  if (platform) return "Platform-resolved health totals";
  if (phone) return "Phone sensor fallback";
  return resolved.length
    ? "Single-source health records; unresolved estimate"
    : "No step observations";
}

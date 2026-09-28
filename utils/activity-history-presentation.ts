import type { ActivityHistoryState } from "@/types/activity-history";

export function activityHistoryDescription(
  state: ActivityHistoryState | null,
  enabled: boolean,
): string {
  if (!enabled) return "Core Motion history is paused.";
  if (!state)
    return "Core Motion history has not been read yet. Up to 7 days may be available.";
  if (state.status === "permission" || state.status === "unsupported")
    return state.message ?? "Core Motion history is unavailable.";
  const status =
    state.status === "error"
      ? "Read failed · Retry available"
      : state.status === "importing"
        ? `Updating · ${state.windows.length} day window(s) remaining`
        : "History up to date";
  const coverage =
    state.coverageStart && state.coverageEnd
      ? `Queried ${new Date(state.coverageStart).toLocaleDateString()}–${new Date(state.coverageEnd).toLocaleDateString()}. Timing may be incomplete.`
      : "No completed history window yet.";
  const freshness = state.updatedAt
    ? `Last read ${new Date(state.updatedAt).toLocaleString()}.`
    : "";
  return [
    status,
    coverage,
    freshness,
    state.message,
    state.truncated
      ? "Some missed history is outside the 7-day recovery limit."
      : "Core Motion offers up to 7 days of history; background reads are best effort.",
  ]
    .filter(Boolean)
    .join("\n");
}

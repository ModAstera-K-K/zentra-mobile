import type { LocationRetentionPreference } from "@/types/zentra";

export const DEFAULT_LOCATION_RETENTION: LocationRetentionPreference = "24h";

export function getLocationRetentionDays(
  preference: LocationRetentionPreference,
): number {
  return preference === "30d" ? 30 : 1;
}

export function getLocationRetentionLabel(
  preference: LocationRetentionPreference,
): string {
  return preference === "30d" ? "30 days (extended)" : "24 hours (minimal)";
}

export function getLocationRetentionDescription(
  preference: LocationRetentionPreference,
): string {
  return preference === "30d"
    ? "Keeps raw location data for up to 30 days. Only turn this on if you genuinely want the longer history."
    : "Raw location is kept for just 24 hours. Derived patterns — like mobility estimates — stick around longer.";
}

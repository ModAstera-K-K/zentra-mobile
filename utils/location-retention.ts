import type { LocationRetentionPreference } from '@/types/zentra';

export const DEFAULT_LOCATION_RETENTION: LocationRetentionPreference = '24h';

export function getLocationRetentionDays(preference: LocationRetentionPreference): number {
  return preference === '30d' ? 30 : 1;
}

export function getLocationRetentionLabel(preference: LocationRetentionPreference): string {
  return preference === '30d' ? '30 days (extended)' : '24 hours (minimal)';
}

export function getLocationRetentionDescription(preference: LocationRetentionPreference): string {
  return preference === '30d'
    ? 'Extended retention keeps raw coordinates for up to 30 days. Enable this only if you explicitly want longer location history.'
    : 'Minimal retention keeps raw coordinates for 24 hours while preserving derived aggregates for longer-term trends.';
}

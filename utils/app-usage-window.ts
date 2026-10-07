/** A first/resumed query must include yesterday evening for the overnight rest window. */
export function appUsageSyncWindowStart(lastSyncedAt: string | null, now = new Date()): string {
  const recent = new Date(now);
  recent.setDate(recent.getDate() - 1);
  recent.setHours(0, 0, 0, 0);
  if (!lastSyncedAt || !Number.isFinite(Date.parse(lastSyncedAt))) return recent.toISOString();
  const prior = new Date(lastSyncedAt);
  prior.setHours(0, 0, 0, 0);
  return prior.toISOString();
}

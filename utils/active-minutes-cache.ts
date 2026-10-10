import type { SQLiteDatabase } from "expo-sqlite";
import type { ActiveMinutesSummary } from "@/types/active-minutes";
import type { ZentraEventRecord } from "@/types/zentra";
import { resolveActiveMinutesAsync } from "@/utils/active-minutes";
import { shiftISODate, parseISODate } from "@/utils/dates";
import { walkingEquivalent } from "@/utils/walking-calibration";
import { resolveStepTotal } from "@/utils/source-resolution";
import {
  assertRepositoryEpoch,
  repositoryEpoch,
} from "@/utils/repository-session";

export function activeCacheKey(date: string): string {
  return `active-minutes-v3:${date}:${parseISODate(date).getTimezoneOffset()}`;
}
export async function activityRevision(
  db: SQLiteDatabase,
  date: string,
): Promise<string> {
  const row = await db.getFirstAsync<{ revision: number }>(
    `SELECT COALESCE(MAX(revision),0) AS revision FROM event_changes WHERE data_type IN ('steps','activity','motion_context','exercise_session','active_timing') AND start_date <= ? AND end_date >= ?`,
    shiftISODate(date, 1),
    shiftISODate(date, -1),
  );
  return String(row?.revision ?? 0);
}
export async function cachedActiveMinutes(
  db: SQLiteDatabase,
  date: string,
  events: ZentraEventRecord[],
  loadContext?: () => Promise<ZentraEventRecord[]>,
): Promise<ActiveMinutesSummary> {
  const epoch = repositoryEpoch(),
    revision = await activityRevision(db, date),
    key = activeCacheKey(date);
  const cached = await db.getFirstAsync<{ payload: string; revision: number }>(
    "SELECT payload,revision FROM derived_cache WHERE cache_key=?",
    key,
  );
  let summary: ActiveMinutesSummary;
  if (cached && String(cached.revision) === revision)
    summary = JSON.parse(cached.payload);
  else {
    const profile = await db.getFirstAsync<{ payload: string }>(
      `SELECT payload FROM derived_cache WHERE cache_key=? AND CAST(revision AS INTEGER)=(SELECT COALESCE(MAX(revision),0) FROM event_changes WHERE data_type='steps' AND start_date <= ? AND end_date >= ?)`,
      `active-timing-v2:${date}:${parseISODate(date).getTimezoneOffset()}`,
      date,
      shiftISODate(date, -1),
    );
    const timing: ZentraEventRecord[] = profile
      ? JSON.parse(profile.payload)
      : [];
    const evidence = timing.length
      ? events.filter(
          (e) =>
            !(
              e.dataType === "steps" &&
              e.source === "health_connect" &&
              Date.parse(e.timestampEnd) > Date.parse(e.timestampStart) &&
              Date.parse(e.timestampEnd) - Date.parse(e.timestampStart) <=
                60_000
            ),
        )
      : events;
    summary = await resolveActiveMinutesAsync(
      date,
      [...(loadContext ? await loadContext() : []), ...evidence, ...timing],
      revision,
    );
    assertRepositoryEpoch(epoch);
    await db.runAsync(
      "INSERT OR REPLACE INTO derived_cache(cache_key,revision,payload) VALUES(?,?,?)",
      key,
      revision,
      JSON.stringify(summary),
    );
  }
  // A single bounded read; no history reconstruction or native queries on this path.
  const history = await db.getAllAsync<{ payload: string; cache_key: string }>(
    `SELECT c.payload,c.cache_key FROM derived_cache c WHERE c.cache_key >= ? AND c.cache_key < ? AND CAST(c.revision AS INTEGER) = (SELECT COALESCE(MAX(revision),0) FROM event_changes WHERE data_type IN ('steps','activity','motion_context','exercise_session','active_timing') AND start_date <= date(json_extract(c.payload,'$.date'),'+1 day') AND end_date >= date(json_extract(c.payload,'$.date'),'-1 day'))`,
    `active-minutes-v3:${shiftISODate(date, -30)}:`,
    `active-minutes-v3:${date}:`,
  );
  const valid = history
    .filter(
      (r) =>
        r.cache_key ===
        activeCacheKey((JSON.parse(r.payload) as ActiveMinutesSummary).date),
    )
    .map((r) => JSON.parse(r.payload) as ActiveMinutesSummary);
  return {
    ...summary,
    revision: await summaryRevision(db, date),
    walkingEquivalent: walkingEquivalent(
      date,
      resolveStepTotal(
        events.filter(
          (e) => e.timestampStart >= parseISODate(date).toISOString(),
        ),
      ) ?? 0,
      valid,
    ),
  };
}

export async function summaryRevision(
  db: SQLiteDatabase,
  date: string,
): Promise<string> {
  const row = await db.getFirstAsync<{ revision: number }>(
    "SELECT COALESCE(MAX(revision),0) AS revision FROM event_changes WHERE data_type IN ('steps','activity','motion_context','exercise_session','active_timing') AND start_date <= ? AND end_date >= ?",
    shiftISODate(date, 1),
    shiftISODate(date, -31),
  );
  return `${row?.revision ?? 0}:${parseISODate(date).getTimezoneOffset()}:v3`;
}
/**
 * `summaryRevision` for many days from one read of the window's change rows,
 * instead of one statement a day. Each day's revision is the newest change
 * that touches the 33 days its summary depends on.
 */
export async function summaryRevisions(
  db: SQLiteDatabase,
  dates: string[],
): Promise<Map<string, string>> {
  const revisions = new Map<string, string>();
  if (!dates.length) return revisions;
  const sorted = [...dates].sort();
  const changes = await db.getAllAsync<{
    start_date: string;
    end_date: string;
    revision: number;
  }>(
    "SELECT start_date,end_date,MAX(revision) AS revision FROM event_changes WHERE data_type IN ('steps','activity','motion_context','exercise_session','active_timing') AND start_date <= ? AND end_date >= ? GROUP BY start_date,end_date",
    shiftISODate(sorted[sorted.length - 1], 1),
    shiftISODate(sorted[0], -31),
  );
  for (const date of sorted) {
    const from = shiftISODate(date, -31),
      until = shiftISODate(date, 1);
    let revision = 0;
    for (const change of changes)
      if (
        change.start_date <= until &&
        change.end_date >= from &&
        change.revision > revision
      )
        revision = change.revision;
    revisions.set(
      date,
      `${revision}:${parseISODate(date).getTimezoneOffset()}:v3`,
    );
  }
  return revisions;
}
/** Whether a stored summary was built at `revision` (from `summaryRevision`). */
export function isActiveSummaryAt(
  payload: string | null | undefined,
  revision: string | undefined,
): boolean {
  if (!payload || !revision) return false;
  try {
    const summary = JSON.parse(payload) as ActiveMinutesSummary;
    return summary.calculationVersion === 3 && summary.revision === revision;
  } catch {
    return false;
  }
}
export async function isActiveSummaryCurrent(
  db: SQLiteDatabase,
  date: string,
  payload?: string | null,
): Promise<boolean> {
  if (!payload) return false;
  try {
    const summary = JSON.parse(payload) as ActiveMinutesSummary;
    return (
      summary.calculationVersion === 3 &&
      summary.revision === (await summaryRevision(db, date))
    );
  } catch {
    return false;
  }
}

import type { SQLiteDatabase } from "expo-sqlite";
import { enumerateISODateRange, shiftISODate } from "@/utils/dates";
import { SLEEP_NIGHT_DAYS_AFTER } from "@/utils/sleep-wake-date";

interface ChangeRange {
  start_date: string;
  end_date: string;
  revision: number;
}
interface CachedDay {
  cache_key: string;
  revision: number;
  payload: string;
}
export interface ActivityCacheDay {
  date: string;
  key: string;
  revision: number;
  payload?: string;
  /** Present from `samplesFrom` onward: the day's cached hourly score inputs. */
  samplesKey?: string;
  samples?: string;
}

// A stored day is reused for as long as its revision holds, so a change to
// what scoring would compute for the same events needs a new version here.
const MAXIMA_PREFIX = "hourly-maxima-v3";
const SAMPLES_PREFIX = "hourly-samples-v2";

export function activityMaximaKey(
  date: string,
  timezoneOffset: number,
): string {
  return `${MAXIMA_PREFIX}:${date}:${timezoneOffset}`;
}

export function activitySamplesKey(
  date: string,
  timezoneOffset: number,
): string {
  return `${SAMPLES_PREFIX}:${date}:${timezoneOffset}`;
}

/** Two reads for the entire window instead of two bridge calls per day. */
export async function readActivityCacheManifest(
  db: SQLiteDatabase,
  start: string,
  end: string,
  timezoneOffset: number,
  samplesFrom?: string,
): Promise<ActivityCacheDay[]> {
  const manifest = await readMaximaManifest(db, start, end, timezoneOffset);
  if (samplesFrom === undefined) return manifest;
  const first = samplesFrom < start ? start : samplesFrom;
  const samples =
    first > end
      ? []
      : await db.getAllAsync<CachedDay>(
          "SELECT cache_key,revision,payload FROM derived_cache WHERE cache_key>=? AND cache_key<?",
          `${SAMPLES_PREFIX}:${first}:`,
          `${SAMPLES_PREFIX}:${shiftISODate(end, 1)}:`,
        );
  const byKey = new Map(samples.map((row) => [row.cache_key, row]));
  return manifest.map((day) => {
    if (day.date < first) return day;
    const samplesKey = activitySamplesKey(day.date, timezoneOffset),
      row = byKey.get(samplesKey);
    return {
      ...day,
      samplesKey,
      samples: row?.revision === day.revision ? row.payload : undefined,
    };
  });
}

async function readMaximaManifest(
  db: SQLiteDatabase,
  start: string,
  end: string,
  timezoneOffset: number,
): Promise<ActivityCacheDay[]> {
  const [changes, cached] = await Promise.all([
    // A day is scored with the sleep records of the nights after it in view
    // (see getEventsForDayScoring), so a sleep change reaches back that far.
    db.getAllAsync<ChangeRange>(
      `SELECT start_date,end_date,MAX(revision) AS revision FROM (
        SELECT CASE WHEN data_type='sleep_inferred'
            THEN date(start_date,'-${SLEEP_NIGHT_DAYS_AFTER} days') ELSE start_date END AS start_date,
          end_date,revision
        FROM event_changes WHERE start_date<=? AND end_date>=?
      ) GROUP BY start_date,end_date`,
      shiftISODate(end, SLEEP_NIGHT_DAYS_AFTER),
      shiftISODate(start, -1),
    ),
    db.getAllAsync<CachedDay>(
      "SELECT cache_key,revision,payload FROM derived_cache WHERE cache_key>=? AND cache_key<?",
      `${MAXIMA_PREFIX}:${start}:`,
      `${MAXIMA_PREFIX}:${shiftISODate(end, 1)}:`,
    ),
  ]);
  return buildActivityCacheManifest(
    start,
    end,
    timezoneOffset,
    changes,
    cached,
  );
}

/**
 * One revision for the stored days in [start, end]: it moves whenever the
 * manifest would report any of them stale.
 */
export async function readActivityCacheRevision(
  db: SQLiteDatabase,
  start: string,
  end: string,
): Promise<string> {
  const row = await db.getFirstAsync<{ revision: number }>(
    `SELECT COALESCE(MAX(revision),0) AS revision FROM event_changes
      WHERE end_date>=? AND (start_date<=? OR (data_type='sleep_inferred' AND start_date<=?))`,
    shiftISODate(start, -1),
    end,
    shiftISODate(end, SLEEP_NIGHT_DAYS_AFTER),
  );
  return String(row?.revision ?? 0);
}

export function buildActivityCacheManifest(
  start: string,
  end: string,
  timezoneOffset: number,
  changes: ChangeRange[],
  cached: CachedDay[],
): ActivityCacheDay[] {
  const revisions = new Map(
    enumerateISODateRange(start, end).map((date) => [date, 0]),
  );
  for (const change of changes) {
    const last = shiftISODate(change.end_date, 1); // Overnight records may affect the following day.
    let date = change.start_date < start ? start : change.start_date;
    while (date <= end && date <= last) {
      revisions.set(date, Math.max(revisions.get(date) ?? 0, change.revision));
      date = shiftISODate(date, 1);
    }
  }
  const byKey = new Map(cached.map((row) => [row.cache_key, row]));
  return [...revisions].map(([date, revision]) => {
    const key = activityMaximaKey(date, timezoneOffset),
      row = byKey.get(key);
    return {
      date,
      key,
      revision,
      payload: row?.revision === revision ? row.payload : undefined,
    };
  });
}

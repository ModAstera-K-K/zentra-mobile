import type { SQLiteDatabase } from "expo-sqlite";
import { enumerateISODateRange, shiftISODate } from "@/utils/dates";

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
}

/** Two reads for the entire window instead of two bridge calls per day. */
export async function readActivityCacheManifest(
  db: SQLiteDatabase,
  start: string,
  end: string,
  timezoneOffset: number,
): Promise<ActivityCacheDay[]> {
  const [changes, cached] = await Promise.all([
    db.getAllAsync<ChangeRange>(
      "SELECT start_date,end_date,MAX(revision) AS revision FROM event_changes WHERE start_date<=? AND end_date>=? GROUP BY start_date,end_date",
      end,
      shiftISODate(start, -1),
    ),
    db.getAllAsync<CachedDay>(
      "SELECT cache_key,revision,payload FROM derived_cache WHERE cache_key>=? AND cache_key<?",
      `hourly-maxima-v2:${start}:`,
      `hourly-maxima-v2:${shiftISODate(end, 1)}:`,
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
    const key = `hourly-maxima-v2:${date}:${timezoneOffset}`,
      row = byKey.get(key);
    return {
      date,
      key,
      revision,
      payload: row?.revision === revision ? row.payload : undefined,
    };
  });
}

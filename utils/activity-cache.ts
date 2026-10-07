import {
  activitySamplesKey,
  readActivityCacheManifest,
  readActivityCacheRevision,
} from "@/utils/activity-cache-manifest";
import {
  loadActivityHistoryFrom,
  type ActivityHistory,
} from "@/utils/activity-cache-loader";
import { encodeActivityHourSamples } from "@/utils/activity-hour-samples";
import {
  assertRepositoryEpoch,
  repositoryEpoch,
} from "@/utils/repository-session";
import {
  enqueueDatabaseOperation,
  getEventsForDayScoring,
  getRepositoryFirstDate,
} from "@/utils/event-repository";
import { getLocalDatabase } from "@/utils/local-database";
import { buildActivityScoreMaxima } from "@/utils/activity-intensity";
import { buildUnifiedTimelineAsync } from "@/utils/unified-timeline";
import { parseISODate, shiftISODate } from "@/utils/dates";

export type { ActivityHistory } from "@/utils/activity-cache-loader";

/** Changes whenever `loadActivityHistory` would recompute a day in [start, end]. */
export function getActivityHistoryRevision(
  start: string,
  end: string,
): Promise<string> {
  return enqueueDatabaseOperation(async () =>
    readActivityCacheRevision(await getLocalDatabase(), start, end),
  );
}

/** `loadActivityHistoryFrom` over the device database; see it for the contract. */
export function loadActivityHistory(
  start: string,
  end: string,
  samplesFrom: string,
  signal: AbortSignal,
  onProgress?: (history: ActivityHistory) => void,
): Promise<ActivityHistory> {
  const epoch = repositoryEpoch();
  const timezoneOffset = new Date().getTimezoneOffset();
  return loadActivityHistoryFrom(
    {
      assertActive: () => assertRepositoryEpoch(epoch),
      firstDate: getRepositoryFirstDate,
      manifest: (first, last, from) =>
        enqueueDatabaseOperation(async () =>
          readActivityCacheManifest(
            await getLocalDatabase(),
            first,
            last,
            timezoneOffset,
            from,
          ),
        ),
      scoreDay: async (date, withSamples, daySignal) => {
        const buckets = await buildUnifiedTimelineAsync(
          // A day outside the pattern only contributes maxima, so it skips the
          // event types that cannot move them.
          await getEventsForDayScoring(date, {
            maximaOnly: !withSamples,
            validate: false,
          }),
          {
            startTimestamp: parseISODate(date).toISOString(),
            endTimestamp: parseISODate(shiftISODate(date, 1)).toISOString(),
            resolution: "hour",
          },
          daySignal,
          undefined,
          { labels: false },
        );
        return {
          maxima: buildActivityScoreMaxima(buckets),
          samples: withSamples ? encodeActivityHourSamples(buckets) : null,
        };
      },
      saveDay: (day, maxima, samples) =>
        enqueueDatabaseOperation(async () => {
          assertRepositoryEpoch(epoch);
          const db = await getLocalDatabase();
          const saveMaxima = () =>
            db.runAsync(
              "INSERT OR REPLACE INTO derived_cache(cache_key,revision,payload) VALUES(?,?,?)",
              day.key,
              day.revision,
              JSON.stringify(maxima),
            );
          if (samples === null) {
            await saveMaxima();
            return;
          }
          await db.withTransactionAsync(async () => {
            await saveMaxima();
            await db.runAsync(
              "INSERT OR REPLACE INTO derived_cache(cache_key,revision,payload) VALUES(?,?,?)",
              day.samplesKey ?? activitySamplesKey(day.date, timezoneOffset),
              day.revision,
              samples,
            );
          });
        }),
    },
    start,
    end,
    samplesFrom,
    signal,
    onProgress,
  );
}

import {
  activitySamplesKey,
  activityTrendKey,
  readActivityCacheManifest,
  readActivityCacheRevision,
} from "@/utils/activity-cache-manifest";
import {
  loadActivityHistoryFrom,
  type ActivityHistory,
  type ActivityHistoryOptions,
} from "@/utils/activity-cache-loader";
import { buildTrendDaySummary } from "@/utils/trend-day-summary";
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
  options?: ActivityHistoryOptions,
): Promise<ActivityHistory> {
  const epoch = repositoryEpoch();
  const timezoneOffset = new Date().getTimezoneOffset();
  return loadActivityHistoryFrom(
    {
      assertActive: () => assertRepositoryEpoch(epoch),
      firstDate: getRepositoryFirstDate,
      manifest: (first, last, from, withTrends) =>
        enqueueDatabaseOperation(async () =>
          readActivityCacheManifest(
            await getLocalDatabase(),
            first,
            last,
            timezoneOffset,
            from,
            withTrends,
          ),
        ),
      scoreDay: async (date, withSamples, daySignal) => {
        // A day outside the drawn range only contributes maxima, so it skips
        // the event types that cannot move them.
        const events = await getEventsForDayScoring(date, {
          maximaOnly: !withSamples,
          validate: false,
        });
        const buckets = await buildUnifiedTimelineAsync(
          events,
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
          // The same read serves Trends, so its range is warm too.
          trend: withSamples
            ? JSON.stringify(buildTrendDaySummary(date, events))
            : null,
        };
      },
      saveDay: (day, { maxima, samples, trend }) =>
        enqueueDatabaseOperation(async () => {
          assertRepositoryEpoch(epoch);
          const db = await getLocalDatabase();
          const save = (key: string, payload: string) =>
            db.runAsync(
              "INSERT OR REPLACE INTO derived_cache(cache_key,revision,payload) VALUES(?,?,?)",
              key,
              day.revision,
              payload,
            );
          if (samples === null) {
            await save(day.key, JSON.stringify(maxima));
            return;
          }
          await db.withTransactionAsync(async () => {
            await save(day.key, JSON.stringify(maxima));
            await save(
              day.samplesKey ?? activitySamplesKey(day.date, timezoneOffset),
              samples,
            );
            if (trend !== null)
              await save(
                day.trendKey ?? activityTrendKey(day.date, timezoneOffset),
                trend,
              );
          });
        }),
    },
    start,
    end,
    samplesFrom,
    signal,
    onProgress,
    options,
  );
}

import {
  activitySamplesKey,
  readActivityCacheManifest,
  readActivityCacheRevision,
} from "@/utils/activity-cache-manifest";
import type { ActivityCacheDay } from "@/utils/activity-cache-manifest";
import {
  decodeActivityHourSamples,
  encodeActivityHourSamples,
} from "@/utils/activity-hour-samples";
import {
  assertRepositoryEpoch,
  repositoryEpoch,
} from "@/utils/repository-session";
import {
  enqueueDatabaseOperation,
  getEventsForDayScoring,
  getRepositoryDateBounds,
} from "@/utils/event-repository";
import { getLocalDatabase } from "@/utils/local-database";
import {
  buildActivityScoreMaxima,
  mergeActivityScoreMaxima,
  type ActivityScoreInput,
} from "@/utils/activity-intensity";
import { buildUnifiedTimelineAsync } from "@/utils/unified-timeline";
import { createCooperativeYield } from "@/utils/cooperative-work";
import { parseISODate, shiftISODate } from "@/utils/dates";
import type { ActivityScoreMaxima } from "@/types/zentra";

export interface ActivityHistory {
  /** False while older uncached days are still being filled in. */
  complete: boolean;
  maxima: ActivityScoreMaxima;
  /** Hourly score inputs for each stored day from `samplesFrom` onward. */
  samplesByDate: Map<string, ActivityScoreInput[]>;
}

/** Changes whenever `loadActivityHistory` would recompute a day in [start, end]. */
export function getActivityHistoryRevision(
  start: string,
  end: string,
): Promise<string> {
  return enqueueDatabaseOperation(async () =>
    readActivityCacheRevision(await getLocalDatabase(), start, end),
  );
}

/**
 * Normalization maxima for [start, end] plus cached hourly score inputs for
 * the days the Today pattern draws, so the pattern never re-reads raw events
 * for past days. On a cold cache the visible days are computed first and
 * reported through `onPartial` before the rest of the window is filled in.
 */
export async function loadActivityHistory(
  start: string,
  end: string,
  samplesFrom: string,
  signal: AbortSignal,
  onPartial?: (history: ActivityHistory) => void,
): Promise<ActivityHistory> {
  const epoch = repositoryEpoch();
  const history: ActivityHistory = {
    complete: true,
    maxima: buildActivityScoreMaxima([]),
    samplesByDate: new Map(),
  };
  const bounds = await getRepositoryDateBounds();
  if (!bounds) return history;
  const first = start < bounds.start ? bounds.start : start;
  const last = end > bounds.end ? bounds.end : end;
  if (first > last) return history;
  const timezoneOffset = new Date().getTimezoneOffset();
  const manifest = await enqueueDatabaseOperation(async () =>
    readActivityCacheManifest(
      await getLocalDatabase(),
      first,
      last,
      timezoneOffset,
      samplesFrom,
    ),
  );

  const visible = manifest.filter((day) => day.samplesKey);
  const older = manifest.filter((day) => !day.samplesKey);
  // A warm year is ~365 cached parses: slice them rather than block the thread.
  const yieldIfSliceSpent = createCooperativeYield();
  for (const day of visible) {
    await loadDay(day, epoch, timezoneOffset, signal, history);
    await yieldIfSliceSpent();
  }
  if (onPartial && older.some((day) => !day.payload)) {
    onPartial({ ...history, complete: false, maxima: { ...history.maxima } });
  }
  for (const day of older) {
    await loadDay(day, epoch, timezoneOffset, signal, history);
    await yieldIfSliceSpent();
  }
  return history;
}

async function loadDay(
  day: ActivityCacheDay,
  epoch: number,
  timezoneOffset: number,
  signal: AbortSignal,
  history: ActivityHistory,
): Promise<void> {
  assertRepositoryEpoch(epoch);
  if (signal.aborted) throw new Error("Work cancelled");
  const needsSamples = Boolean(day.samplesKey);
  let dayMaxima: ActivityScoreMaxima;
  let samples: ActivityScoreInput[] | null = null;

  if (day.payload && (!needsSamples || day.samples)) {
    dayMaxima = JSON.parse(day.payload);
    if (day.samples) samples = decodeActivityHourSamples(day.samples);
  } else {
    const buckets = await buildUnifiedTimelineAsync(
      await getEventsForDayScoring(day.date),
      {
        startTimestamp: parseISODate(day.date).toISOString(),
        endTimestamp: parseISODate(shiftISODate(day.date, 1)).toISOString(),
        resolution: "hour",
      },
      signal,
    );
    dayMaxima = buildActivityScoreMaxima(buckets);
    // Stored for every computed day so a wider grid or window can reuse it.
    const encodedSamples = encodeActivityHourSamples(buckets);
    samples = decodeActivityHourSamples(encodedSamples);
    const samplesKey =
      day.samplesKey ?? activitySamplesKey(day.date, timezoneOffset);
    await enqueueDatabaseOperation(async () => {
      assertRepositoryEpoch(epoch);
      const db = await getLocalDatabase();
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          "INSERT OR REPLACE INTO derived_cache(cache_key,revision,payload) VALUES(?,?,?)",
          day.key,
          day.revision,
          JSON.stringify(dayMaxima),
        );
        await db.runAsync(
          "INSERT OR REPLACE INTO derived_cache(cache_key,revision,payload) VALUES(?,?,?)",
          samplesKey,
          day.revision,
          encodedSamples,
        );
      });
    });
  }

  history.maxima = mergeActivityScoreMaxima(history.maxima, dayMaxima);
  if (needsSamples && samples) history.samplesByDate.set(day.date, samples);
}

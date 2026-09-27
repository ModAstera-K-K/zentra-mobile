import { readActivityCacheManifest } from "@/utils/activity-cache-manifest";
import {
  assertRepositoryEpoch,
  repositoryEpoch,
} from "@/utils/repository-session";
import {
  enqueueDatabaseOperation,
  getEventsForRange,
  getRepositoryDateBounds,
} from "@/utils/event-repository";
import { getLocalDatabase } from "@/utils/local-database";
import { buildActivityScoreMaxima } from "@/utils/activity-intensity";
import { buildUnifiedTimelineAsync } from "@/utils/unified-timeline";
import { parseISODate, shiftISODate } from "@/utils/dates";
import type { ActivityScoreMaxima } from "@/types/zentra";

export async function loadNormalizationMaxima(
  start: string,
  end: string,
  signal: AbortSignal,
): Promise<ActivityScoreMaxima> {
  const epoch = repositoryEpoch();
  const maxima = buildActivityScoreMaxima([]);
  const bounds = await getRepositoryDateBounds();
  if (!bounds) return maxima;
  const first = start < bounds.start ? bounds.start : start;
  const last = end > bounds.end ? bounds.end : end;
  if (first > last) return maxima;
  const manifest = await enqueueDatabaseOperation(async () =>
    readActivityCacheManifest(
      await getLocalDatabase(),
      first,
      last,
      new Date().getTimezoneOffset(),
    ),
  );
  for (const { date, key, revision, payload } of manifest) {
    assertRepositoryEpoch(epoch);
    if (signal.aborted) throw new Error("Work cancelled");
    const prior = shiftISODate(date, -1);
    let dayMaxima: ActivityScoreMaxima;
    if (payload) dayMaxima = JSON.parse(payload);
    else {
      const startTimestamp = parseISODate(date).toISOString(),
        endTimestamp = parseISODate(shiftISODate(date, 1)).toISOString();
      const events = (await getEventsForRange(prior, date)).filter(
        (e) =>
          e.timestampEnd >= startTimestamp && e.timestampStart < endTimestamp,
      );
      const buckets = await buildUnifiedTimelineAsync(
        events,
        { startTimestamp, endTimestamp, resolution: "hour" },
        signal,
      );
      dayMaxima = buildActivityScoreMaxima(buckets);
      await enqueueDatabaseOperation(async () => {
        assertRepositoryEpoch(epoch);
        await (
          await getLocalDatabase()
        ).runAsync(
          "INSERT OR REPLACE INTO derived_cache(cache_key,revision,payload) VALUES(?,?,?)",
          key,
          revision,
          JSON.stringify(dayMaxima),
        );
      });
    }
    for (const key of Object.keys(maxima) as (keyof ActivityScoreMaxima)[])
      maxima[key] = Math.max(maxima[key], dayMaxima[key]);
  }
  return maxima;
}

import {
  assertRepositoryEpoch,
  repositoryEpoch,
} from "@/utils/repository-session";
import {
  getEventsForRange,
  getRepositoryRevision,
  enqueueDatabaseOperation,
} from "@/utils/event-repository";
import { getHealthSyncStatus } from "@/utils/health-sync-repository";
import { getLocalDatabase } from "@/utils/local-database";
import {
  buildMetricObservation,
  INSIGHT_METRICS,
} from "@/utils/metric-observations";
import { buildPersonalInsights } from "@/utils/personal-insights";
import { shiftISODate } from "@/utils/dates";
import type { HealthSyncState } from "@/types/health-sync";
import type { MetricObservation, PersonalInsight } from "@/types/insights";

/** Days of observations a comparison is built from. */
const WINDOW_DAYS = 14;
/** Record ids kept per observation; the evidence view shows 50 at most. */
const STORED_RECORD_IDS = 50;

// The last result and what it was built from. A tick that changes none of
// those inputs gets it back after two statements instead of twenty-nine.
let lastResult: { key: string; insights: PersonalInsight[] } | null = null;

const jobs = new Map<string, Promise<PersonalInsight[]>>();
export function loadPersonalInsights(
  anchor: string,
  revision: string,
): Promise<PersonalInsight[]> {
  const key = `${repositoryEpoch()}:${anchor}:${revision}`;
  const existing = jobs.get(key);
  if (existing) return existing;
  const job = loadInsights(anchor).finally(() => jobs.delete(key));
  jobs.set(key, job);
  return job;
}
function healthStateKey(states: HealthSyncState[]): string {
  return JSON.stringify(
    states.map((s) => [
      s.record_type,
      s.status,
      s.start_at?.slice(0, 10),
      s.end_at?.slice(0, 10),
    ]),
  );
}
async function loadInsights(anchor: string): Promise<PersonalInsight[]> {
  const epoch = repositoryEpoch();
  const states = await getHealthSyncStatus();
  // Everything the observations read: the window's days and the day before
  // the first, the health import state, and the device's UTC offset.
  const windowRevision = await getRepositoryRevision(
    shiftISODate(anchor, -WINDOW_DAYS - 1),
    shiftISODate(anchor, -1),
  );
  const key = [
    epoch,
    anchor,
    new Date().getTimezoneOffset(),
    windowRevision,
    healthStateKey(states),
    // `updated_at` is shown with each observation.
    states.map((s) => s.updated_at).join(","),
  ].join("|");
  if (lastResult?.key === key) return lastResult.insights;
  const insights = buildPersonalInsights(
    await loadObservations(anchor, states, epoch),
    anchor,
  );
  lastResult = { key, insights };
  return insights;
}
async function loadObservations(
  anchor: string,
  states: HealthSyncState[],
  epoch: number,
): Promise<MetricObservation[]> {
  const observations: MetricObservation[] = [];
  for (let offset = WINDOW_DAYS; offset >= 1; offset--) {
    assertRepositoryEpoch(epoch);
    const day = shiftISODate(anchor, -offset),
      prior = shiftISODate(day, -1);
    const revision = await getRepositoryRevision(prior, day);
    const cacheKey = `observations-v1:${day}:${new Date().getTimezoneOffset()}:${healthStateKey(states)}`;
    const cached = await enqueueDatabaseOperation(async () =>
      (await getLocalDatabase()).getFirstAsync<{ payload: string }>(
        "SELECT payload FROM derived_cache WHERE cache_key=? AND revision=?",
        cacheKey,
        Number(revision),
      ),
    );
    if (cached)
      observations.push(...(JSON.parse(cached.payload) as MetricObservation[]));
    else {
      const events = await getEventsForRange(prior, day);
      const next = INSIGHT_METRICS.map((metric) => {
        const observation = buildMetricObservation(metric, day, events, states);
        return {
          ...observation,
          // A day of app usage is hundreds of ids; keep what can be shown.
          recordCount: observation.recordIds.length,
          recordIds: observation.recordIds.slice(0, STORED_RECORD_IDS),
          revision,
        };
      });
      observations.push(...next);
      await enqueueDatabaseOperation(async () => {
        assertRepositoryEpoch(epoch);
        const db = await getLocalDatabase();
        await db.runAsync(
          "DELETE FROM derived_cache WHERE cache_key LIKE ?",
          `observations-v1:${day}:%`,
        );
        await db.runAsync(
          "INSERT OR REPLACE INTO derived_cache(cache_key,revision,payload) VALUES(?,?,?)",
          cacheKey,
          Number(revision),
          JSON.stringify(next),
        );
      });
    }
  }
  assertRepositoryEpoch(epoch);
  // Days that have left the window are never read again.
  await enqueueDatabaseOperation(async () => {
    assertRepositoryEpoch(epoch);
    await (
      await getLocalDatabase()
    ).runAsync(
      "DELETE FROM derived_cache WHERE cache_key >= 'observations-v1:' AND cache_key < ?",
      `observations-v1:${shiftISODate(anchor, -WINDOW_DAYS)}:`,
    );
  });
  return observations;
}

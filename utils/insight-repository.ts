import {
  assertRepositoryEpoch,
  repositoryEpoch,
} from "@/utils/repository-session";
import {
  getEventsForRange,
  getRepositoryRevision,
  enqueueDatabaseOperation,
} from "@/utils/event-repository";
import { getHealthSyncStates } from "@/utils/health-sync-repository";
import { getLocalDatabase } from "@/utils/local-database";
import {
  buildMetricObservation,
  INSIGHT_METRICS,
} from "@/utils/metric-observations";
import { buildPersonalInsights } from "@/utils/personal-insights";
import { shiftISODate } from "@/utils/dates";
import type { MetricObservation, PersonalInsight } from "@/types/insights";

const jobs = new Map<string, Promise<PersonalInsight[]>>();
export function loadPersonalInsights(
  anchor: string,
  revision: string,
): Promise<PersonalInsight[]> {
  const key = `${repositoryEpoch()}:${anchor}:${revision}`;
  const existing = jobs.get(key);
  if (existing) return existing;
  const job = loadObservations(anchor)
    .then((observations) => buildPersonalInsights(observations, anchor))
    .finally(() => jobs.delete(key));
  jobs.set(key, job);
  return job;
}
async function loadObservations(anchor: string): Promise<MetricObservation[]> {
  const epoch = repositoryEpoch();
  const states = await getHealthSyncStates();
  const observations: MetricObservation[] = [];
  for (let offset = 14; offset >= 1; offset--) {
    assertRepositoryEpoch(epoch);
    const day = shiftISODate(anchor, -offset),
      prior = shiftISODate(day, -1);
    const revision = await getRepositoryRevision(prior, day);
    const cacheKey = `observations-v1:${day}:${new Date().getTimezoneOffset()}:${JSON.stringify(states.map((s) => [s.record_type, s.status, s.start_at?.slice(0, 10), s.end_at?.slice(0, 10)]))}`;
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
      const next = INSIGHT_METRICS.map((metric) => ({
        ...buildMetricObservation(metric, day, events, states),
        revision,
      }));
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
  return observations;
}

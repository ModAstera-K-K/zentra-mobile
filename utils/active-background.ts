import {
  enqueueDatabaseOperation,
  getHealthStepEventsForRange,
  getDailyAggregateForDate,
} from "@/utils/event-repository";
import { getLocalDatabase } from "@/utils/local-database";
import { ACTIVE_TIMING_CHANGE_TYPE } from "@/utils/repository-revision";
import { parseISODate, shiftISODate } from "@/utils/dates";
import { readHealthStepTiming } from "@/utils/native/zentra-native-signals";
import { timingProfileEventsAsync } from "@/utils/active-timing-profile";
import {
  assertRepositoryEpoch,
  repositoryEpoch,
} from "@/utils/repository-session";
import {
  assertHealthSyncGeneration,
  healthSyncGeneration,
} from "@/utils/health-sync-session";

const jobs = new Map<string, Promise<void>>();
const owners = new WeakMap<Promise<void>, AbortSignal>();
let nativeQueue: Promise<unknown> = Promise.resolve();
export function profileKey(date: string): string {
  return `active-timing-v2:${date}:${parseISODate(date).getTimezoneOffset()}`;
}
async function stepRevision(date: string): Promise<string> {
  return enqueueDatabaseOperation(async () => {
    const row = await (
      await getLocalDatabase()
    ).getFirstAsync<{ revision: number }>(
      "SELECT COALESCE(MAX(revision),0) AS revision FROM event_changes WHERE data_type='steps' AND start_date <= ? AND end_date >= ?",
      date,
      shiftISODate(date, -1),
    );
    return String(row?.revision ?? 0);
  });
}
async function refreshProfile(
  date: string,
  signal: AbortSignal,
): Promise<void> {
  const epoch = repositoryEpoch(),
    generation = healthSyncGeneration();
  const assertActive = () => {
    assertRepositoryEpoch(epoch);
    assertHealthSyncGeneration(generation);
    if (signal.aborted) throw new Error("Work cancelled");
  };
  assertActive();
  const revision = await stepRevision(date),
    key = profileKey(date);
  const cached = await enqueueDatabaseOperation(async () =>
    (await getLocalDatabase()).getFirstAsync<{ revision: number }>(
      "SELECT revision FROM derived_cache WHERE cache_key=?",
      key,
    ),
  );
  if (cached && String(cached.revision) === revision) return;
  // The profile is built from imported step records alone; reading every
  // event type here cost two full days of rows per refreshed day.
  const raw = await getHealthStepEventsForRange(shiftISODate(date, -1), date);
  if (!raw.some((e) => e.metadata.stale_import !== true)) return;
  const start = parseISODate(date).toISOString(),
    end = parseISODate(shiftISODate(date, 1)).toISOString();
  assertActive();
  const records = await readHealthStepTiming(start, end);
  assertActive();
  const events = await timingProfileEventsAsync(records, raw, signal);
  if ((await stepRevision(date)) !== revision) return; // a source correction won the race; retry next refresh
  await enqueueDatabaseOperation(async () => {
    assertActive();
    const db = await getLocalDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        "INSERT OR REPLACE INTO derived_cache(cache_key,revision,payload) VALUES(?,?,?)",
        key,
        revision,
        JSON.stringify(events),
      );
      // Committed derived evidence also invalidates subscribed views without changing raw step totals.
      await db.runAsync(
        "INSERT INTO event_changes(start_date,end_date,data_type) VALUES(?,?,?)",
        date,
        date,
        ACTIVE_TIMING_CHANGE_TYPE,
      );
    });
  });
}
export async function refreshActiveDay(
  date: string,
  signal: AbortSignal,
  health: boolean,
): Promise<void> {
  const key = `${date}:${repositoryEpoch()}:${health}`;
  let job = jobs.get(key);
  if (!job) {
    job = (async () => {
      if (health) {
        const nativeJob = nativeQueue
          .catch(() => undefined)
          .then(() => refreshProfile(date, signal));
        nativeQueue = nativeJob;
        await nativeJob;
      }
      if (!signal.aborted) await getDailyAggregateForDate(date);
    })().finally(() => jobs.delete(key));
    jobs.set(key, job);
    owners.set(job, signal);
  }
  try {
    await job;
  } catch (error) {
    // A screen that still needs the day retries a job whose original owner blurred.
    if (!signal.aborted && owners.get(job)?.aborted)
      return refreshActiveDay(date, signal, health);
    throw error;
  }
}

import { getLocalDatabase } from "@/utils/local-database";
import { decodeEventRowsWork, enqueueDatabaseOperation, getEventsOfTypeForRange, mapEventRow, rebuildAggregateForDate, type EventRow } from "@/utils/event-repository";
import { runCooperatively } from "@/utils/cooperative-work";
import { repositoryEpoch, assertRepositoryEpoch } from "@/utils/repository-session";
import { getLocalDatesForEvents } from "@/utils/repository-aggregates";
import { parseISODate, shiftISODate, toISODate } from "@/utils/dates";
import { inferSleepEventsAsync } from "@/utils/sleep-inference";
import { restWakeDates } from "@/utils/rest-window";
import { commitRestEstimates, upsertRestEvent } from "@/utils/rest-inference-sql";
import { createRestAdjustment, adjustmentDates } from "@/utils/rest-adjustment";
import { selectSleepForWakeDate } from "@/utils/sleep-selection";
import { sleepSummaryEvent } from "@/utils/sleep-summary";
import type { ZentraEventRecord } from "@/types/zentra";
import { RELEASE_FLAGS } from "@/constants/release-flags";
import { readActivityHistoryState } from "@/utils/activity-history-sql";
import { pendingRestHistoryGaps } from "@/utils/rest-history-coverage";

/**
 * The night that ended on `wakeDate`, from the sleep records alone. The
 * summary reads no other event type, so none of them is fetched.
 */
export async function loadSleepSummaryEvent(wakeDate: string): Promise<ZentraEventRecord | null> {
  return sleepSummaryEvent(await getEventsOfTypeForRange("sleep_inferred", shiftISODate(wakeDate, -1), wakeDate), wakeDate);
}

let restReconcileInFlight: Promise<number> | null = null;

/**
 * Re-infer rest for the nights around `now` and store what changed. Calls made
 * while one is running share that run.
 */
export function reconcileRestEstimates(now = new Date()): Promise<number> {
  restReconcileInFlight ??= runRestReconcile(now).finally(() => {
    restReconcileInFlight = null;
  });
  return restReconcileInFlight;
}

/**
 * Only the read and the commit hold the database queue. Decoding eight days of
 * records and inferring rest from them takes a few hundred milliseconds, and
 * runs between the two so screen reads are not kept waiting behind it. The
 * commit only touches the rows it read or inferred, so a write that lands in
 * between is left alone and picked up by the next run.
 */
async function runRestReconcile(now: Date): Promise<number> {
  const epoch = repositoryEpoch(), date = toISODate(now);
  const { rows, gaps } = await enqueueDatabaseOperation(async () => {
    const db = await getLocalDatabase();
    const rows = await db.getAllAsync<EventRow>(`SELECT * FROM events WHERE timestamp_start >= ? AND timestamp_start <= ?
      AND data_type IN ('activity','screen_state','app_usage','unlock_event','steps','exercise_session','motion_context','location','charging_state','sleep_inferred')
      ORDER BY timestamp_start`,
      parseISODate(shiftISODate(date, -8)).toISOString(), now.toISOString());
    return { rows, gaps: pendingRestHistoryGaps(await readActivityHistoryState(db)) };
  });
  // Eight days of records: decode in slices rather than block the thread.
  const events = await runCooperatively(decodeEventRowsWork(rows));
  const next = RELEASE_FLAGS.restInference ? await inferSleepEventsAsync(events, date, now, gaps) : [];
  return enqueueDatabaseOperation(async () => {
    const db = await getLocalDatabase();
    const changed = await commitRestEstimates(db, next, events, restWakeDates(date), () => assertRepositoryEpoch(epoch));
    const affected = getLocalDatesForEvents(changed);
    for (const day of affected) await rebuildAggregateForDate(db, day);
    return next.length;
  });
}

export function saveRestAdjustment(wakeDate: string, start: string, end: string): Promise<void> {
  const event = createRestAdjustment(wakeDate, start, end), epoch = repositoryEpoch();
  return enqueueDatabaseOperation(async () => {
    if (!RELEASE_FLAGS.restInference) throw new Error("Rest adjustments are disabled in this build.");
    const db = await getLocalDatabase();
    assertRepositoryEpoch(epoch);
    const rows = await db.getAllAsync<EventRow>("SELECT * FROM events WHERE data_type='sleep_inferred' AND timestamp_start >= ? AND timestamp_start < ?",
      parseISODate(shiftISODate(wakeDate, -1)).toISOString(), parseISODate(shiftISODate(wakeDate, 1)).toISOString());
    const selected = selectSleepForWakeDate(rows.map(mapEventRow), wakeDate);
    if (!selected.length || selected.some((e) => e.source === "health_connect"))
      throw new Error("The source changed. Refresh the card before adjusting inferred rest.");
    await upsertRestEvent(db, event);
    for (const date of adjustmentDates(wakeDate)) await rebuildAggregateForDate(db, date);
  });
}

export function resetRestAdjustment(wakeDate: string): Promise<void> {
  const epoch = repositoryEpoch();
  return enqueueDatabaseOperation(async () => {
    const db = await getLocalDatabase();
    assertRepositoryEpoch(epoch);
    await db.runAsync("UPDATE events SET metadata=json_set(metadata,'$.stale_import',json('true')) WHERE id=? AND source='inferred' AND json_extract(metadata,'$.rest_user_adjusted')=1 AND json_extract(metadata,'$.stale_import') IS NOT 1", `rest-adjusted-${wakeDate}`);
    for (const date of adjustmentDates(wakeDate)) await rebuildAggregateForDate(db, date);
  });
}

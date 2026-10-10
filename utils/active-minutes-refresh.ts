import { RELEASE_FLAGS } from "@/constants/release-flags";
import { refreshActiveDay } from "@/utils/active-background";
import {
  activeRangeRevision,
  calibrationDates,
} from "@/utils/active-refresh-state";
import { shiftISODate } from "@/utils/dates";
import {
  enqueueDatabaseOperation,
  rebuildAggregateForDate,
} from "@/utils/event-repository";
import { getLocalDatabase } from "@/utils/local-database";

/**
 * The most days before the range's end that a range refresh walks. The preset
 * ranges end at 90 days; a longer custom range keeps the values already stored
 * for its older days.
 */
export const MAX_RANGE_WALK_DAYS = 90;

/** What earlier refreshes brought up to date, kept by the caller between runs. */
export interface ActiveRefreshMemory {
  /** The whole request, when nothing in it has changed since. */
  complete: string | null;
  /** The range's last day, refreshed on its own because it is still filling. */
  end: { key: string; date: string; signature: string } | null;
  /** The days before it that have been walked, back to `start`. */
  history: { key: string; start: string; end: string; signature: string } | null;
}

export function createActiveRefreshMemory(): ActiveRefreshMemory {
  return { complete: null, end: null, history: null };
}

export interface ActiveRefreshRequest {
  start: string;
  end: string;
  /** A screen's range: every day is walked, not only days with walking evidence. */
  rangeMode: boolean;
  health: boolean;
  timezone: number;
  signal: AbortSignal;
  memory: ActiveRefreshMemory;
  /** Re-read today's records for the screens showing them. */
  refreshToday: () => Promise<void>;
  /** Called once there turns out to be something to do. */
  onUpdating: () => void;
  refreshDay?: typeof refreshActiveDay;
}

/**
 * Bring active minutes up to date for `start` to `end`. A request repeats work
 * only for what changed: the last day when its own records moved, earlier days
 * when theirs did, and for a range that grew, just the days it added.
 */
export async function refreshActiveMinutes(
  request: ActiveRefreshRequest,
): Promise<void> {
  const { end, rangeMode, health, timezone, signal, memory } = request;
  const refreshDay = request.refreshDay ?? refreshActiveDay;
  const key = `${health}:${timezone}:${rangeMode}`;
  const earliest = shiftISODate(end, -MAX_RANGE_WALK_DAYS);
  const start = rangeMode && request.start < earliest ? earliest : request.start;
  const lastHistoryDay = shiftISODate(end, -1);
  const completeSignature = async () =>
    `${key}:${await activeRangeRevision(start, end)}`;

  if (memory.complete === (await completeSignature())) return;
  if (signal.aborted) return;

  const endIsCurrent =
    memory.end?.key === key &&
    memory.end.date === end &&
    memory.end.signature === (await activeRangeRevision(end, end));
  // The days already walked for this end, if nothing in them has changed.
  const walked =
    memory.history?.key === key &&
    memory.history.end === end &&
    memory.history.signature ===
      (await activeRangeRevision(memory.history.start, lastHistoryDay))
      ? memory.history
      : null;
  if (signal.aborted) return;
  // A range that grew walks the days it added; one that shrank walks none.
  const walkFrom = walked ? shiftISODate(walked.start, -1) : lastHistoryDay;
  const walks =
    (rangeMode || RELEASE_FLAGS.walkingEquivalent) && walkFrom >= start;

  if (!endIsCurrent || walks) request.onUpdating();
  if (!endIsCurrent) {
    await refreshDay(end, signal, health);
    if (signal.aborted) return;
    await request.refreshToday();
  }
  if (walks) {
    const candidates = rangeMode
      ? null
      : await calibrationDates(start, walkFrom);
    let refreshed = 0;
    for (let day = walkFrom; day >= start; day = shiftISODate(day, -1)) {
      if (signal.aborted) return;
      if (candidates && !candidates.has(day)) continue;
      await refreshDay(day, signal, health);
      refreshed++;
    }
    if (signal.aborted) return;
    // The last day's walking calibration reads the days before it. Rebuild
    // it, and re-read today only if that changed what is stored.
    if (refreshed && (await rebuildChanged(end, signal)) && !signal.aborted)
      await request.refreshToday();
  }
  if (signal.aborted) return;
  const historyStart = walked && walked.start < start ? walked.start : start;
  memory.end = {
    key,
    date: end,
    signature: await activeRangeRevision(end, end),
  };
  memory.history = {
    key,
    start: historyStart,
    end,
    signature: await activeRangeRevision(historyStart, lastHistoryDay),
  };
  memory.complete = await completeSignature();
}

/** Rebuild a day's aggregate and say whether its stored values changed. */
function rebuildChanged(date: string, signal: AbortSignal): Promise<boolean> {
  return enqueueDatabaseOperation(async () => {
    if (signal.aborted) return false;
    const db = await getLocalDatabase();
    const read = async () =>
      JSON.stringify(
        await db.getFirstAsync(
          "SELECT active_minutes,active_summary FROM daily_aggregates WHERE date=?",
          date,
        ),
      );
    const before = await read();
    await rebuildAggregateForDate(db, date);
    return (await read()) !== before;
  });
}

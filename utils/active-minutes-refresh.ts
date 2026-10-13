import { RELEASE_FLAGS } from "@/constants/release-flags";
import { refreshActiveDay } from "@/utils/active-background";
import {
  activeEvidenceRevision,
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

// Passes a request makes while records keep arriving under it.
const MAX_PASSES = 2;

/**
 * Bring active minutes up to date for `start` to `end`. A request repeats work
 * only for what changed: the last day when its own records moved, earlier days
 * when theirs did, and for a range that grew, just the days it added.
 *
 * What a pass did is only remembered if no records arrived while it ran: a
 * day it had already finished may predate them. It then goes round once more,
 * and if records are still arriving it remembers nothing, so the next request
 * does the work again.
 */
export async function refreshActiveMinutes(
  request: ActiveRefreshRequest,
): Promise<void> {
  for (let pass = 0; pass < MAX_PASSES; pass++)
    if (await refreshPass(request)) return;
}

/** One pass. False when records arrived during it, so nothing was remembered. */
async function refreshPass(request: ActiveRefreshRequest): Promise<boolean> {
  const { end, rangeMode, health, timezone, signal, memory } = request;
  const refreshDay = request.refreshDay ?? refreshActiveDay;
  const key = `${health}:${timezone}:${rangeMode}`;
  const earliest = shiftISODate(end, -MAX_RANGE_WALK_DAYS);
  const start = rangeMode && request.start < earliest ? earliest : request.start;
  const lastHistoryDay = shiftISODate(end, -1);
  const completeSignature = async () =>
    `${key}:${await activeRangeRevision(start, end)}`;

  if (memory.complete === (await completeSignature())) return true;
  if (signal.aborted) return true;
  // The walk writes timing profiles, which move the full revision. The
  // records' own revision moves only if something else wrote meanwhile.
  const evidence = await activeEvidenceRevision(start, end);

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
  if (signal.aborted) return true;
  // A range that grew walks the days it added; one that shrank walks none.
  const walkFrom = walked ? shiftISODate(walked.start, -1) : lastHistoryDay;
  const walks =
    (rangeMode || RELEASE_FLAGS.walkingEquivalent) && walkFrom >= start;

  if (!endIsCurrent || walks) request.onUpdating();
  if (!endIsCurrent) {
    await refreshDay(end, signal, health);
    if (signal.aborted) return true;
    await request.refreshToday();
  }
  if (walks) {
    const candidates = rangeMode
      ? null
      : await calibrationDates(start, walkFrom);
    let refreshed = 0;
    for (let day = walkFrom; day >= start; day = shiftISODate(day, -1)) {
      if (signal.aborted) return true;
      if (candidates && !candidates.has(day)) continue;
      await refreshDay(day, signal, health);
      refreshed++;
    }
    if (signal.aborted) return true;
    // The last day's walking calibration reads the days before it. Rebuild
    // it, and re-read today only if that changed what is stored.
    if (refreshed && (await rebuildChanged(end, signal)) && !signal.aborted)
      await request.refreshToday();
  }
  if (signal.aborted) return true;
  const historyStart = walked && walked.start < start ? walked.start : start;
  const done: Pick<ActiveRefreshMemory, "complete" | "end" | "history"> = {
    end: {
      key,
      date: end,
      signature: await activeRangeRevision(end, end),
    },
    history: {
      key,
      start: historyStart,
      end,
      signature: await activeRangeRevision(historyStart, lastHistoryDay),
    },
    complete: await completeSignature(),
  };
  // Checked last, after the signatures were taken: records that arrived any
  // earlier may be in those signatures without being in the work.
  if ((await activeEvidenceRevision(start, end)) !== evidence) return false;
  Object.assign(memory, done);
  return true;
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

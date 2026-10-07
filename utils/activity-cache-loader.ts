import type { ActivityCacheDay } from "@/utils/activity-cache-manifest";
import { decodeActivityHourSamples } from "@/utils/activity-hour-samples";
import {
  buildActivityScoreMaxima,
  mergeActivityScoreMaxima,
  type ActivityScoreInput,
} from "@/utils/activity-intensity";
import { createCooperativeYield } from "@/utils/cooperative-work";
import type { ActivityScoreMaxima } from "@/types/zentra";

export interface ActivityHistory {
  /** False while any day in the window is still stale or not yet scored. */
  complete: boolean;
  /** False while a day the pattern draws is still stale or not yet scored. */
  visibleComplete: boolean;
  maxima: ActivityScoreMaxima;
  /** Hourly score inputs for each stored day from `samplesFrom` onward. */
  samplesByDate: Map<string, ActivityScoreInput[]>;
  /** Days from `samplesFrom` onward with nothing stored yet, not even a stale value. */
  pendingDates: Set<string>;
}

/** Where stored days come from and go to; the device binding is in activity-cache.ts. */
export interface ActivityCacheStore {
  /** Throws once the repository this load began under has been wiped. */
  assertActive(): void;
  firstDate(): Promise<string | null>;
  manifest(
    first: string,
    last: string,
    samplesFrom: string,
  ): Promise<ActivityCacheDay[]>;
  /** Score one day from its events; `samples` is encoded and null unless asked for. */
  scoreDay(
    date: string,
    withSamples: boolean,
    signal: AbortSignal,
  ): Promise<{ maxima: ActivityScoreMaxima; samples: string | null }>;
  saveDay(
    day: ActivityCacheDay,
    maxima: ActivityScoreMaxima,
    samples: string | null,
  ): Promise<void>;
}

// A grid day lands every few hundred ms on a phone; older days only move the scale.
const VISIBLE_PROGRESS_INTERVAL_MS = 300;
const OLDER_PROGRESS_INTERVAL_MS = 5_000;

export function emptyActivityHistory(): ActivityHistory {
  return {
    complete: true,
    visibleComplete: true,
    maxima: buildActivityScoreMaxima([]),
    samplesByDate: new Map(),
    pendingDates: new Set(),
  };
}

/**
 * Normalization maxima for [start, end] plus hourly score inputs for the days
 * the Today pattern draws, from per-day stored values.
 *
 * Whatever is stored is reported first, stale or not, so the pattern can paint
 * after one read. Only days whose revision moved are then scored again from
 * their events: the drawn days first, newest first, then the rest of the
 * window. Progress is reported as days land, and every scored day is saved
 * before the next begins, so an interrupted load resumes where it stopped.
 *
 * A day is filed under the revision the manifest read before its events. A
 * write that lands while it is being scored therefore leaves it behind its
 * revision, and the next load scores it again; nothing here needs restarting
 * when data changes.
 */
export async function loadActivityHistoryFrom(
  store: ActivityCacheStore,
  start: string,
  end: string,
  samplesFrom: string,
  signal: AbortSignal,
  onProgress?: (history: ActivityHistory) => void,
): Promise<ActivityHistory> {
  const firstDate = await store.firstDate();
  if (!firstDate) return emptyActivityHistory();
  const first = start < firstDate ? firstDate : start;
  if (first > end) return emptyActivityHistory();

  const manifest = await store.manifest(first, end, samplesFrom);
  // A warm year is ~365 small parses: slice them rather than block the thread.
  const yieldIfSliceSpent = createCooperativeYield();
  const maximaByDate = new Map<string, ActivityScoreMaxima>();
  const samplesByDate = new Map<string, ActivityScoreInput[]>();
  const pendingDates = new Set<string>();
  const visibleTodo: ActivityCacheDay[] = [];
  const olderTodo: ActivityCacheDay[] = [];

  for (const day of manifest) {
    const visible = Boolean(day.samplesKey);
    const maxima = day.payload ?? day.stalePayload;
    const samples = day.samples ?? day.staleSamples;
    if (maxima) maximaByDate.set(day.date, JSON.parse(maxima));
    if (visible) {
      if (samples)
        samplesByDate.set(day.date, decodeActivityHourSamples(samples));
      else pendingDates.add(day.date);
    }
    if (!day.payload || (visible && !day.samples))
      (visible ? visibleTodo : olderTodo).push(day);
    await yieldIfSliceSpent();
  }

  let visibleRemaining = visibleTodo.length;
  let remaining = visibleTodo.length + olderTodo.length;
  const report = (): ActivityHistory => {
    let maxima = buildActivityScoreMaxima([]);
    for (const dayMaxima of maximaByDate.values())
      maxima = mergeActivityScoreMaxima(maxima, dayMaxima);
    return {
      complete: remaining === 0,
      visibleComplete: visibleRemaining === 0,
      maxima,
      // Copies: the caller keeps a report while later days are still landing.
      samplesByDate: new Map(samplesByDate),
      pendingDates: new Set(pendingDates),
    };
  };
  if (!remaining) return report();

  onProgress?.(report());
  let reportedAt = Date.now();
  // Newest first: the days nearest today are what the user is looking at.
  for (const day of [...visibleTodo.reverse(), ...olderTodo.reverse()]) {
    store.assertActive();
    if (signal.aborted) throw new Error("Work cancelled");
    const visible = Boolean(day.samplesKey);
    const scored = await store.scoreDay(day.date, visible, signal);
    await store.saveDay(day, scored.maxima, scored.samples);
    maximaByDate.set(day.date, scored.maxima);
    if (visible) {
      samplesByDate.set(
        day.date,
        scored.samples ? decodeActivityHourSamples(scored.samples) : [],
      );
      pendingDates.delete(day.date);
      visibleRemaining--;
    }
    remaining--;

    const interval = visible
      ? VISIBLE_PROGRESS_INTERVAL_MS
      : OLDER_PROGRESS_INTERVAL_MS;
    if (
      onProgress &&
      remaining > 0 &&
      ((visible && visibleRemaining === 0) ||
        Date.now() - reportedAt >= interval)
    ) {
      onProgress(report());
      reportedAt = Date.now();
    }
    await yieldIfSliceSpent();
  }
  return report();
}

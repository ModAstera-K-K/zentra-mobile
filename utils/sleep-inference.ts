import type { ZentraEventRecord } from "@/types/zentra";
import { activityRestEvidence } from "@/utils/rest-activity-evidence";
import { normalizeRestEventsWork } from "@/utils/rest-normalization";
import { screenRestEvidence } from "@/utils/rest-screen-evidence";
import { restConflictEvidence } from "@/utils/rest-conflict-evidence";
import { restTravelEvidence } from "@/utils/rest-context";
import { chooseRestCandidate, resolveRestIntervals } from "@/utils/rest-intervals";
import { createRestEvent } from "@/utils/rest-event";
import { overnightRestWindow, restWakeDates } from "@/utils/rest-window";
import { runCooperatively } from "@/utils/cooperative-work";
import type { RestInterval } from "@/types/rest-inference";
import { toISODate } from "@/utils/dates";
import { observedRestBoundaries } from "@/utils/rest-boundaries";

export function* inferSleepEventsWork(events: ZentraEventRecord[], endDate: string, now = new Date(), gaps: RestInterval[] = []): Generator<void, ZentraEventRecord[]> {
  const normalized = yield* normalizeRestEventsWork(events, now.getTime());
  const evidence = activityRestEvidence(normalized, now.getTime());
  yield;
  evidence.push(...screenRestEvidence(normalized));
  yield;
  const conflicts = restConflictEvidence(normalized);
  evidence.push(...conflicts);
  yield;
  const travel = restTravelEvidence(normalized);
  evidence.push(...travel, ...gaps);
  yield;
  const boundaries = observedRestBoundaries(normalized, [...conflicts, ...travel]);
  const result: ZentraEventRecord[] = [];
  for (const date of restWakeDates(endDate)) {
    const window = overnightRestWindow(date, now);
    const candidate = chooseRestCandidate(resolveRestIntervals(evidence, window), (c) =>
      toISODate(new Date(c.end)) === date
      && boundaries.has(c.start) && boundaries.has(c.end));
    if (candidate) result.push(createRestEvent(candidate, normalized, date, now));
    yield;
  }
  return result;
}

export function inferSleepEvents(events: ZentraEventRecord[], endDate: string, now = new Date()): ZentraEventRecord[] {
  const work = inferSleepEventsWork(events, endDate, now);
  let next = work.next();
  while (!next.done) next = work.next();
  return next.value;
}

export function inferSleepEventsAsync(events: ZentraEventRecord[], endDate: string, now = new Date(), gaps: RestInterval[] = []) {
  return runCooperatively(inferSleepEventsWork(events, endDate, now, gaps));
}

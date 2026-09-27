import { prepareActivityEvidence } from "@/utils/activity-evidence";
import { activityStream, activityTransitionKey } from "@/utils/activity-stream";
import type {
  ActiveInterval,
  ActiveMinutesSummary,
} from "@/types/active-minutes";
import type { ZentraEventRecord } from "@/types/zentra";
import { parseISODate, shiftISODate } from "@/utils/dates";
import {
  activityInterval,
  attributeIntervals,
  MINUTE_MS,
  physicalKind,
  roundedContributions,
  workoutIntervals,
} from "@/utils/active-intervals";
import {
  collectTimedSteps,
  qualifyingWalkingBouts,
} from "@/utils/active-step-evidence";
import { runCooperatively } from "@/utils/cooperative-work";

export function* resolveActiveMinutesWork(
  date: string,
  input: ZentraEventRecord[],
  revision = "0",
): Generator<void, ActiveMinutesSummary> {
  const start = parseISODate(date).getTime(),
    end = parseISODate(shiftISODate(date, 1)).getTime();
  const events = yield* prepareActivityEvidence(
    input,
    end,
    parseISODate(shiftISODate(date, 2)).getTime(),
  );
  const reasons = new Set<string>([
    "Timing coverage is limited; this is not your complete day.",
  ]);
  const intervals: ActiveInterval[] = [];
  const opened = new Map<string, ZentraEventRecord>();
  const seenTransitions = new Set<string>();
  for (const event of events) {
    const time = Date.parse(event.timestampStart),
      finish = Date.parse(event.timestampEnd);
    intervals.push(...workoutIntervals(event));
    if (event.dataType === "activity") {
      const identity = activityTransitionKey(event);
      if (seenTransitions.has(identity)) {
        yield;
        continue;
      }
      seenTransitions.add(identity);
      const kind = physicalKind(event.valueText);
      const key = `${activityStream(event)}:${event.valueText}`;
      if (event.metadata.transition === "enter" && kind) {
        if (!opened.has(key)) opened.set(key, event);
      } else if (event.metadata.transition === "exit" && kind) {
        const first = opened.get(key);
        if (
          first &&
          Number(first.metadata.confidence ?? first.confidence) >= 0.65
        ) {
          const interval = activityInterval(
            first,
            Date.parse(first.timestampStart),
            time,
            kind,
            1,
          );
          interval.recordIds.push(event.id);
          intervals.push(interval);
        } else if (time >= start)
          reasons.add("An activity exit has no reliable matching start.");
        opened.delete(key);
      } else if (event.metadata.transition === "enter" && !kind) {
        for (const [openKey, first] of opened) {
          if (activityStream(first) !== activityStream(event)) continue;
          if (Number(first.metadata.confidence ?? first.confidence) >= 0.65)
            intervals.push(
              activityInterval(
                first,
                Date.parse(first.timestampStart),
                time,
                physicalKind(first.valueText)!,
                1,
              ),
            );
          opened.delete(openKey);
        }
      } else if (
        kind &&
        !event.metadata.transition &&
        finish > time &&
        event.confidence >= 0.65
      ) {
        intervals.push(activityInterval(event, time, finish, kind, 1));
      }
    }
    yield;
  }
  const steps = yield* collectTimedSteps(events, reasons);
  intervals.push(...steps.intervals);
  for (const first of opened.values()) {
    reasons.add(
      "An activity start has no matching end; unsupported elapsed time is excluded.",
    );
    let finish = Date.parse(first.timestampStart);
    for (const evidence of [...steps.intervals].sort(
      (a, b) => a.start - b.start,
    )) {
      if (evidence.end <= finish) continue;
      if (evidence.start > finish) break;
      finish = evidence.end;
      yield;
    }
    if (finish > Date.parse(first.timestampStart))
      intervals.push(
        activityInterval(
          first,
          Date.parse(first.timestampStart),
          finish,
          physicalKind(first.valueText)!,
          1,
          1,
          true,
        ),
      );
  }
  // Motion alone cannot establish bodily activity. Only corroborated windows participate.
  for (const event of events) {
    if (
      event.dataType !== "motion_context" ||
      !["moderate_movement", "burst_activity"].includes(event.valueText ?? "")
    )
      continue;
    const finish = Date.parse(event.timestampEnd),
      begin = Date.parse(event.timestampStart);
    if (finish <= begin || finish - begin > MINUTE_MS) continue;
    const corroboratingStep = events.find(
      (candidate) =>
        candidate.dataType === "steps" &&
        candidate.source === "sensor" &&
        candidate.metadata.step_timing_verified === true &&
        Number(candidate.metadata.step_delta) > 0 &&
        Date.parse(candidate.timestampStart) >= begin &&
        Date.parse(candidate.timestampStart) <= finish,
    );
    if (corroboratingStep) {
      const interval = activityInterval(
        event,
        begin,
        finish,
        "motion",
        3,
        1,
        true,
      );
      interval.recordIds.push(corroboratingStep.id);
      intervals.push(interval);
    }
    for (const evidence of steps.intervals) {
      const a = Math.max(begin, evidence.start),
        b = Math.min(finish, evidence.end);
      if (b > a)
        intervals.push(activityInterval(event, a, b, "motion", 3, 1, true));
      yield;
    }
  }
  const clipped = intervals
    .filter((i) => i.end > start && i.start < end)
    .map((i) => ({
      ...i,
      start: Math.max(start, i.start),
      end: Math.min(end, i.end),
    }));
  if (clipped.some((i) => i.estimated))
    reasons.add(
      "Step-minute occupancy and allocated workout time are estimates.",
    );
  const totals = yield* attributeIntervals(clipped, start, end);
  const contributions = roundedContributions(totals);
  const walkingBouts = yield* qualifyingWalkingBouts(
    date,
    clipped,
    steps.samples,
  );
  const recordIds = [...new Set(clipped.flatMap((i) => i.recordIds))];
  const ids = new Set(recordIds);
  return {
    date,
    supportedMinutes: clipped.length
      ? contributions.reduce((n, p) => n + p.minutes, 0)
      : null,
    quality: clipped.length ? "partial" : "missing",
    contributions,
    coverageReasons: [...reasons],
    sources: [...new Set(clipped.map((i) => i.source))],
    recordIds,
    updatedAt: events
      .filter((e) => ids.has(e.id))
      .reduce<
        string | null
      >((latest, e) => (!latest || e.createdAt > latest ? e.createdAt : latest), null),
    revision,
    calculationVersion: 3,
    walkingEquivalent: null,
    walkingBouts,
  };
}
export function resolveActiveMinutes(
  date: string,
  events: ZentraEventRecord[],
  revision = "0",
): ActiveMinutesSummary {
  const work = resolveActiveMinutesWork(date, events, revision);
  let result = work.next();
  while (!result.done) result = work.next();
  return result.value;
}
export function resolveActiveMinutesAsync(
  date: string,
  events: ZentraEventRecord[],
  revision = "0",
  signal?: AbortSignal,
) {
  return runCooperatively(
    resolveActiveMinutesWork(date, events, revision),
    signal,
  );
}

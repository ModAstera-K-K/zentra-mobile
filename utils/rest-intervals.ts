import type { RestCandidate, RestInterval, RestWindow } from "@/types/rest-inference";
import { REST_MINUTE } from "@/utils/rest-window";

/** Sweep exact endpoints: contradictory activity wins, then explicit unknowns. */
export function resolveRestIntervals(input: RestInterval[], window: RestWindow): RestInterval[] {
  const changes = new Map<number, { add: number[]; remove: number[] }>();
  for (const [index, interval] of input.entries()) {
    const start = Math.max(interval.start, window.start), end = Math.min(interval.end, window.end);
    if (end <= start) continue;
    for (const [time, add] of [[start, true], [end, false]] as const) {
      const change = changes.get(time) ?? { add: [], remove: [] };
      (add ? change.add : change.remove).push(index);
      changes.set(time, change);
    }
  }
  const times = [...new Set([window.start, window.end, ...changes.keys()])].sort((a, b) => a - b);
  const active = new Set<number>();
  const result: RestInterval[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    const change = changes.get(times[i]);
    change?.remove.forEach((id) => active.delete(id));
    change?.add.forEach((id) => active.add(id));
    const evidence = [...active].map((id) => input[id]);
    const kind = evidence.some((e) => e.kind === "active") ? "active"
      : evidence.some((e) => e.kind === "unknown") ? "unknown"
        : evidence.length ? "rest" : "unknown";
    result.push({ start: times[i], end: times[i + 1], kind,
      signals: [...new Set(evidence.filter((e) => e.kind === kind).flatMap((e) => e.signals))],
      recordIds: [...new Set(evidence.flatMap((e) => e.recordIds))] });
  }
  return result;
}

export function restCandidate(intervals: RestInterval[]): RestCandidate | null {
  if (!intervals.length) return null;
  const minutes = (kind: RestInterval["kind"]) => intervals.filter((i) => i.kind === kind)
    .reduce((sum, i) => sum + (i.end - i.start) / REST_MINUTE, 0);
  const start = intervals[0].start, end = intervals.at(-1)!.end;
  const duration = (end - start) / REST_MINUTE;
  const unknownMinutes = minutes("unknown"), supportedMinutes = minutes("rest");
  const coverage = 1 - unknownMinutes / duration;
  return duration >= 180 && duration <= 720 && supportedMinutes >= 180 && coverage >= 0.8
    ? { start, end, supportedMinutes, interruptionMinutes: minutes("active"), unknownMinutes, coverage, intervals }
    : null;
}

/** Gaps may connect a window, but never contribute to supported rest duration. */
export function chooseRestCandidate(intervals: RestInterval[], eligible: (candidate: RestCandidate) => boolean = () => true): RestCandidate | null {
  const candidates: RestCandidate[] = [];
  let group: RestInterval[] = [], pending: RestInterval[] = [];
  for (const interval of intervals) {
    if (interval.kind !== "rest") { pending.push(interval); continue; }
    const activeGap = pending.filter((i) => i.kind === "active").reduce((n, i) => n + i.end - i.start, 0);
    const unknownGap = pending.filter((i) => i.kind === "unknown").reduce((n, i) => n + i.end - i.start, 0);
    if (activeGap > 15 * REST_MINUTE || unknownGap > 10 * REST_MINUTE) {
      const candidate = restCandidate(group);
      if (candidate) candidates.push(candidate);
      group = [];
    }
    if (group.length) group.push(...pending);
    group.push(interval);
    pending = [];
  }
  const last = restCandidate(group);
  if (last) candidates.push(last);
  return candidates.filter(eligible).sort((a, b) => b.supportedMinutes - a.supportedMinutes || b.coverage - a.coverage || a.start - b.start)[0] ?? null;
}

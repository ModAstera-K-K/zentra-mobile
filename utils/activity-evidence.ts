import type { ZentraEventRecord } from "@/types/zentra";
import { legacyActivityStream } from "@/utils/activity-stream";

interface TimedEvidence {
  event: ZentraEventRecord;
  time: number;
}

function compareEvidence(a: TimedEvidence, b: TimedEvidence): number {
  return (
    a.time - b.time ||
    Number(a.event.metadata.transition !== "exit") -
      Number(b.event.metadata.transition !== "exit") ||
    Number(
      b.event.metadata.activity_history === true ||
        b.event.metadata.activity_delivery === "history",
    ) -
      Number(
        a.event.metadata.activity_history === true ||
          a.event.metadata.activity_delivery === "history",
      ) ||
    a.event.id.localeCompare(b.event.id)
  );
}

function* mergeEvidence(
  left: TimedEvidence[],
  right: TimedEvidence[],
): Generator<void, TimedEvidence[]> {
  const result: TimedEvidence[] = [];
  let a = 0,
    b = 0;
  while (a < left.length || b < right.length) {
    result.push(
      b === right.length ||
        (a < left.length && compareEvidence(left[a], right[b]) <= 0)
        ? left[a++]
        : right[b++],
    );
    yield;
  }
  return result;
}

/** Bound each native Array.sort, and yield during normalization and merging. */
export function* prepareActivityEvidence(
  input: ZentraEventRecord[],
  end: number,
  contextEnd: number,
): Generator<void, ZentraEventRecord[]> {
  const known = new Set<string>(),
    selected: TimedEvidence[] = [];
  for (const event of input) {
    const time = Date.parse(event.timestampStart);
    if (
      ["activity", "exercise_session", "steps", "motion_context"].includes(
        event.dataType,
      ) &&
      event.metadata.stale_import !== true &&
      time < (event.dataType === "activity" ? contextEnd : end)
    ) {
      selected.push({ event, time });
      if (
        event.dataType === "activity" &&
        typeof event.metadata.activity_stream === "string"
      )
        known.add(event.metadata.activity_stream);
    }
    yield;
  }
  const stream = known.size === 1 ? [...known][0] : null;
  let runs: TimedEvidence[][] = [];
  for (let i = 0; i < selected.length; i += 128) {
    runs.push(selected.slice(i, i + 128).sort(compareEvidence));
    yield;
  }
  while (runs.length > 1) {
    const next: TimedEvidence[][] = [];
    for (let i = 0; i < runs.length; i += 2)
      next.push(
        runs[i + 1] ? yield* mergeEvidence(runs[i], runs[i + 1]) : runs[i],
      );
    runs = next;
  }
  const result: ZentraEventRecord[] = [];
  for (const { event } of runs[0] ?? []) {
    result.push(legacyActivityStream(event, stream));
    yield;
  }
  return result;
}

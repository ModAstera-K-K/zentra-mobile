import type { ZentraEventRecord } from "@/types/zentra";
import { activityTransitionKey, legacyActivityStream } from "@/utils/activity-stream";

function compareRestEvents(a: ZentraEventRecord, b: ZentraEventRecord): number {
  return Date.parse(a.timestampStart) - Date.parse(b.timestampStart)
    || Number(a.metadata.transition !== "exit") - Number(b.metadata.transition !== "exit")
    || a.confidence - b.confidence || a.id.localeCompare(b.id);
}

function* mergeRestRuns(left: ZentraEventRecord[], right: ZentraEventRecord[]): Generator<void, ZentraEventRecord[]> {
  const result: ZentraEventRecord[] = [];
  let a = 0, b = 0;
  while (a < left.length || b < right.length) {
    result.push(b === right.length || (a < left.length && compareRestEvents(left[a], right[b]) <= 0) ? left[a++] : right[b++]);
    yield;
  }
  return result;
}

/** Bound sorting and deduplication steps, following the existing activity evidence workflow. */
export function* normalizeRestEventsWork(events: ZentraEventRecord[], now: number): Generator<void, ZentraEventRecord[]> {
  const selected: ZentraEventRecord[] = [], streams = new Set<string>();
  for (const event of events) {
    const start = Date.parse(event.timestampStart), end = Date.parse(event.timestampEnd);
    if (event.metadata.stale_import !== true && Number.isFinite(start) && end >= start && start <= now && end <= now
      && !["sleep_inferred", "heart_rate", "distance", "ambient_light", "connectivity_state"].includes(event.dataType)) {
      selected.push(event);
      if (event.dataType === "activity" && typeof event.metadata.activity_stream === "string") streams.add(event.metadata.activity_stream);
    }
    yield;
  }
  let runs: ZentraEventRecord[][] = [];
  for (let offset = 0; offset < selected.length; offset += 128) {
    runs.push(selected.slice(offset, offset + 128).sort(compareRestEvents));
    yield;
  }
  while (runs.length > 1) {
    const next: ZentraEventRecord[][] = [];
    for (let i = 0; i < runs.length; i += 2) next.push(runs[i + 1] ? yield* mergeRestRuns(runs[i], runs[i + 1]) : runs[i]);
    runs = next;
  }
  const stream = streams.size === 1 ? [...streams][0] : null, seen = new Set<string>(), result: ZentraEventRecord[] = [];
  for (const input of runs[0] ?? []) {
    const event = legacyActivityStream(input, stream);
    const key = event.dataType === "activity" ? activityTransitionKey(event) : event.id;
    if (!seen.has(key)) { seen.add(key); result.push(event); }
    yield;
  }
  return result;
}

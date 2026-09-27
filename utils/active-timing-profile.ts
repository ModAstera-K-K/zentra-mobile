import type { ZentraEventRecord } from "@/types/zentra";
import type { NativeHealthConnectRecord } from "@/utils/native/zentra-native-signals";
import { MINUTE_MS } from "@/utils/active-intervals";
import { runCooperatively } from "@/utils/cooperative-work";

/** Bucket raw evidence once; coarse samples invalidate timing rather than being spread as activity. */
function* profileWork(
  records: NativeHealthConnectRecord[],
  raw: ZentraEventRecord[],
): Generator<void, ZentraEventRecord[]> {
  if (!records.length) return [];
  let first = Infinity,
    last = -Infinity;
  for (const record of records) {
    first = Math.min(first, Date.parse(record.startTime));
    last = Math.max(last, Date.parse(record.endTime));
    yield;
  }
  const bins = new Map<number, { ids: string[]; coarse: boolean }>();
  for (const event of raw) {
    if (
      event.dataType !== "steps" ||
      event.source !== "health_connect" ||
      event.metadata.platform_aggregate === true ||
      event.metadata.stale_import === true
    )
      continue;
    const a = Date.parse(event.timestampStart),
      b = Date.parse(event.timestampEnd);
    if (b <= a) continue;
    for (
      let bin = Math.floor(Math.max(first, a) / MINUTE_MS);
      bin * MINUTE_MS < Math.min(last, b);
      bin++
    ) {
      const value = bins.get(bin) ?? { ids: [], coarse: false };
      value.ids.push(event.id);
      value.coarse ||= b - a > MINUTE_MS;
      bins.set(bin, value);
      yield;
    }
  }
  const events: ZentraEventRecord[] = [];
  for (const record of records) {
    const supporting = bins.get(
      Math.floor(Date.parse(record.startTime) / MINUTE_MS),
    );
    if (supporting && !supporting.coarse)
      events.push({
        id: `timing-${record.id}`,
        timestampStart: record.startTime,
        timestampEnd: record.endTime,
        dataType: "steps",
        source: "health_connect",
        valueNumeric: record.valueNumeric ?? undefined,
        unit: "count",
        confidence: 1,
        schemaVersion: 1,
        createdAt: record.endTime,
        metadata: {
          ...record.metadata,
          platform_aggregate: true,
          timing_verified: true,
          supporting_record_ids: JSON.stringify(supporting.ids),
        },
      });
    yield;
  }
  return events;
}
export function timingProfileEvents(
  records: NativeHealthConnectRecord[],
  raw: ZentraEventRecord[],
): ZentraEventRecord[] {
  const work = profileWork(records, raw);
  let result = work.next();
  while (!result.done) result = work.next();
  return result.value;
}
export function timingProfileEventsAsync(
  records: NativeHealthConnectRecord[],
  raw: ZentraEventRecord[],
  signal: AbortSignal,
) {
  return runCooperatively(profileWork(records, raw), signal);
}

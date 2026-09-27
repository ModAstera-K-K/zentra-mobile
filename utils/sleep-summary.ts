import type { ZentraEventRecord } from "@/types/zentra";
import { sleepEventsForWakeDate } from "@/utils/sleep-wake-date";
import {
  resolvedSleepMinutes,
  sourceIdentity,
} from "@/utils/source-resolution";

export function sleepSummaryEvent(
  events: ZentraEventRecord[],
  wakeDate: string,
): ZentraEventRecord | null {
  const candidates = sleepEventsForWakeDate(events, wakeDate);
  const imported = candidates.filter((e) => e.source === "health_connect");
  const origin = [...new Set(imported.map(sourceIdentity))].sort()[0];
  const selected = (
    imported.length
      ? imported.filter((e) => sourceIdentity(e) === origin)
      : candidates.filter((e) => e.source === "inferred")
  ).sort((a, b) => a.timestampStart.localeCompare(b.timestampStart));
  if (!selected.length) return null;
  return {
    ...selected[0],
    timestampEnd: selected.reduce(
      (end, e) => (e.timestampEnd > end ? e.timestampEnd : end),
      selected[0].timestampEnd,
    ),
    valueNumeric: resolvedSleepMinutes(selected, wakeDate) ?? undefined,
    metadata: {
      ...selected[0].metadata,
      sleep_estimated: selected.some(
        (e) => e.metadata.sleep_estimated === true,
      ),
    },
  };
}

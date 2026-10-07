import type { ZentraEventRecord } from "@/types/zentra";
import { selectSleepForWakeDate } from "@/utils/sleep-selection";
import {
  resolvedSleepMinutes,
} from "@/utils/source-resolution";
import { compareTimestamps } from "@/utils/dates";

export function sleepSummaryEvent(
  events: ZentraEventRecord[],
  wakeDate: string,
): ZentraEventRecord | null {
  const selected = selectSleepForWakeDate(events, wakeDate).sort((a, b) => compareTimestamps(a.timestampStart, b.timestampStart));
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

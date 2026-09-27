import { useEffect, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { useRepositoryStore } from "@/stores";
import { getEventsForRange } from "@/utils/event-repository";
import { toISODate, shiftISODate } from "@/utils/dates";
import { sleepSummaryEvent } from "@/utils/sleep-summary";
import { buildLiveSleepEstimate } from "@/utils/device-signals";

export function useSleepSummary(enabled: boolean) {
  const focused = useIsFocused(),
    revision = useRepositoryStore((s) => s.todayDataUpdatedAt);
  const [summary, setSummary] = useState(() => buildLiveSleepEstimate(null));
  const today = toISODate(new Date());
  useEffect(() => {
    if (!enabled || !focused) return;
    let cancelled = false;
    void getEventsForRange(shiftISODate(today, -1), today)
      .then((events) => {
        if (!cancelled)
          setSummary(buildLiveSleepEstimate(sleepSummaryEvent(events, today)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, focused, revision, today]);
  return summary;
}

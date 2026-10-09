import { useEffect, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { useRepositoryStore } from "@/stores";
import { getEventsForRange } from "@/utils/event-repository";
import { shiftISODate } from "@/utils/dates";
import { sleepSummaryEvent } from "@/utils/sleep-summary";
import { buildLiveSleepEstimate } from "@/utils/device-signals";

export function useSleepSummary(enabled: boolean) {
  const focused = useIsFocused(),
    revision = useRepositoryStore((s) => s.todayDataUpdatedAt);
  const [summary, setSummary] = useState(() => buildLiveSleepEstimate(null));
  const today = useRepositoryStore((s) => s.todayDate);
  useEffect(() => {
    if (!enabled || !focused) return;
    let cancelled = false;
    void getEventsForRange(shiftISODate(today, -1), today)
      .then((events) => {
        if (!cancelled)
          setSummary(buildLiveSleepEstimate(sleepSummaryEvent(events, today)));
      })
      .catch(() => {
        if (!cancelled) setSummary({ ...buildLiveSleepEstimate(null), qualityLabel: "Records unavailable", detail: "Could not read this night's records. Reopen this screen to retry." });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, focused, revision, today]);
  return summary;
}

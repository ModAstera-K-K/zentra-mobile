import { useEffect, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { useRepositoryStore } from "@/stores";
import { shallow } from "zustand/shallow";
import { loadSleepSummaryEvent } from "@/utils/rest-repository";
import { buildLiveSleepEstimate } from "@/utils/device-signals";

export function useSleepSummary(enabled: boolean) {
  const focused = useIsFocused(),
    revision = useRepositoryStore((s) => s.todayDataUpdatedAt);
  const [summary, setSummary] = useState(() => buildLiveSleepEstimate(null));
  const today = useRepositoryStore((s) => s.todayDate);
  useEffect(() => {
    if (!enabled || !focused) return;
    let cancelled = false;
    void loadSleepSummaryEvent(today)
      .then((event) => {
        if (cancelled) return;
        const next = buildLiveSleepEstimate(event);
        // An unchanged night keeps its object, so a write elsewhere does not re-render the card.
        setSummary((previous) => (shallow(previous, next) ? previous : next));
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

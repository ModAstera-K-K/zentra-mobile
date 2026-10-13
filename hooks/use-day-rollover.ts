import { useEffect } from "react";

import { useRepositoryStore } from "@/stores";
import { startDayRollover } from "@/utils/day-rollover";

/** Moves the repository's today to the new local day when no write does. */
export function useDayRollover(): void {
  const isHydrated = useRepositoryStore((state) => state.isHydrated);
  const refreshTodayData = useRepositoryStore(
    (state) => state.refreshTodayData,
  );
  useEffect(() => {
    if (!isHydrated) return;
    return startDayRollover(() => {
      void refreshTodayData().catch(() => undefined);
    });
  }, [isHydrated, refreshTodayData]);
}

import {
  activeRangeRevision,
  calibrationDates,
} from "@/utils/active-refresh-state";
import { useEffect, useState, useRef } from "react";
import { InteractionManager } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useRepositoryStore, useAppStore } from "@/stores";
import { refreshActiveDay } from "@/utils/active-background";
import {
  enqueueDatabaseOperation,
  rebuildAggregateForDate,
} from "@/utils/event-repository";
import { getLocalDatabase } from "@/utils/local-database";
import { parseISODate, shiftISODate, toISODate } from "@/utils/dates";
import { RELEASE_FLAGS } from "@/constants/release-flags";

export function useActiveMinutesRefresh(
  enabled: boolean,
  range?: { start: string; end: string },
) {
  const focused = useIsFocused();
  const revision = useRepositoryStore((s) => s.todayDataUpdatedAt);
  const health = useAppStore((s) => s.collectors.healthConnect.enabled);
  const [state, setState] = useState<{
    updating: boolean;
    error: string | null;
  }>({ updating: false, error: null });
  const today = toISODate(new Date());
  const start = range?.start ?? shiftISODate(today, -30);
  const end = range?.end ?? today;
  const rangeMode = !!range;
  const timezone = parseISODate(today).getTimezoneOffset();
  const lastComplete = useRef<string | null>(null);
  const lastHistory = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !focused) return;
    const controller = new AbortController();
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        const signature = `${health}:${timezone}:${await activeRangeRevision(start, end)}`;
        if (controller.signal.aborted) return;
        if (lastComplete.current === signature) {
          setState({ updating: false, error: null });
          return;
        }
        setState({ updating: true, error: null });
        await refreshActiveDay(end, controller.signal, health);
        if (controller.signal.aborted) return;
        await useRepositoryStore.getState().refreshTodayData(true);
        const historySignature = `${health}:${timezone}:${await activeRangeRevision(start, shiftISODate(end, -1))}`;
        if (
          (rangeMode || RELEASE_FLAGS.walkingEquivalent) &&
          lastHistory.current !== historySignature
        ) {
          const candidates = rangeMode
            ? null
            : await calibrationDates(start, shiftISODate(end, -1));
          for (
            let day = shiftISODate(end, -1);
            day >= start;
            day = shiftISODate(day, -1)
          ) {
            if (controller.signal.aborted) return;
            if (candidates && !candidates.has(day)) continue;
            await refreshActiveDay(day, controller.signal, health);
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
          }
          if (controller.signal.aborted) return;
          await enqueueDatabaseOperation(async () => {
            if (!controller.signal.aborted)
              await rebuildAggregateForDate(await getLocalDatabase(), end);
          });
          if (!controller.signal.aborted)
            await useRepositoryStore.getState().refreshTodayData(true);
        }
        if (!controller.signal.aborted) {
          lastHistory.current = `${health}:${timezone}:${await activeRangeRevision(start, shiftISODate(end, -1))}`;
          lastComplete.current = `${health}:${timezone}:${await activeRangeRevision(start, end)}`;
          setState({ updating: false, error: null });
        }
      })().catch((error) => {
        if (!controller.signal.aborted)
          setState({
            updating: false,
            error:
              error instanceof Error ? error.message : "Activity update failed",
          });
      });
    });
    return () => {
      controller.abort();
      task.cancel();
    };
  }, [
    enabled,
    focused,
    health,
    revision,
    today,
    start,
    end,
    rangeMode,
    timezone,
  ]);
  return state;
}

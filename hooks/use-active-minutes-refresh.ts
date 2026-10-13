import { useEffect, useState, useRef } from "react";
import { afterRender } from "@/utils/cooperative-work";
import { useIsFocused } from "@react-navigation/native";
import { useRepositoryStore, useAppStore } from "@/stores";
import {
  createActiveRefreshMemory,
  refreshActiveMinutes,
} from "@/utils/active-minutes-refresh";
import { parseISODate, shiftISODate } from "@/utils/dates";

// A range is chosen by tapping through the chips; wait for the taps to stop
// before starting on one.
const RANGE_CHANGE_DELAY_MS = 150;

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
  const today = useRepositoryStore((s) => s.todayDate);
  const start = range?.start ?? shiftISODate(today, -30);
  const end = range?.end ?? today;
  const rangeMode = !!range;
  const timezone = parseISODate(today).getTimezoneOffset();
  const memory = useRef(createActiveRefreshMemory());
  useEffect(() => {
    if (!enabled || !focused) return;
    const controller = new AbortController();
    let task: { cancel: () => void } | null = null;
    const begin = () => {
      task = afterRender(() => {
        void refreshActiveMinutes({
          start,
          end,
          rangeMode,
          health,
          timezone,
          signal: controller.signal,
          memory: memory.current,
          onUpdating: () => setState({ updating: true, error: null }),
          refreshToday: () =>
            useRepositoryStore.getState().refreshTodayData(true),
        })
          .then(() => {
            if (!controller.signal.aborted)
              setState((current) =>
                current.updating || current.error
                  ? { updating: false, error: null }
                  : current,
              );
          })
          .catch((error) => {
            if (!controller.signal.aborted)
              setState({
                updating: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Activity update failed",
              });
          });
      });
    };
    const timer = rangeMode ? setTimeout(begin, RANGE_CHANGE_DELAY_MS) : null;
    if (!timer) begin();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
      task?.cancel();
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

import { AppState } from "react-native";

import { msUntilNextLocalDay } from "@/utils/dates";

/**
 * Calls `onDayMayHaveChanged` at each local midnight and whenever the app
 * returns to the foreground, where timers may not have run. Nothing else
 * tells the app the date moved on a day with no new records.
 */
export function startDayRollover(onDayMayHaveChanged: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    timer = setTimeout(() => {
      onDayMayHaveChanged();
      arm();
    }, msUntilNextLocalDay(new Date()));
  };
  arm();
  const subscription = AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    clearTimeout(timer);
    onDayMayHaveChanged();
    arm();
  });
  return () => {
    clearTimeout(timer);
    subscription.remove();
  };
}

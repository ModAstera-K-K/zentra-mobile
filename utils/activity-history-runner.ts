import {
  assertActivityHistoryGeneration,
  joinActivityHistoryJob,
} from "@/utils/activity-history-session";
import {
  getActivityHistoryState,
  saveActivityHistoryStatus,
  commitActivityHistory,
} from "@/utils/activity-history-repository";
import {
  getActivityRecognitionPermissionStatusAsync,
  readActivityHistoryPage,
} from "@/utils/native/zentra-native-signals";
import { createActivityEvent } from "@/utils/live-event-builders";
import { runActivityHistoryJob } from "@/utils/activity-history-job";

interface ActivityHistoryOptions {
  refresh: () => Promise<void>;
  isEnabled: () => boolean;
  maxPages?: number;
  budgetMs?: number;
}

export function syncActivityHistory(
  options: ActivityHistoryOptions,
): Promise<number> {
  if (!options.isEnabled()) return Promise.resolve(0);
  return joinActivityHistoryJob((generation) =>
    runActivityHistoryJob({
      load: getActivityHistoryState,
      permission: getActivityRecognitionPermissionStatusAsync,
      assertActive: () => {
        assertActivityHistoryGeneration(generation);
        if (!options.isEnabled()) throw new Error("Activity import cancelled");
      },
      save: (state) => saveActivityHistoryStatus(state, generation),
      read: (window) =>
        readActivityHistoryPage(window.start, window.end, window.cursor),
      commit: (page, state, window) =>
        commitActivityHistory(
          page.transitions.map((transition) =>
            createActivityEvent(transition, "native_buffered"),
          ),
          state,
          generation,
          { page, window },
        ),
      refresh: options.refresh,
      maxPages: options.maxPages,
      budgetMs: options.budgetMs,
    }),
  );
}

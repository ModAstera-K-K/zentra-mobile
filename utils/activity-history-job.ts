import type {
  ActivityHistoryPage,
  ActivityHistoryState,
  ActivityHistoryWindow,
} from "@/types/activity-history";
import type { PermissionStatus } from "@/types/zentra";
import { runActivityHistoryLoop } from "@/utils/activity-history-loop";
import { prepareActivityHistory } from "@/utils/activity-history-windows";

export interface ActivityHistoryJob {
  load: () => Promise<ActivityHistoryState | null>;
  permission: () => Promise<PermissionStatus>;
  save: (state: ActivityHistoryState) => Promise<void>;
  read: (window: ActivityHistoryWindow) => Promise<ActivityHistoryPage>;
  commit: (
    page: ActivityHistoryPage,
    state: ActivityHistoryState,
    window: ActivityHistoryWindow,
  ) => Promise<void>;
  assertActive: () => void;
  refresh: () => Promise<void>;
  maxPages?: number;
  budgetMs?: number;
  now?: () => Date;
}

export async function runActivityHistoryJob(
  deps: ActivityHistoryJob,
): Promise<number> {
  const now = deps.now ?? (() => new Date());
  let state = prepareActivityHistory(await deps.load(), now());
  const permission = await deps.permission();
  deps.assertActive();
  if (permission !== "granted") {
    await deps.save({
      ...state,
      status: permission === "unsupported" ? "unsupported" : "permission",
      message:
        permission === "unsupported"
          ? "Core Motion history is unavailable on this device."
          : "Motion permission is required to read activity history.",
    });
    await deps.refresh();
    return 0;
  }
  if (!state.windows.length) {
    await deps.save(state);
    await deps.refresh();
    return 0;
  }
  await deps.save(state);
  try {
    return await runActivityHistoryLoop(state, {
      ...deps,
      progress: deps.refresh,
      commit: async (page, next, window) => {
        await deps.commit(page, next, window);
        state = next;
      },
    });
  } catch (error) {
    deps.assertActive();
    const permissionNow = await deps.permission();
    deps.assertActive();
    await deps.save({
      ...state,
      status: permissionNow === "granted" ? "error" : "permission",
      message:
        error instanceof Error
          ? error.message
          : "Activity history read failed; retry available.",
    });
    await deps.refresh();
    throw error;
  }
}

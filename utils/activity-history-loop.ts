import type {
  ActivityHistoryPage,
  ActivityHistoryState,
  ActivityHistoryWindow,
} from "@/types/activity-history";
import { advanceActivityHistory } from "@/utils/activity-history-windows";

interface ActivityHistoryLoop {
  assertActive: () => void;
  read: (window: ActivityHistoryWindow) => Promise<ActivityHistoryPage>;
  commit: (
    page: ActivityHistoryPage,
    state: ActivityHistoryState,
    window: ActivityHistoryWindow,
  ) => Promise<void>;
  progress?: () => Promise<void>;
  now?: () => Date;
  maxPages?: number;
  budgetMs?: number;
}

export async function runActivityHistoryLoop(
  initial: ActivityHistoryState,
  deps: ActivityHistoryLoop,
): Promise<number> {
  const now = deps.now ?? (() => new Date());
  const started = Date.now();
  let state = initial,
    imported = 0;
  for (
    let i = 0;
    state.windows.length && i < Math.min(32, Math.max(0, deps.maxPages ?? 32));
    i++
  ) {
    deps.assertActive();
    if (i > 0 && Date.now() - started >= (deps.budgetMs ?? 8000)) break;
    const page = await deps.read(state.windows[0]);
    deps.assertActive();
    const next = advanceActivityHistory(state, page, now());
    await deps.commit(page, next, state.windows[0]);
    state = next;
    imported += page.transitions.length;
    if (i === 0 || !page.hasMore) await deps.progress?.();
    // Native reads are bounded; JS/repository consumers can run between pages.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return imported;
}

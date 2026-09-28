import type { ActivitySnapshot } from "@/utils/activity-history-snapshot";
import type { ActivityHistoryState } from "@/types/activity-history";
import type { ZentraEventRecord } from "@/types/zentra";
import { getLocalDatabase } from "@/utils/local-database";
import { enqueueDatabaseOperation } from "@/utils/event-repository";
import { assertActivityHistoryGeneration } from "@/utils/activity-history-session";
import {
  commitActivityHistoryPage,
  readActivityHistoryState,
  writeActivityHistoryState,
} from "@/utils/activity-history-sql";

export function getActivityHistoryState(): Promise<ActivityHistoryState | null> {
  return enqueueDatabaseOperation(async () =>
    readActivityHistoryState(await getLocalDatabase()),
  );
}
export function saveActivityHistoryStatus(
  state: ActivityHistoryState,
  generation: number,
): Promise<void> {
  return enqueueDatabaseOperation(async () => {
    const db = await getLocalDatabase();
    assertActivityHistoryGeneration(generation);
    await writeActivityHistoryState(db, state);
  });
}
export function commitActivityHistory(
  events: ZentraEventRecord[],
  state: ActivityHistoryState,
  generation: number,
  snapshot?: ActivitySnapshot,
): Promise<void> {
  return enqueueDatabaseOperation(async () =>
    commitActivityHistoryPage(
      await getLocalDatabase(),
      events,
      state,
      () => assertActivityHistoryGeneration(generation),
      snapshot,
    ),
  );
}

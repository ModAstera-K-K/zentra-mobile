import { canAttemptHealthRead } from "@/utils/health-access";
import { runHealthPageLoop } from "@/utils/health-page-loop";
import {
  assertHealthSyncGeneration,
  healthSyncGeneration,
} from "@/utils/health-sync-session";
import { Platform } from "react-native";
import {
  HEALTH_RECORD_TYPES,
  type HealthRecordType,
  type HealthSyncState,
} from "@/types/health-sync";
import {
  getHealthSyncStatus,
  setHealthSyncStatus,
  commitHealthPage,
} from "@/utils/health-sync-repository";
import {
  readHealthSyncPage,
  readHealthSteps,
  getGrantedHealthConnectPermissionsAsync,
} from "@/utils/native/zentra-native-signals";
import { createHealthConnectEvents } from "@/utils/live-event-builders";
import { parseISODate, shiftISODate, toISODate } from "@/utils/dates";

let inFlight: Promise<void> | null = null;
let inFlightGeneration = -1;
export function syncHealthHistory(): Promise<void> {
  if (inFlight && inFlightGeneration === healthSyncGeneration())
    return inFlight;
  const generation = healthSyncGeneration();
  inFlightGeneration = generation;
  inFlight = runHealthHistory(generation).finally(() => {
    if (inFlightGeneration === generation) inFlight = null;
  });
  return inFlight;
}
async function runHealthHistory(generation: number): Promise<void> {
  const states = await getHealthSyncStatus();
  const permissions = await getGrantedHealthConnectPermissionsAsync();
  for (const type of HEALTH_RECORD_TYPES) {
    assertHealthSyncGeneration(generation);
    if (!canAttemptHealthRead(Platform.OS, type, permissions)) {
      await setHealthSyncStatus(
        type,
        "permission",
        "Read permission not granted",
      );
      continue;
    }
    try {
      await syncType(
        type,
        generation,
        states.find((state) => state.record_type === type),
      );
    } catch (error) {
      assertHealthSyncGeneration(generation);
      await setHealthSyncStatus(
        type,
        "error",
        error instanceof Error
          ? error.message
          : "Import failed; retry available",
      );
    }
  }
}
async function syncType(
  type: HealthRecordType,
  generation: number,
  state?: HealthSyncState,
): Promise<void> {
  const days = state?.history_days ?? 30;
  const start =
    state?.start_at ??
    parseISODate(
      shiftISODate(toISODate(new Date()), -(days - 1)),
    ).toISOString();
  const end =
    state?.status === "importing" && state.end_at
      ? state.end_at
      : new Date().toISOString();
  await setHealthSyncStatus(type, "importing", null);
  let snapshotStart = false;
  await runHealthPageLoop(state?.cursor ?? null, {
    assertActive: () => assertHealthSyncGeneration(generation),
    read: (cursor) => {
      snapshotStart = cursor === null;
      return readHealthSyncPage(type, start, end, cursor);
    },
    commit: async (page, pageIndex) => {
      if (page.reset) {
        await commitHealthPage(
          type,
          [],
          [],
          null,
          start,
          end,
          days,
          true,
          generation,
        );
        return;
      }
      const records = [...page.records];
      let statisticsStart: string | undefined;
      if (
        type === "steps" &&
        (!page.hasMore || (!state?.cursor && pageIndex === 0))
      ) {
        statisticsStart =
          state?.status === "ready" &&
          pageIndex === 0 &&
          !page.records.length &&
          !page.deletedIds.length
            ? parseISODate(toISODate(new Date())).toISOString()
            : start;
        records.push(...(await readHealthSteps(statisticsStart, end)));
      }
      await commitHealthPage(
        type,
        createHealthConnectEvents(records),
        page.deletedIds,
        page.cursor,
        start,
        end,
        days,
        page.hasMore,
        generation,
        statisticsStart ? { start: statisticsStart, end } : undefined,
        snapshotStart,
      );
    },
  });
}

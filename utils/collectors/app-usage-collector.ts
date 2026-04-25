import {
  appendEventsForCollector,
  ensureCollectorFailureState,
  getLatestCollectorDiagnosticForKey,
  logCollectorSuccess,
} from "@/utils/event-repository";
import {
  getUsageAccessPermissionStatusAsync,
  readUsageEventsAsync,
} from "@/utils/native/zentra-native-signals";
import { createUsageDerivedEvents } from "@/utils/live-event-builders";
import type {
  AppUsageCollectorDeps,
  CollectorHandle,
} from "@/utils/collectors/types";
import { getAppUsageUnsupportedMessage } from "@/utils/platform-capabilities";

function getSyncWindowStart(lastSyncedAt: string | null): string {
  if (lastSyncedAt) {
    return new Date(new Date(lastSyncedAt).getTime() - 60_000).toISOString();
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

export async function syncAppUsageCollector(
  deps: AppUsageCollectorDeps,
  lastSyncedAt: string | null,
): Promise<string> {
  const permissionStatus = await getUsageAccessPermissionStatusAsync();

  if (permissionStatus === "unsupported") {
    await ensureCollectorFailureState(
      "appUsage",
      getAppUsageUnsupportedMessage(),
    );
    await ensureCollectorFailureState(
      "deviceState",
      getAppUsageUnsupportedMessage(),
    );
    await deps.refreshRepository();
    return lastSyncedAt ?? new Date().toISOString();
  }

  if (permissionStatus !== "granted") {
    await ensureCollectorFailureState("appUsage", "Usage access not granted");
    await ensureCollectorFailureState(
      "deviceState",
      "Usage access not granted for screen and unlock events",
    );
    await deps.refreshRepository();
    return lastSyncedAt ?? new Date().toISOString();
  }

  const endIso = new Date().toISOString();
  const usageEvents = await readUsageEventsAsync(
    getSyncWindowStart(lastSyncedAt),
    endIso,
  );
  const { appUsageEvents, deviceStateEvents } =
    createUsageDerivedEvents(usageEvents);

  if (appUsageEvents.length) {
    await appendEventsForCollector(
      "appUsage",
      appUsageEvents,
      `Usage stats stored ${appUsageEvents.length} event(s)`,
    );
  } else {
    await logCollectorSuccess(
      "appUsage",
      "Usage access granted with no app sessions in this window",
      0,
    );
  }

  if (deviceStateEvents.length) {
    await appendEventsForCollector(
      "deviceState",
      deviceStateEvents,
      `Screen and unlock events stored ${deviceStateEvents.length} event(s)`,
    );
  } else {
    await logCollectorSuccess(
      "deviceState",
      "Usage access granted with no screen-state events in this window",
      0,
    );
  }

  await deps.refreshRepository();
  return endIso;
}

async function getInitialAppUsageSyncCursor(): Promise<string | null> {
  const latestAppUsageDiagnostic =
    await getLatestCollectorDiagnosticForKey("appUsage");
  return latestAppUsageDiagnostic?.lastSuccessfulSyncAt ?? null;
}

export async function startAppUsageCollector(
  deps: AppUsageCollectorDeps,
): Promise<CollectorHandle> {
  let lastSyncedAt = await getInitialAppUsageSyncCursor();

  async function syncUsageStats(): Promise<void> {
    lastSyncedAt = await syncAppUsageCollector(deps, lastSyncedAt);
  }

  await syncUsageStats();
  const interval = setInterval(() => {
    void syncUsageStats();
  }, 60_000);

  return {
    stop: () => clearInterval(interval),
  };
}

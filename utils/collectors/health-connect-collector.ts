import { cancelHealthSync } from "@/utils/health-sync-session";
import { syncHealthHistory } from "@/utils/health-sync-runner";
import { getHealthSyncStates } from "@/utils/health-sync-repository";
import { AppState, Platform } from "react-native";

import {
  ensureCollectorFailureState,
  logCollectorSuccess,
} from "@/utils/event-repository";
import type {
  CollectorHandle,
  HealthConnectCollectorDeps,
} from "@/utils/collectors/types";
import { getHealthConnectAvailabilityAsync } from "@/utils/native/zentra-native-signals";
import {
  getHealthPlatformName,
  getHealthUnsupportedMessage,
} from "@/utils/platform-capabilities";

export async function syncHealthConnectCollector(
  deps: HealthConnectCollectorDeps,
): Promise<void> {
  const availability = await getHealthConnectAvailabilityAsync();

  if (availability === "unsupported") {
    await ensureCollectorFailureState(
      "healthConnect",
      getHealthUnsupportedMessage(),
    );
    await deps.refreshRepository();
    return;
  }

  if (availability === "not_installed") {
    await ensureCollectorFailureState(
      "healthConnect",
      Platform.OS === "ios"
        ? `${getHealthPlatformName()} is unavailable on this device`
        : "Install or update Health Connect before enabling this collector",
    );
    await deps.refreshRepository();
    return;
  }

  await syncHealthHistory();
  const states = await getHealthSyncStates();
  const ready = states.filter((state) => state.status === "ready");
  if (ready.length) {
    await deps.noteSyncWindowEnd(new Date().toISOString());
    await logCollectorSuccess(
      "healthConnect",
      `${ready.length}/4 record types synced`,
      0,
    );
  } else if (
    states.some(
      (state) => state.status === "error" || state.status === "permission",
    )
  ) {
    await ensureCollectorFailureState(
      "healthConnect",
      "Some records could not be read; see source status",
    );
  }
  await deps.refreshRepository();
}

export async function startHealthConnectCollector(
  deps: HealthConnectCollectorDeps,
): Promise<CollectorHandle> {
  await syncHealthConnectCollector(deps);

  const timer = setInterval(() => {
    if (AppState.currentState !== "active") return;
    void getHealthSyncStates()
      .then((states) => {
        if (states.some((state) => state.status === "importing"))
          return syncHealthConnectCollector(deps);
      })
      .catch(() => undefined);
  }, 15000);
  return {
    stop: () => {
      clearInterval(timer);
      cancelHealthSync();
    },
  };
}

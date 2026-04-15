import { Platform } from "react-native";

import {
  appendEventsForCollector,
  ensureCollectorFailureState,
  logCollectorSuccess,
} from "@/utils/event-repository";
import type {
  CollectorHandle,
  HealthConnectCollectorDeps,
} from "@/utils/collectors/types";
import { shiftISODate, toISODate } from "@/utils/dates";
import { createHealthConnectEvents } from "@/utils/live-event-builders";
import {
  getGrantedHealthConnectPermissionsAsync,
  getHealthConnectAvailabilityAsync,
  hasRequiredHealthConnectPermissions,
  readHealthConnectRecordsAsync,
} from "@/utils/native/zentra-native-signals";
import {
  getHealthPlatformName,
  getHealthUnsupportedMessage,
} from "@/utils/platform-capabilities";

function getHealthConnectWindow(): { startIso: string; endIso: string } {
  const now = new Date();
  const endIso = now.toISOString();
  const startIso = new Date(
    `${shiftISODate(toISODate(now), -30)}T00:00:00.000Z`,
  ).toISOString();

  return { startIso, endIso };
}

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

  const grantedPermissions = await getGrantedHealthConnectPermissionsAsync();

  if (!hasRequiredHealthConnectPermissions(grantedPermissions)) {
    await ensureCollectorFailureState(
      "healthConnect",
      `${getHealthPlatformName()} permissions not granted`,
    );
    await deps.refreshRepository();
    return;
  }

  const { startIso, endIso } = getHealthConnectWindow();

  let records;
  try {
    records = await readHealthConnectRecordsAsync(startIso, endIso);
  } catch (error) {
    await ensureCollectorFailureState(
      "healthConnect",
      error instanceof Error
        ? error.message
        : `${getHealthPlatformName()} read failed — check permissions in ${getHealthPlatformName()}`,
    );
    await deps.refreshRepository();
    return;
  }

  const events = createHealthConnectEvents(records);

  if (!events.length) {
    await logCollectorSuccess(
      "healthConnect",
      `${getHealthPlatformName()} connected with no matching records yet`,
      0,
    );
    await deps.refreshRepository();
    return;
  }

  await appendEventsForCollector(
    "healthConnect",
    events,
    `${getHealthPlatformName()} sync stored ${events.length} event(s)`,
  );
  await deps.refreshRepository();
}

export async function startHealthConnectCollector(
  deps: HealthConnectCollectorDeps,
): Promise<CollectorHandle> {
  await syncHealthConnectCollector(deps);

  return {
    stop: () => undefined,
  };
}

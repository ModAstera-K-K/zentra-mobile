import * as Location from "expo-location";

import {
  appendEventsForCollector,
  ensureCollectorFailureState,
} from "@/utils/event-repository";
import { ZENTRA_BACKGROUND_LOCATION_TASK } from "@/utils/background/location-task";
import { createLocationEvent } from "@/utils/live-event-builders";
import { mapExpoPermissionStatus } from "@/utils/device-signals";
import type {
  CollectorHandle,
  LocationCollectorDeps,
} from "@/utils/collectors/types";

async function persistLocationSample(
  deps: LocationCollectorDeps,
  sample: {
    latitude: number;
    longitude: number;
    timestamp: string;
  },
): Promise<void> {
  await deps.addLocationSample(sample);
  await appendEventsForCollector(
    "location",
    [createLocationEvent(sample)],
    "Location sample stored",
  );
  await deps.refreshRepository();
}

async function ensureBackgroundLocationUpdatesAsync(
  hasSeenBackgroundPermissionRationale: boolean,
): Promise<void> {
  const isBackgroundLocationAvailable =
    await Location.isBackgroundLocationAvailableAsync();

  if (!isBackgroundLocationAvailable || !hasSeenBackgroundPermissionRationale) {
    return;
  }

  const existingBackgroundPermission =
    await Location.getBackgroundPermissionsAsync();
  const backgroundPermission =
    existingBackgroundPermission.status === "granted" ||
    !existingBackgroundPermission.canAskAgain
      ? existingBackgroundPermission
      : await Location.requestBackgroundPermissionsAsync();

  if (backgroundPermission.status !== "granted") {
    return;
  }

  const hasStartedUpdates = await Location.hasStartedLocationUpdatesAsync(
    ZENTRA_BACKGROUND_LOCATION_TASK,
  );

  if (hasStartedUpdates) {
    return;
  }

  await Location.startLocationUpdatesAsync(ZENTRA_BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15 * 60 * 1000,
    distanceInterval: 50,
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: "Zentra background location",
      notificationBody:
        "Zentra is collecting periodic location samples for mobility radius.",
      killServiceOnDestroy: false,
    },
  });
}

export async function startLocationCollector(
  deps: LocationCollectorDeps,
): Promise<CollectorHandle> {
  const supported = await Location.hasServicesEnabledAsync();
  await deps.setLocationSupport(true);
  await deps.setLocationServicesEnabled(supported);

  const existingPermission = await Location.getForegroundPermissionsAsync();
  const permission =
    existingPermission.status === "granted" || !existingPermission.canAskAgain
      ? existingPermission
      : await Location.requestForegroundPermissionsAsync();

  await deps.setLocationPermissionStatus(
    mapExpoPermissionStatus(permission.status),
  );

  if (!supported || permission.status !== "granted") {
    await ensureCollectorFailureState(
      "location",
      supported
        ? "Foreground location permission is required for mobility radius"
        : "Location services are disabled",
    );
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  const lastKnown = await Location.getLastKnownPositionAsync();

  if (lastKnown) {
    await persistLocationSample(deps, {
      latitude: lastKnown.coords.latitude,
      longitude: lastKnown.coords.longitude,
      timestamp: new Date(lastKnown.timestamp).toISOString(),
    });
  }

  await ensureBackgroundLocationUpdatesAsync(
    deps.hasSeenBackgroundPermissionRationale,
  );

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 60000,
      distanceInterval: 50,
    },
    (location) => {
      void persistLocationSample(deps, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: new Date(location.timestamp).toISOString(),
      });
    },
  );

  return {
    stop: () => {
      subscription.remove();
      void Location.stopLocationUpdatesAsync(
        ZENTRA_BACKGROUND_LOCATION_TASK,
      ).catch(() => undefined);
    },
  };
}

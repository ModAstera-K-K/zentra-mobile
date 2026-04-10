import * as Location from 'expo-location';

import { appendEventsForCollector, ensureCollectorFailureState } from '@/utils/event-repository';
import { createLocationEvent } from '@/utils/live-event-builders';
import { mapExpoPermissionStatus } from '@/utils/device-signals';
import type { CollectorHandle, LocationCollectorDeps } from '@/utils/collectors/types';

async function persistLocationSample(
  deps: LocationCollectorDeps,
  sample: {
    latitude: number;
    longitude: number;
    timestamp: string;
  },
): Promise<void> {
  await deps.addLocationSample(sample);
  await appendEventsForCollector('location', [createLocationEvent(sample)], 'Location sample stored');
  await deps.refreshRepository();
}

export async function startLocationCollector(
  deps: LocationCollectorDeps,
): Promise<CollectorHandle> {
  const supported = await Location.hasServicesEnabledAsync();
  await deps.setLocationSupport(true);
  await deps.setLocationServicesEnabled(supported);

  const existingPermission = await Location.getForegroundPermissionsAsync();
  const permission = existingPermission.status === 'granted' || !existingPermission.canAskAgain
    ? existingPermission
    : await Location.requestForegroundPermissionsAsync();

  await deps.setLocationPermissionStatus(mapExpoPermissionStatus(permission.status));

  if (!supported || permission.status !== 'granted') {
    await ensureCollectorFailureState(
      'location',
      supported
        ? 'Foreground location permission is required for mobility radius'
        : 'Location services are disabled',
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
    stop: () => subscription.remove(),
  };
}

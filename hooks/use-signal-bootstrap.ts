import { useEffect } from 'react';

import { useAppStore, useRepositoryStore, useSignalStore } from '@/stores';
import {
  getStoredEventCount,
  pruneLocationEventsBefore,
  seedRepositoryEvents,
} from '@/utils/event-repository';
import {
  buildSeedEventsFromSignals,
} from '@/utils/live-event-builders';
import { getLocationRetentionDays } from '@/utils/location-retention';
import {
  startActivityCollectorModule,
  startAmbientLightCollectorModule,
  startAppUsageCollectorModule,
  startDeviceStateCollectorModule,
  startHealthConnectCollectorModule,
  startLocationCollectorModule,
  startSleepCollectorModule,
  startStepCollectorModule,
} from '@/utils/collectors/registry';
import type { CollectorHandle } from '@/utils/collectors/types';

export function useSignalBootstrap(): void {
  const collectors = useAppStore((state) => state.collectors);
  const collectorRetryToken = useAppStore((state) => state.collectorRetryToken);
  const locationRetentionPreference = useAppStore((state) => state.locationRetentionPreference);
  const isHydrated = useSignalStore((state) => state.isHydrated);
  const bootstrap = useSignalStore((state) => state.bootstrap);
  const setStepSupport = useSignalStore((state) => state.setStepSupport);
  const setStepPermissionStatus = useSignalStore((state) => state.setStepPermissionStatus);
  const setStepCount = useSignalStore((state) => state.setStepCount);
  const setBatterySupport = useSignalStore((state) => state.setBatterySupport);
  const setBatterySnapshot = useSignalStore((state) => state.setBatterySnapshot);
  const setLocationSupport = useSignalStore((state) => state.setLocationSupport);
  const setLocationPermissionStatus = useSignalStore((state) => state.setLocationPermissionStatus);
  const setLocationServicesEnabled = useSignalStore((state) => state.setLocationServicesEnabled);
  const addLocationSample = useSignalStore((state) => state.addLocationSample);
  const setAmbientLightSupport = useSignalStore((state) => state.setAmbientLightSupport);
  const setAmbientLightLux = useSignalStore((state) => state.setAmbientLightLux);
  const currentSignals = useSignalStore((state) => state);
  const repositoryHydrated = useRepositoryStore((state) => state.isHydrated);
  const bootstrapRepository = useRepositoryStore((state) => state.bootstrap);
  const refreshRepository = useRepositoryStore((state) => state.refreshAll);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    void bootstrapRepository();
  }, [bootstrapRepository]);

  useEffect(() => {
    if (!isHydrated || !repositoryHydrated) {
      return;
    }

    let isCancelled = false;

    async function seedRepository(): Promise<void> {
      if (await getStoredEventCount() > 0 || isCancelled) {
        return;
      }

      const events = buildSeedEventsFromSignals(currentSignals);

      if (!events.length) {
        return;
      }

      await seedRepositoryEvents(events);
      await refreshRepository();
    }

    void seedRepository();

    return () => {
      isCancelled = true;
    };
  }, [currentSignals, isHydrated, refreshRepository, repositoryHydrated]);

  useEffect(() => {
    if (!isHydrated || !repositoryHydrated) {
      return;
    }

    let isCancelled = false;

    async function enforceLocationRetention(): Promise<void> {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - getLocationRetentionDays(locationRetentionPreference));
      const deletedCount = await pruneLocationEventsBefore(cutoff.toISOString());

      if (isCancelled || !deletedCount) {
        return;
      }

      await refreshRepository();
    }

    void enforceLocationRetention();

    return () => {
      isCancelled = true;
    };
  }, [isHydrated, locationRetentionPreference, refreshRepository, repositoryHydrated]);

  useEffect(() => {
    if (!isHydrated || !collectors.steps.enabled) {
      return;
    }

    let isCancelled = false;
    let handle: CollectorHandle | null = null;

    async function startSteps(): Promise<void> {
      if (isCancelled) {
        return;
      }

      handle = await startStepCollectorModule({
        refreshRepository,
        setStepSupport,
        setStepPermissionStatus,
        setStepCount,
      });
    }

    void startSteps();

    return () => {
      isCancelled = true;
      handle?.stop();
    };
  }, [
    collectors.steps.enabled,
    isHydrated,
    setStepCount,
    setStepPermissionStatus,
    setStepSupport,
    refreshRepository,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!isHydrated || !collectors.deviceState.enabled) {
      return;
    }

    let isCancelled = false;
    let handle: CollectorHandle | null = null;

    async function startBattery(): Promise<void> {
      if (isCancelled) {
        return;
      }

      handle = await startDeviceStateCollectorModule({
        refreshRepository,
        setBatterySupport,
        setBatterySnapshot,
      });
    }

    void startBattery();

    return () => {
      isCancelled = true;
      handle?.stop();
    };
  }, [
    collectors.deviceState.enabled,
    isHydrated,
    setBatterySnapshot,
    setBatterySupport,
    refreshRepository,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!isHydrated || !collectors.location.enabled) {
      return;
    }

    let isCancelled = false;
    let handle: CollectorHandle | null = null;

    async function startLocation(): Promise<void> {
      if (isCancelled) {
        return;
      }

      handle = await startLocationCollectorModule({
        refreshRepository,
        setLocationSupport,
        setLocationPermissionStatus,
        setLocationServicesEnabled,
        addLocationSample,
      });
    }

    void startLocation();

    return () => {
      isCancelled = true;
      handle?.stop();
    };
  }, [
    addLocationSample,
    collectors.location.enabled,
    isHydrated,
    setLocationPermissionStatus,
    setLocationServicesEnabled,
    setLocationSupport,
    refreshRepository,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!isHydrated || !collectors.activity.enabled) {
      return;
    }

    let handle: CollectorHandle | null = null;
    void (async () => {
      handle = await startActivityCollectorModule({ refreshRepository });
    })();

    return () => {
      handle?.stop();
    };
  }, [collectors.activity.enabled, isHydrated, refreshRepository, collectorRetryToken]);

  useEffect(() => {
    if (!isHydrated || !collectors.appUsage.enabled) {
      return;
    }

    let handle: CollectorHandle | null = null;
    void (async () => {
      handle = await startAppUsageCollectorModule({ refreshRepository });
    })();

    return () => {
      handle?.stop();
    };
  }, [collectors.appUsage.enabled, isHydrated, refreshRepository, collectorRetryToken]);

  useEffect(() => {
    if (!isHydrated || !collectors.healthConnect.enabled) {
      return;
    }

    let handle: CollectorHandle | null = null;
    void (async () => {
      handle = await startHealthConnectCollectorModule({ refreshRepository });
    })();

    return () => {
      handle?.stop();
    };
  }, [collectors.healthConnect.enabled, isHydrated, refreshRepository, collectorRetryToken]);

  useEffect(() => {
    if (!isHydrated || !collectors.sleep.enabled) {
      return;
    }

    let handle: CollectorHandle | null = null;
    void (async () => {
      handle = await startSleepCollectorModule({ refreshRepository });
    })();

    return () => {
      handle?.stop();
    };
  }, [collectors.sleep.enabled, isHydrated, refreshRepository, collectorRetryToken]);

  useEffect(() => {
    if (!isHydrated || !collectors.ambientLight.enabled) {
      return;
    }

    let handle: CollectorHandle | null = null;
    void (async () => {
      handle = await startAmbientLightCollectorModule({
        refreshRepository,
        setAmbientLightSupport,
        setAmbientLightLux,
      });
    })();

    return () => {
      handle?.stop();
    };
  }, [
    collectors.ambientLight.enabled,
    isHydrated,
    refreshRepository,
    setAmbientLightLux,
    setAmbientLightSupport,
    collectorRetryToken,
  ]);
}

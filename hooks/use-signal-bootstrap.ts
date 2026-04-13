import { useEffect, useRef } from "react";

import { useAppStore, useRepositoryStore, useSignalStore } from "@/stores";
import {
  getStoredEventCount,
  pruneLocationEventsBefore,
  seedRepositoryEvents,
} from "@/utils/event-repository";
import { buildSeedEventsFromSignals } from "@/utils/live-event-builders";
import { getLocationRetentionDays } from "@/utils/location-retention";
import {
  startActivityCollectorModule,
  startAmbientLightCollectorModule,
  startAppUsageCollectorModule,
  startConnectivityCollectorModule,
  startDeviceStateCollectorModule,
  startHealthConnectCollectorModule,
  startLocationCollectorModule,
  startMotionContextCollectorModule,
  startSleepCollectorModule,
  startStepCollectorModule,
} from "@/utils/collectors/registry";
import type { CollectorHandle } from "@/utils/collectors/types";

export function useSignalBootstrap(): void {
  const collectors = useAppStore((state) => state.collectors);
  const collectorRetryToken = useAppStore((state) => state.collectorRetryToken);
  const locationRetentionPreference = useAppStore(
    (state) => state.locationRetentionPreference,
  );
  const isHydrated = useSignalStore((state) => state.isHydrated);
  const bootstrap = useSignalStore((state) => state.bootstrap);
  const setStepSupport = useSignalStore((state) => state.setStepSupport);
  const setStepPermissionStatus = useSignalStore(
    (state) => state.setStepPermissionStatus,
  );
  const setStepCount = useSignalStore((state) => state.setStepCount);
  const setBatterySupport = useSignalStore((state) => state.setBatterySupport);
  const setBatterySnapshot = useSignalStore(
    (state) => state.setBatterySnapshot,
  );
  const setLocationSupport = useSignalStore(
    (state) => state.setLocationSupport,
  );
  const setLocationPermissionStatus = useSignalStore(
    (state) => state.setLocationPermissionStatus,
  );
  const setLocationServicesEnabled = useSignalStore(
    (state) => state.setLocationServicesEnabled,
  );
  const addLocationSample = useSignalStore((state) => state.addLocationSample);
  const setAmbientLightSupport = useSignalStore(
    (state) => state.setAmbientLightSupport,
  );
  const setAmbientLightLux = useSignalStore(
    (state) => state.setAmbientLightLux,
  );
  const hasSeededRef = useRef(false);
  const repositoryHydrated = useRepositoryStore((state) => state.isHydrated);
  const bootstrapRepository = useRepositoryStore((state) => state.bootstrap);
  const refreshAll = useRepositoryStore((state) => state.refreshAll);
  const refreshTodayData = useRepositoryStore(
    (state) => state.refreshTodayData,
  );
  const refreshDiagnostics = useRepositoryStore(
    (state) => state.refreshDiagnostics,
  );
  const refreshSleep = useRepositoryStore((state) => state.refreshSleep);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    void bootstrapRepository();
  }, [bootstrapRepository]);

  useEffect(() => {
    if (!isHydrated || !repositoryHydrated || hasSeededRef.current) {
      return;
    }

    let isCancelled = false;

    async function seedRepository(): Promise<void> {
      if ((await getStoredEventCount()) > 0 || isCancelled) {
        hasSeededRef.current = true;
        return;
      }

      const events = buildSeedEventsFromSignals(useSignalStore.getState());

      if (!events.length) {
        return;
      }

      await seedRepositoryEvents(events);
      hasSeededRef.current = true;
      await refreshAll();
    }

    void seedRepository();

    return () => {
      isCancelled = true;
    };
  }, [isHydrated, refreshAll, repositoryHydrated]);

  useEffect(() => {
    if (!isHydrated || !repositoryHydrated) {
      return;
    }

    let isCancelled = false;

    async function enforceLocationRetention(): Promise<void> {
      const cutoff = new Date();
      cutoff.setDate(
        cutoff.getDate() -
          getLocationRetentionDays(locationRetentionPreference),
      );
      const deletedCount = await pruneLocationEventsBefore(
        cutoff.toISOString(),
      );

      if (isCancelled || !deletedCount) {
        return;
      }

      await refreshTodayData();
    }

    void enforceLocationRetention();

    return () => {
      isCancelled = true;
    };
  }, [
    isHydrated,
    locationRetentionPreference,
    refreshTodayData,
    repositoryHydrated,
  ]);

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
        refreshRepository: refreshTodayData,
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
    refreshTodayData,
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
        refreshRepository: refreshTodayData,
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
    refreshTodayData,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!isHydrated || !collectors.connectivity.enabled) {
      return;
    }

    let handle: CollectorHandle | null = null;
    void (async () => {
      handle = await startConnectivityCollectorModule({
        refreshRepository: refreshTodayData,
      });
    })();

    return () => {
      handle?.stop();
    };
  }, [
    collectors.connectivity.enabled,
    isHydrated,
    refreshTodayData,
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
        refreshRepository: refreshTodayData,
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
    refreshTodayData,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!isHydrated || !collectors.activity.enabled) {
      return;
    }

    let handle: CollectorHandle | null = null;
    void (async () => {
      handle = await startActivityCollectorModule({
        refreshRepository: refreshTodayData,
      });
    })();

    return () => {
      handle?.stop();
    };
  }, [
    collectors.activity.enabled,
    isHydrated,
    refreshTodayData,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!isHydrated || !collectors.appUsage.enabled) {
      return;
    }

    let handle: CollectorHandle | null = null;
    void (async () => {
      handle = await startAppUsageCollectorModule({
        refreshRepository: refreshTodayData,
      });
    })();

    return () => {
      handle?.stop();
    };
  }, [
    collectors.appUsage.enabled,
    isHydrated,
    refreshTodayData,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!isHydrated || !collectors.healthConnect.enabled) {
      return;
    }

    let handle: CollectorHandle | null = null;
    void (async () => {
      handle = await startHealthConnectCollectorModule({
        refreshRepository: refreshAll,
      });
    })();

    return () => {
      handle?.stop();
    };
  }, [
    collectors.healthConnect.enabled,
    isHydrated,
    refreshAll,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!isHydrated || !collectors.sleep.enabled) {
      return;
    }

    let handle: CollectorHandle | null = null;
    void (async () => {
      handle = await startSleepCollectorModule({
        refreshRepository: async () => {
          await refreshSleep();
          await refreshTodayData();
        },
      });
    })();

    return () => {
      handle?.stop();
    };
  }, [
    collectors.sleep.enabled,
    isHydrated,
    refreshSleep,
    refreshTodayData,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!isHydrated || !collectors.ambientLight.enabled) {
      return;
    }

    let handle: CollectorHandle | null = null;
    void (async () => {
      handle = await startAmbientLightCollectorModule({
        refreshRepository: refreshTodayData,
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
    refreshTodayData,
    setAmbientLightLux,
    setAmbientLightSupport,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!isHydrated || !collectors.motionContext.enabled) {
      return;
    }

    let handle: CollectorHandle | null = null;
    void (async () => {
      handle = await startMotionContextCollectorModule({
        refreshRepository: refreshTodayData,
      });
    })();

    return () => {
      handle?.stop();
    };
  }, [
    collectors.motionContext.enabled,
    isHydrated,
    refreshTodayData,
    collectorRetryToken,
  ]);
}

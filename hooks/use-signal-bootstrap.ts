import { useEffect, useRef, useState } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";

import { useAppStore, useRepositoryStore, useSignalStore } from "@/stores";
import {
  compactEventChanges,
  hasStoredEvents,
  pruneCollectorDiagnostics,
  pruneLocationEventsBefore,
  seedRepositoryEvents,
} from "@/utils/event-repository";
import { buildSeedEventsFromSignals } from "@/utils/live-event-builders";
import { getLocationRetentionDays } from "@/utils/location-retention";
import {
  hasEnabledAndroidBackgroundServiceCollector,
  hasEnabledCollectorCapability,
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
import { runImportantCollectorReconcile } from "@/utils/background/reconcile";
import { syncBackgroundReconcileTaskRegistration } from "@/utils/background/reconcile-task";
import {
  startBackgroundCollectionServiceAsync,
  stopBackgroundCollectionServiceAsync,
} from "@/utils/native/zentra-native-signals";

const COLLECTOR_START_FALLBACK_MS = 2_000;

export function useSignalBootstrap(): void {
  const collectors = useAppStore((state) => state.collectors);
  const collectorRetryToken = useAppStore((state) => state.collectorRetryToken);
  const locationRetentionPreference = useAppStore(
    (state) => state.locationRetentionPreference,
  );
  const hasSeenLocationBackgroundPermissionRationale = useAppStore(
    (state) => state.hasSeenLocationBackgroundPermissionRationale,
  );
  const isHydrated = useSignalStore((state) => state.isHydrated);
  const lowPowerMode = useSignalStore((state) => state.lowPowerMode);
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
  const drainBufferedActivityTransitions = useRepositoryStore(
    (state) => state.drainBufferedActivityTransitions,
  );
  const refreshDiagnostics = useRepositoryStore(
    (state) => state.refreshDiagnostics,
  );
  const refreshBackgroundCollectionServiceState = useRepositoryStore(
    (state) => state.refreshBackgroundCollectionServiceState,
  );
  const refreshSleep = useRepositoryStore((state) => state.refreshSleep);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const bootstrapTaskQueueRef = useRef<Promise<void>>(Promise.resolve());
  const bootstrapTaskFailedRef = useRef(false);
  const [collectorsMayStart, setCollectorsMayStart] = useState(false);
  const reconcileInFlightRef = useRef<Promise<void> | null>(null);
  const lastResumeReconcileAtRef = useRef(0);
  const hasResumeReconcileCollectors = hasEnabledCollectorCapability(
    collectors,
    ["backgroundPeriodic", "nativeBuffered"],
  );
  const trackBackgroundLocation =
    collectors.location.enabled && hasSeenLocationBackgroundPermissionRationale;
  const trackBackgroundActivity = collectors.activity.enabled;
  const shouldRunAndroidBackgroundService =
    Platform.OS === "android" &&
    hasEnabledAndroidBackgroundServiceCollector(collectors) &&
    // The current native service is declared as a location foreground service.
    // Keep startup tied to the location-backed path until an activity-only
    // foreground-service type is defined and validated separately.
    trackBackgroundLocation;

  function enqueueBootstrapTask(task: () => Promise<void>): Promise<void> {
    const nextTask = bootstrapTaskQueueRef.current.then(task, task);
    bootstrapTaskQueueRef.current = nextTask.then(
      () => undefined,
      () => {
        bootstrapTaskFailedRef.current = true;
      },
    );
    return nextTask;
  }

  // Collectors write as they start. Holding them until the stored data has
  // loaded keeps those first writes out of the way of the first screen. The
  // timer makes sure a slow or failed load cannot hold collection up.
  useEffect(() => {
    if (!isHydrated || collectorsMayStart) {
      return;
    }

    if (repositoryHydrated) {
      setCollectorsMayStart(true);
      return;
    }

    const timer = setTimeout(
      () => setCollectorsMayStart(true),
      COLLECTOR_START_FALLBACK_MS,
    );
    return () => clearTimeout(timer);
  }, [collectorsMayStart, isHydrated, repositoryHydrated]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // A failure is kept in the store, where Today offers a retry.
    void bootstrapRepository().catch(() => undefined);
  }, [bootstrapRepository]);

  useEffect(() => {
    if (!isHydrated || !repositoryHydrated || hasSeededRef.current) {
      return;
    }

    let isCancelled = false;

    async function seedRepository(): Promise<void> {
      if ((await hasStoredEvents()) || isCancelled) {
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
    if (!isHydrated || !repositoryHydrated || !hasResumeReconcileCollectors) {
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
    if (!collectorsMayStart || !collectors.steps.enabled) {
      return;
    }

    let isCancelled = false;
    let handle: CollectorHandle | null = null;

    async function startSteps(): Promise<void> {
      await enqueueBootstrapTask(async () => {
        if (isCancelled) {
          return;
        }

        const nextHandle = await startStepCollectorModule({
          refreshRepository: refreshTodayData,
          setStepSupport,
          setStepPermissionStatus,
          setStepCount,
        });

        if (isCancelled) {
          nextHandle.stop();
          return;
        }

        handle = nextHandle;
      });
    }

    void startSteps();

    return () => {
      isCancelled = true;
      handle?.stop();
    };
  }, [
    collectors.steps.enabled,
    collectorsMayStart,
    setStepCount,
    setStepPermissionStatus,
    setStepSupport,
    refreshTodayData,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!collectorsMayStart || !collectors.deviceState.enabled) {
      return;
    }

    let isCancelled = false;
    let handle: CollectorHandle | null = null;

    async function startBattery(): Promise<void> {
      await enqueueBootstrapTask(async () => {
        if (isCancelled) {
          return;
        }

        const nextHandle = await startDeviceStateCollectorModule({
          refreshRepository: refreshTodayData,
          setBatterySupport,
          setBatterySnapshot,
        });

        if (isCancelled) {
          nextHandle.stop();
          return;
        }

        handle = nextHandle;
      });
    }

    void startBattery();

    return () => {
      isCancelled = true;
      handle?.stop();
    };
  }, [
    collectors.deviceState.enabled,
    collectorsMayStart,
    setBatterySnapshot,
    setBatterySupport,
    refreshTodayData,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!collectorsMayStart || !collectors.connectivity.enabled) {
      return;
    }

    let isCancelled = false;
    let handle: CollectorHandle | null = null;
    void (async () => {
      await enqueueBootstrapTask(async () => {
        if (isCancelled) {
          return;
        }

        const nextHandle = await startConnectivityCollectorModule({
          refreshRepository: refreshTodayData,
        });

        if (isCancelled) {
          nextHandle.stop();
          return;
        }

        handle = nextHandle;
      });
    })();

    return () => {
      isCancelled = true;
      handle?.stop();
    };
  }, [
    collectors.connectivity.enabled,
    collectorsMayStart,
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
      await enqueueBootstrapTask(async () => {
        if (isCancelled) {
          return;
        }

        const nextHandle = await startLocationCollectorModule({
          hasSeenBackgroundPermissionRationale:
            hasSeenLocationBackgroundPermissionRationale,
          refreshRepository: refreshTodayData,
          setLocationSupport,
          setLocationPermissionStatus,
          setLocationServicesEnabled,
          addLocationSample,
        });

        if (isCancelled) {
          nextHandle.stop();
          return;
        }

        handle = nextHandle;
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
    hasSeenLocationBackgroundPermissionRationale,
    isHydrated,
    setLocationPermissionStatus,
    setLocationServicesEnabled,
    setLocationSupport,
    refreshTodayData,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!collectorsMayStart || !collectors.activity.enabled) {
      return;
    }

    let isCancelled = false;
    let handle: CollectorHandle | null = null;
    void (async () => {
      await enqueueBootstrapTask(async () => {
        if (isCancelled) {
          return;
        }

        const nextHandle = await startActivityCollectorModule({
          drainBufferedEvents: drainBufferedActivityTransitions,
          refreshRepository: refreshTodayData,
        });

        if (isCancelled) {
          nextHandle.stop();
          return;
        }

        handle = nextHandle;
      });
    })();

    return () => {
      isCancelled = true;
      handle?.stop();
    };
  }, [
    collectors.activity.enabled,
    drainBufferedActivityTransitions,
    collectorsMayStart,
    refreshTodayData,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!collectorsMayStart || !collectors.appUsage.enabled) {
      return;
    }

    let isCancelled = false;
    let handle: CollectorHandle | null = null;
    void (async () => {
      await enqueueBootstrapTask(async () => {
        if (isCancelled) {
          return;
        }

        const nextHandle = await startAppUsageCollectorModule({
          refreshRepository: refreshTodayData,
        });

        if (isCancelled) {
          nextHandle.stop();
          return;
        }

        handle = nextHandle;
      });
    })();

    return () => {
      isCancelled = true;
      handle?.stop();
    };
  }, [
    collectors.appUsage.enabled,
    collectorsMayStart,
    refreshTodayData,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!collectorsMayStart || !collectors.healthConnect.enabled) {
      return;
    }

    let isCancelled = false;
    let handle: CollectorHandle | null = null;
    void (async () => {
      await enqueueBootstrapTask(async () => {
        if (isCancelled) {
          return;
        }

        const nextHandle = await startHealthConnectCollectorModule({
          noteSyncWindowEnd:
            useRepositoryStore.getState().noteHealthSyncWindowEnd,
          refreshRepository: refreshAll,
        });

        if (isCancelled) {
          nextHandle.stop();
          return;
        }

        handle = nextHandle;
      });
    })();

    return () => {
      isCancelled = true;
      handle?.stop();
    };
  }, [
    collectors.healthConnect.enabled,
    collectorsMayStart,
    refreshAll,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!collectorsMayStart || !collectors.sleep.enabled) {
      return;
    }

    let isCancelled = false;
    let handle: CollectorHandle | null = null;
    void (async () => {
      await enqueueBootstrapTask(async () => {
        if (isCancelled) {
          return;
        }

        const nextHandle = await startSleepCollectorModule({
          refreshRepository: async () => {
            await refreshSleep();
            await refreshTodayData();
          },
        });

        if (isCancelled) {
          nextHandle.stop();
          return;
        }

        handle = nextHandle;
      });
    })();

    return () => {
      isCancelled = true;
      handle?.stop();
    };
  }, [
    collectors.sleep.enabled,
    collectorsMayStart,
    refreshSleep,
    refreshTodayData,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!collectorsMayStart || !collectors.ambientLight.enabled) {
      return;
    }

    let isCancelled = false;
    let handle: CollectorHandle | null = null;
    void (async () => {
      await enqueueBootstrapTask(async () => {
        if (isCancelled) {
          return;
        }

        const nextHandle = await startAmbientLightCollectorModule({
          refreshRepository: refreshTodayData,
          setAmbientLightSupport,
          setAmbientLightLux,
        });

        if (isCancelled) {
          nextHandle.stop();
          return;
        }

        handle = nextHandle;
      });
    })();

    return () => {
      isCancelled = true;
      handle?.stop();
    };
  }, [
    collectors.ambientLight.enabled,
    collectorsMayStart,
    refreshTodayData,
    setAmbientLightLux,
    setAmbientLightSupport,
    collectorRetryToken,
  ]);

  useEffect(() => {
    if (!collectorsMayStart || !collectors.motionContext.enabled) {
      return;
    }

    let isCancelled = false;
    let handle: CollectorHandle | null = null;
    void (async () => {
      await enqueueBootstrapTask(async () => {
        if (isCancelled) {
          return;
        }

        const nextHandle = await startMotionContextCollectorModule({
          refreshRepository: refreshTodayData,
        });

        if (isCancelled) {
          nextHandle.stop();
          return;
        }

        handle = nextHandle;
      });
    })();

    return () => {
      isCancelled = true;
      handle?.stop();
    };
  }, [
    collectors.motionContext.enabled,
    collectorsMayStart,
    refreshTodayData,
    collectorRetryToken,
  ]);

  const launchSettledRef = useRef(false);

  useEffect(() => {
    if (!isHydrated || !repositoryHydrated || !collectorsMayStart) {
      return;
    }

    async function runResumeReconcile(): Promise<void> {
      if (reconcileInFlightRef.current) {
        return reconcileInFlightRef.current;
      }

      if (Date.now() - lastResumeReconcileAtRef.current < 10_000) {
        return;
      }

      const task = enqueueBootstrapTask(async () => {
        lastResumeReconcileAtRef.current = Date.now();
        await runImportantCollectorReconcile({
          trigger: "foregroundResume",
        });
      });

      reconcileInFlightRef.current = task;

      try {
        await task;
      } finally {
        reconcileInFlightRef.current = null;
      }
    }

    // At launch each collector has just synced as it started, so a reconcile
    // would repeat that work. Only its housekeeping is left to do, unless a
    // start failed, in which case the reconcile is the retry.
    if (!launchSettledRef.current) {
      launchSettledRef.current = true;
      lastResumeReconcileAtRef.current = Date.now();
      void enqueueBootstrapTask(async () => {
        if (bootstrapTaskFailedRef.current) {
          bootstrapTaskFailedRef.current = false;
          // Already inside the queue: run it here, not through the queued path.
          await runImportantCollectorReconcile({ trigger: "foregroundResume" });
          return;
        }
        await compactEventChanges().catch(() => undefined);
        await pruneCollectorDiagnostics().catch(() => undefined);
      }).catch(() => undefined);
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        nextState === "active" &&
        (previousState === "background" || previousState === "inactive")
      ) {
        void runResumeReconcile().catch(() => undefined);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [
    collectorsMayStart,
    drainBufferedActivityTransitions,
    hasResumeReconcileCollectors,
    isHydrated,
    refreshAll,
    refreshSleep,
    refreshTodayData,
    repositoryHydrated,
  ]);

  useEffect(() => {
    if (!isHydrated || !repositoryHydrated) {
      return;
    }

    void syncBackgroundReconcileTaskRegistration(collectors);
  }, [collectors, isHydrated, lowPowerMode, repositoryHydrated]);

  useEffect(() => {
    if (!isHydrated || Platform.OS !== "android") {
      return;
    }

    let isCancelled = false;

    void enqueueBootstrapTask(async () => {
      if (isCancelled) {
        return;
      }

      if (!shouldRunAndroidBackgroundService) {
        await stopBackgroundCollectionServiceAsync();
        await refreshBackgroundCollectionServiceState();
        return;
      }

      await startBackgroundCollectionServiceAsync({
        trackActivity: trackBackgroundActivity,
        trackLocation: trackBackgroundLocation,
      });
      await refreshBackgroundCollectionServiceState();
    });

    return () => {
      isCancelled = true;
    };
  }, [
    isHydrated,
    refreshBackgroundCollectionServiceState,
    shouldRunAndroidBackgroundService,
    trackBackgroundActivity,
    trackBackgroundLocation,
  ]);
}

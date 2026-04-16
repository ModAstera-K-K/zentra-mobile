import { Platform } from "react-native";
import { create } from "zustand";

import type {
  CollectorDiagnosticRecord,
  DailyAggregateRecord,
  ReconcileOutcome,
  ReconcileTrigger,
  TodayLiveSnapshot,
  ZentraEventRecord,
} from "@/types/zentra";
import {
  appendEventsForCollector,
  clearRepositoryData as clearRepositoryDataFromDb,
  getCollectorDiagnosticsHistory,
  getDailyAggregateForDate,
  getEventsForRange,
  getLatestCollectorDiagnostics,
  getLatestEventByType,
  getTodayLiveSnapshot,
  initializeEventRepository,
} from "@/utils/event-repository";
import {
  loadPersistedRepositoryMeta,
  savePersistedRepositoryMeta,
} from "@/utils/app-storage";
import { createActivityEvent } from "@/utils/live-event-builders";
import {
  acknowledgeBufferedActivityTransitionsAsync,
  getBufferedActivityTransitionCountAsync,
  isBackgroundCollectionServiceRunningAsync,
  readBufferedActivityTransitionsAsync,
  readBufferedActivityTransitionsSinceAsync,
} from "@/utils/native/zentra-native-signals";
import { toISODate } from "@/utils/dates";

const EMPTY_TODAY_SNAPSHOT: TodayLiveSnapshot = {
  stepCount: null,
  stepLastUpdatedAt: null,
  batteryLevel: null,
  batteryStateLabel: null,
  lowPowerMode: null,
  batteryLastUpdatedAt: null,
  locationSamples: [],
  locationLastUpdatedAt: null,
};

const MIN_TODAY_REFRESH_INTERVAL_MS = 1_500;

/**
 * Return the existing array if contents haven't changed (same length + same
 * last event ID), avoiding unnecessary downstream re-renders.
 */
function stableEvents(
  prev: ZentraEventRecord[],
  next: ZentraEventRecord[],
): ZentraEventRecord[] {
  if (
    prev.length === next.length &&
    prev[prev.length - 1]?.id === next[next.length - 1]?.id
  ) {
    return prev;
  }
  return next;
}

let lastTodayRefreshCompletedAtMs = 0;
let refreshTodayDataInFlight: Promise<void> | null = null;

interface DrainBufferedActivityOptions {
  batchSize?: number;
  maxBatches?: number;
}

interface ReconcileCompletionMeta {
  boundedReason?: string | null;
  durationMs: number;
  errorMessage?: string | null;
  finishedAt?: string;
  outcome: ReconcileOutcome;
  trigger: ReconcileTrigger;
}

interface RepositoryStoreState {
  backgroundCollectionServiceCheckedAt: string | null;
  backgroundCollectionServiceState: string | null;
  backgroundTaskRegistrationCheckedAt: string | null;
  backgroundTaskRegistrationMessage: string | null;
  backgroundTaskRegistrationStatus: string | null;
  bufferedActivityQueueDepth: number;
  isHydrated: boolean;
  lastBufferedActivityCursor: number | null;
  lastBackgroundReconcileAt: string | null;
  lastBackgroundTaskFailureAt: string | null;
  lastBackgroundTaskFailureMessage: string | null;
  lastBackgroundTaskSuccessAt: string | null;
  lastForegroundResumeReconcileAt: string | null;
  lastHealthSyncWindowEndAt: string | null;
  lastNativeIngestionCount: number | null;
  lastNativeDrainAt: string | null;
  lastReconcileBoundedReason: string | null;
  lastReconcileDurationMs: number | null;
  lastReconcileFailureMessage: string | null;
  lastReconcileFinishedAt: string | null;
  lastReconcileOutcome: ReconcileOutcome | null;
  lastReconcileRunAt: string | null;
  lastReconcileStartedAt: string | null;
  lastReconcileTrigger: ReconcileTrigger | null;
  lastUpdatedAt: string | null;
  todayDataUpdatedAt: string | null;
  diagnosticsUpdatedAt: string | null;
  sleepUpdatedAt: string | null;
  todaySnapshot: TodayLiveSnapshot;
  todayAggregate: DailyAggregateRecord | null;
  todayEvents: ZentraEventRecord[];
  latestSleepEvent: ZentraEventRecord | null;
  diagnostics: CollectorDiagnosticRecord[];
  diagnosticsHistory: CollectorDiagnosticRecord[];
  bootstrap: () => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshTodayData: () => Promise<void>;
  refreshDiagnostics: () => Promise<void>;
  refreshSleep: () => Promise<void>;
  drainBufferedActivityTransitions: (
    options?: DrainBufferedActivityOptions,
  ) => Promise<number>;
  noteBackgroundTaskFailure: (message: string) => Promise<void>;
  noteBackgroundTaskRegistrationState: (
    status: string,
    message?: string | null,
  ) => Promise<void>;
  refreshBackgroundCollectionServiceState: () => Promise<string>;
  noteHealthSyncWindowEnd: (timestamp: string) => Promise<void>;
  noteBackgroundTaskSuccess: () => Promise<void>;
  noteReconcileFinish: (details: ReconcileCompletionMeta) => Promise<void>;
  noteReconcileStart: (trigger: ReconcileTrigger) => Promise<void>;
  refreshBufferedActivityQueueDepth: () => Promise<number>;
  clearRepositoryData: () => Promise<void>;
}

async function persistRepositoryMeta(
  state: RepositoryStoreState,
): Promise<void> {
  await savePersistedRepositoryMeta({
    backgroundCollectionServiceCheckedAt:
      state.backgroundCollectionServiceCheckedAt,
    backgroundCollectionServiceState: state.backgroundCollectionServiceState,
    backgroundTaskRegistrationCheckedAt:
      state.backgroundTaskRegistrationCheckedAt,
    backgroundTaskRegistrationMessage: state.backgroundTaskRegistrationMessage,
    backgroundTaskRegistrationStatus: state.backgroundTaskRegistrationStatus,
    bufferedActivityQueueDepth: state.bufferedActivityQueueDepth,
    lastBufferedActivityCursor: state.lastBufferedActivityCursor,
    lastBackgroundReconcileAt: state.lastBackgroundReconcileAt,
    lastBackgroundTaskFailureAt: state.lastBackgroundTaskFailureAt,
    lastBackgroundTaskFailureMessage: state.lastBackgroundTaskFailureMessage,
    lastBackgroundTaskSuccessAt: state.lastBackgroundTaskSuccessAt,
    lastForegroundResumeReconcileAt: state.lastForegroundResumeReconcileAt,
    lastHealthSyncWindowEndAt: state.lastHealthSyncWindowEndAt,
    lastNativeIngestionCount: state.lastNativeIngestionCount,
    lastNativeDrainAt: state.lastNativeDrainAt,
    lastReconcileBoundedReason: state.lastReconcileBoundedReason,
    lastReconcileDurationMs: state.lastReconcileDurationMs,
    lastReconcileFailureMessage: state.lastReconcileFailureMessage,
    lastReconcileFinishedAt: state.lastReconcileFinishedAt,
    lastReconcileOutcome: state.lastReconcileOutcome,
    lastReconcileRunAt: state.lastReconcileRunAt,
    lastReconcileStartedAt: state.lastReconcileStartedAt,
    lastReconcileTrigger: state.lastReconcileTrigger,
  });
}

export const useRepositoryStore = create<RepositoryStoreState>((set, get) => ({
  backgroundCollectionServiceCheckedAt: null,
  backgroundCollectionServiceState: null,
  backgroundTaskRegistrationCheckedAt: null,
  backgroundTaskRegistrationMessage: null,
  backgroundTaskRegistrationStatus: null,
  bufferedActivityQueueDepth: 0,
  isHydrated: false,
  lastBufferedActivityCursor: null,
  lastBackgroundReconcileAt: null,
  lastBackgroundTaskFailureAt: null,
  lastBackgroundTaskFailureMessage: null,
  lastBackgroundTaskSuccessAt: null,
  lastForegroundResumeReconcileAt: null,
  lastHealthSyncWindowEndAt: null,
  lastNativeIngestionCount: null,
  lastNativeDrainAt: null,
  lastReconcileBoundedReason: null,
  lastReconcileDurationMs: null,
  lastReconcileFailureMessage: null,
  lastReconcileFinishedAt: null,
  lastReconcileOutcome: null,
  lastReconcileRunAt: null,
  lastReconcileStartedAt: null,
  lastReconcileTrigger: null,
  lastUpdatedAt: null,
  todayDataUpdatedAt: null,
  diagnosticsUpdatedAt: null,
  sleepUpdatedAt: null,
  todaySnapshot: EMPTY_TODAY_SNAPSHOT,
  todayAggregate: null,
  todayEvents: [],
  latestSleepEvent: null,
  diagnostics: [],
  diagnosticsHistory: [],

  bootstrap: async () => {
    if (get().isHydrated) {
      return;
    }

    await initializeEventRepository();
    const persistedMeta = await loadPersistedRepositoryMeta();
    const bufferedActivityQueueDepth =
      await getBufferedActivityTransitionCountAsync();
    const todayDate = toISODate(new Date());
    const [
      todaySnapshot,
      diagnostics,
      diagnosticsHistory,
      todayAggregate,
      latestSleepEvent,
      todayEvents,
    ] = await Promise.all([
      getTodayLiveSnapshot(),
      getLatestCollectorDiagnostics(),
      getCollectorDiagnosticsHistory(),
      getDailyAggregateForDate(todayDate),
      getLatestEventByType("sleep_inferred"),
      getEventsForRange(todayDate, todayDate),
    ]);

    const updatedAt = new Date().toISOString();

    set({
      backgroundCollectionServiceCheckedAt:
        persistedMeta?.backgroundCollectionServiceCheckedAt ?? null,
      backgroundCollectionServiceState:
        persistedMeta?.backgroundCollectionServiceState ?? null,
      backgroundTaskRegistrationCheckedAt:
        persistedMeta?.backgroundTaskRegistrationCheckedAt ?? null,
      backgroundTaskRegistrationMessage:
        persistedMeta?.backgroundTaskRegistrationMessage ?? null,
      backgroundTaskRegistrationStatus:
        persistedMeta?.backgroundTaskRegistrationStatus ?? null,
      isHydrated: true,
      bufferedActivityQueueDepth,
      lastBufferedActivityCursor:
        persistedMeta?.lastBufferedActivityCursor ?? null,
      lastBackgroundReconcileAt:
        persistedMeta?.lastBackgroundReconcileAt ?? null,
      lastBackgroundTaskFailureAt:
        persistedMeta?.lastBackgroundTaskFailureAt ?? null,
      lastBackgroundTaskFailureMessage:
        persistedMeta?.lastBackgroundTaskFailureMessage ?? null,
      lastBackgroundTaskSuccessAt:
        persistedMeta?.lastBackgroundTaskSuccessAt ?? null,
      lastForegroundResumeReconcileAt:
        persistedMeta?.lastForegroundResumeReconcileAt ?? null,
      lastHealthSyncWindowEndAt:
        persistedMeta?.lastHealthSyncWindowEndAt ?? null,
      lastNativeIngestionCount: persistedMeta?.lastNativeIngestionCount ?? null,
      lastNativeDrainAt: persistedMeta?.lastNativeDrainAt ?? null,
      lastReconcileBoundedReason:
        persistedMeta?.lastReconcileBoundedReason ?? null,
      lastReconcileDurationMs: persistedMeta?.lastReconcileDurationMs ?? null,
      lastReconcileFailureMessage:
        persistedMeta?.lastReconcileFailureMessage ?? null,
      lastReconcileFinishedAt: persistedMeta?.lastReconcileFinishedAt ?? null,
      lastReconcileOutcome: persistedMeta?.lastReconcileOutcome ?? null,
      lastReconcileRunAt: persistedMeta?.lastReconcileRunAt ?? null,
      lastReconcileStartedAt: persistedMeta?.lastReconcileStartedAt ?? null,
      lastReconcileTrigger: persistedMeta?.lastReconcileTrigger ?? null,
      lastUpdatedAt: updatedAt,
      todayDataUpdatedAt: updatedAt,
      diagnosticsUpdatedAt: updatedAt,
      sleepUpdatedAt: updatedAt,
      todaySnapshot,
      todayAggregate,
      todayEvents,
      latestSleepEvent,
      diagnostics,
      diagnosticsHistory,
    });
  },

  refreshAll: async () => {
    await initializeEventRepository();
    const bufferedActivityQueueDepth =
      await getBufferedActivityTransitionCountAsync();
    const backgroundCollectionServiceState =
      await get().refreshBackgroundCollectionServiceState();
    const todayDate = toISODate(new Date());
    const [
      todaySnapshot,
      diagnostics,
      diagnosticsHistory,
      todayAggregate,
      latestSleepEvent,
      todayEvents,
    ] = await Promise.all([
      getTodayLiveSnapshot(),
      getLatestCollectorDiagnostics(),
      getCollectorDiagnosticsHistory(),
      getDailyAggregateForDate(todayDate),
      getLatestEventByType("sleep_inferred"),
      getEventsForRange(todayDate, todayDate),
    ]);

    const updatedAt = new Date().toISOString();

    set({
      isHydrated: true,
      backgroundCollectionServiceCheckedAt: new Date().toISOString(),
      backgroundCollectionServiceState,
      bufferedActivityQueueDepth,
      lastUpdatedAt: updatedAt,
      todayDataUpdatedAt: updatedAt,
      diagnosticsUpdatedAt: updatedAt,
      sleepUpdatedAt: updatedAt,
      todaySnapshot,
      todayAggregate,
      todayEvents,
      latestSleepEvent,
      diagnostics,
      diagnosticsHistory,
    });
  },

  refreshTodayData: async () => {
    if (refreshTodayDataInFlight) {
      return refreshTodayDataInFlight;
    }

    if (
      Date.now() - lastTodayRefreshCompletedAtMs <
      MIN_TODAY_REFRESH_INTERVAL_MS
    ) {
      return;
    }

    refreshTodayDataInFlight = (async () => {
      const todayDate = toISODate(new Date());
      const [todaySnapshot, todayAggregate, todayEvents] = await Promise.all([
        getTodayLiveSnapshot(),
        getDailyAggregateForDate(todayDate),
        getEventsForRange(todayDate, todayDate),
      ]);

      const updatedAt = new Date().toISOString();
      const stableTodayEvents = stableEvents(get().todayEvents, todayEvents);

      set({
        lastUpdatedAt: updatedAt,
        todayDataUpdatedAt: updatedAt,
        todaySnapshot,
        todayAggregate,
        todayEvents: stableTodayEvents,
      });

      lastTodayRefreshCompletedAtMs = Date.now();
    })();

    try {
      await refreshTodayDataInFlight;
    } finally {
      refreshTodayDataInFlight = null;
    }
  },

  refreshDiagnostics: async () => {
    const bufferedActivityQueueDepth =
      await getBufferedActivityTransitionCountAsync();
    const backgroundCollectionServiceState =
      await get().refreshBackgroundCollectionServiceState();
    const [diagnostics, diagnosticsHistory] = await Promise.all([
      getLatestCollectorDiagnostics(),
      getCollectorDiagnosticsHistory(),
    ]);

    const updatedAt = new Date().toISOString();

    set({
      backgroundCollectionServiceCheckedAt: new Date().toISOString(),
      backgroundCollectionServiceState,
      lastUpdatedAt: updatedAt,
      bufferedActivityQueueDepth,
      diagnosticsUpdatedAt: updatedAt,
      diagnostics,
      diagnosticsHistory,
    });
  },

  refreshBackgroundCollectionServiceState: async () => {
    const nextState =
      Platform.OS !== "android"
        ? "unsupported"
        : (await isBackgroundCollectionServiceRunningAsync())
          ? "running"
          : "stopped";

    set({
      backgroundCollectionServiceCheckedAt: new Date().toISOString(),
      backgroundCollectionServiceState: nextState,
    });
    await persistRepositoryMeta(get());
    return nextState;
  },

  refreshSleep: async () => {
    const todayDate = toISODate(new Date());
    const [latestSleepEvent, todayAggregate] = await Promise.all([
      getLatestEventByType("sleep_inferred"),
      getDailyAggregateForDate(todayDate),
    ]);

    const updatedAt = new Date().toISOString();

    set({
      lastUpdatedAt: updatedAt,
      sleepUpdatedAt: updatedAt,
      latestSleepEvent,
      todayAggregate,
    });
  },

  drainBufferedActivityTransitions: async (options) => {
    const batchSize = options?.batchSize ?? 250;
    const maxBatches = options?.maxBatches ?? Number.POSITIVE_INFINITY;
    let cursor = get().lastBufferedActivityCursor;
    let totalDrained = 0;
    let latestDrainAt: string | null = null;
    let drainedBatches = 0;

    while (drainedBatches < maxBatches) {
      const transitions = await readBufferedActivityTransitionsSinceAsync(
        cursor,
        batchSize,
      );

      if (!transitions.length) {
        break;
      }

      await appendEventsForCollector(
        "activity",
        transitions.map((transition) =>
          createActivityEvent(transition, "native_buffered"),
        ),
        `Buffered activity transitions drained ${transitions.length} event(s)`,
      );
      await acknowledgeBufferedActivityTransitionsAsync(
        transitions.map((transition) => transition.id),
      );

      cursor = transitions.at(-1)?.cursor ?? cursor;
      totalDrained += transitions.length;
      drainedBatches += 1;
      latestDrainAt = new Date().toISOString();

      if (transitions.length < batchSize) {
        break;
      }
    }

    const bufferedActivityQueueDepth =
      await getBufferedActivityTransitionCountAsync();

    if (!totalDrained) {
      set({ bufferedActivityQueueDepth });
      await persistRepositoryMeta(get());
      return 0;
    }

    set({
      bufferedActivityQueueDepth,
      lastBufferedActivityCursor: cursor,
      lastNativeIngestionCount: totalDrained,
      lastNativeDrainAt: latestDrainAt,
    });
    await persistRepositoryMeta(get());

    return totalDrained;
  },

  noteBackgroundTaskSuccess: async () => {
    set({
      lastBackgroundTaskFailureAt: null,
      lastBackgroundTaskFailureMessage: null,
      lastBackgroundTaskSuccessAt: new Date().toISOString(),
    });
    await persistRepositoryMeta(get());
  },

  noteBackgroundTaskFailure: async (message) => {
    set({
      lastBackgroundTaskFailureAt: new Date().toISOString(),
      lastBackgroundTaskFailureMessage: message,
    });
    await persistRepositoryMeta(get());
  },

  noteBackgroundTaskRegistrationState: async (status, message = null) => {
    set({
      backgroundTaskRegistrationCheckedAt: new Date().toISOString(),
      backgroundTaskRegistrationMessage: message,
      backgroundTaskRegistrationStatus: status,
    });
    await persistRepositoryMeta(get());
  },

  noteHealthSyncWindowEnd: async (timestamp) => {
    set({ lastHealthSyncWindowEndAt: timestamp });
    await persistRepositoryMeta(get());
  },

  noteReconcileStart: async (trigger) => {
    set({
      lastReconcileBoundedReason: null,
      lastReconcileDurationMs: null,
      lastReconcileFailureMessage: null,
      lastReconcileFinishedAt: null,
      lastReconcileOutcome: null,
      lastReconcileStartedAt: new Date().toISOString(),
      lastReconcileTrigger: trigger,
    });
    await persistRepositoryMeta(get());
  },

  noteReconcileFinish: async ({
    boundedReason = null,
    durationMs,
    errorMessage = null,
    finishedAt,
    outcome,
    trigger,
  }) => {
    const completedAt = finishedAt ?? new Date().toISOString();
    set({
      lastBackgroundReconcileAt:
        trigger === "backgroundTask"
          ? completedAt
          : get().lastBackgroundReconcileAt,
      lastForegroundResumeReconcileAt:
        trigger === "foregroundResume"
          ? completedAt
          : get().lastForegroundResumeReconcileAt,
      lastReconcileBoundedReason: boundedReason,
      lastReconcileDurationMs: durationMs,
      lastReconcileFailureMessage: errorMessage,
      lastReconcileFinishedAt: completedAt,
      lastReconcileOutcome: outcome,
      lastReconcileRunAt: completedAt,
      lastReconcileTrigger: trigger,
    });
    await persistRepositoryMeta(get());
  },

  refreshBufferedActivityQueueDepth: async () => {
    const bufferedActivityQueueDepth =
      await getBufferedActivityTransitionCountAsync();
    set({ bufferedActivityQueueDepth });
    await persistRepositoryMeta(get());
    return bufferedActivityQueueDepth;
  },

  clearRepositoryData: async () => {
    await clearRepositoryDataFromDb();
    const updatedAt = new Date().toISOString();

    set({
      backgroundCollectionServiceCheckedAt: null,
      backgroundCollectionServiceState: null,
      backgroundTaskRegistrationCheckedAt: null,
      backgroundTaskRegistrationMessage: null,
      backgroundTaskRegistrationStatus: null,
      bufferedActivityQueueDepth: 0,
      isHydrated: true,
      lastBufferedActivityCursor: null,
      lastBackgroundReconcileAt: null,
      lastBackgroundTaskFailureAt: null,
      lastBackgroundTaskFailureMessage: null,
      lastBackgroundTaskSuccessAt: null,
      lastForegroundResumeReconcileAt: null,
      lastHealthSyncWindowEndAt: null,
      lastNativeIngestionCount: null,
      lastNativeDrainAt: null,
      lastReconcileBoundedReason: null,
      lastReconcileDurationMs: null,
      lastReconcileFailureMessage: null,
      lastReconcileFinishedAt: null,
      lastReconcileOutcome: null,
      lastReconcileRunAt: null,
      lastReconcileStartedAt: null,
      lastReconcileTrigger: null,
      lastUpdatedAt: updatedAt,
      todayDataUpdatedAt: updatedAt,
      diagnosticsUpdatedAt: updatedAt,
      sleepUpdatedAt: updatedAt,
      todaySnapshot: EMPTY_TODAY_SNAPSHOT,
      todayAggregate: null,
      todayEvents: [],
      latestSleepEvent: null,
      diagnostics: [],
      diagnosticsHistory: [],
    });
    await persistRepositoryMeta(get());
  },
}));

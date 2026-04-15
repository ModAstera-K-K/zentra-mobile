import { create } from "zustand";

import type {
  CollectorDiagnosticRecord,
  DailyAggregateRecord,
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
  readBufferedActivityTransitionsAsync,
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

interface RepositoryStoreState {
  backgroundTaskRegistrationCheckedAt: string | null;
  backgroundTaskRegistrationMessage: string | null;
  backgroundTaskRegistrationStatus: string | null;
  bufferedActivityQueueDepth: number;
  isHydrated: boolean;
  lastBackgroundTaskFailureAt: string | null;
  lastBackgroundTaskFailureMessage: string | null;
  lastBackgroundTaskSuccessAt: string | null;
  lastReconcileRunAt: string | null;
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
  drainBufferedActivityTransitions: () => Promise<number>;
  noteBackgroundTaskFailure: (message: string) => Promise<void>;
  noteBackgroundTaskRegistrationState: (
    status: string,
    message?: string | null,
  ) => Promise<void>;
  noteBackgroundTaskSuccess: () => Promise<void>;
  noteReconcileRun: () => Promise<void>;
  refreshBufferedActivityQueueDepth: () => Promise<number>;
  clearRepositoryData: () => Promise<void>;
}

async function persistRepositoryMeta(state: RepositoryStoreState): Promise<void> {
  await savePersistedRepositoryMeta({
    backgroundTaskRegistrationCheckedAt:
      state.backgroundTaskRegistrationCheckedAt,
    backgroundTaskRegistrationMessage: state.backgroundTaskRegistrationMessage,
    backgroundTaskRegistrationStatus: state.backgroundTaskRegistrationStatus,
    bufferedActivityQueueDepth: state.bufferedActivityQueueDepth,
    lastBackgroundTaskFailureAt: state.lastBackgroundTaskFailureAt,
    lastBackgroundTaskFailureMessage: state.lastBackgroundTaskFailureMessage,
    lastBackgroundTaskSuccessAt: state.lastBackgroundTaskSuccessAt,
    lastReconcileRunAt: state.lastReconcileRunAt,
  });
}

export const useRepositoryStore = create<RepositoryStoreState>((set, get) => ({
  backgroundTaskRegistrationCheckedAt: null,
  backgroundTaskRegistrationMessage: null,
  backgroundTaskRegistrationStatus: null,
  bufferedActivityQueueDepth: 0,
  isHydrated: false,
  lastBackgroundTaskFailureAt: null,
  lastBackgroundTaskFailureMessage: null,
  lastBackgroundTaskSuccessAt: null,
  lastReconcileRunAt: null,
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
      (await readBufferedActivityTransitionsAsync()).length;
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
      backgroundTaskRegistrationCheckedAt:
        persistedMeta?.backgroundTaskRegistrationCheckedAt ?? null,
      backgroundTaskRegistrationMessage:
        persistedMeta?.backgroundTaskRegistrationMessage ?? null,
      backgroundTaskRegistrationStatus:
        persistedMeta?.backgroundTaskRegistrationStatus ?? null,
      isHydrated: true,
      bufferedActivityQueueDepth,
      lastBackgroundTaskFailureAt:
        persistedMeta?.lastBackgroundTaskFailureAt ?? null,
      lastBackgroundTaskFailureMessage:
        persistedMeta?.lastBackgroundTaskFailureMessage ?? null,
      lastBackgroundTaskSuccessAt:
        persistedMeta?.lastBackgroundTaskSuccessAt ?? null,
      lastReconcileRunAt: persistedMeta?.lastReconcileRunAt ?? null,
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
      (await readBufferedActivityTransitionsAsync()).length;
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
      (await readBufferedActivityTransitionsAsync()).length;
    const [diagnostics, diagnosticsHistory] = await Promise.all([
      getLatestCollectorDiagnostics(),
      getCollectorDiagnosticsHistory(),
    ]);

    const updatedAt = new Date().toISOString();

    set({
      lastUpdatedAt: updatedAt,
      bufferedActivityQueueDepth,
      diagnosticsUpdatedAt: updatedAt,
      diagnostics,
      diagnosticsHistory,
    });
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

  drainBufferedActivityTransitions: async () => {
    const transitions = await readBufferedActivityTransitionsAsync();

    if (!transitions.length) {
      set({ bufferedActivityQueueDepth: 0 });
      await persistRepositoryMeta(get());
      return 0;
    }

    await appendEventsForCollector(
      "activity",
      transitions.map(createActivityEvent),
      `Buffered activity transitions drained ${transitions.length} event(s)`,
    );
    await acknowledgeBufferedActivityTransitionsAsync(
      transitions.map((transition) => transition.id),
    );

    set({ bufferedActivityQueueDepth: 0 });
    await persistRepositoryMeta(get());

    return transitions.length;
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

  noteReconcileRun: async () => {
    set({ lastReconcileRunAt: new Date().toISOString() });
    await persistRepositoryMeta(get());
  },

  refreshBufferedActivityQueueDepth: async () => {
    const bufferedActivityQueueDepth =
      (await readBufferedActivityTransitionsAsync()).length;
    set({ bufferedActivityQueueDepth });
    await persistRepositoryMeta(get());
    return bufferedActivityQueueDepth;
  },

  clearRepositoryData: async () => {
    await clearRepositoryDataFromDb();
    const updatedAt = new Date().toISOString();

    set({
      backgroundTaskRegistrationCheckedAt: null,
      backgroundTaskRegistrationMessage: null,
      backgroundTaskRegistrationStatus: null,
      bufferedActivityQueueDepth: 0,
      isHydrated: true,
      lastBackgroundTaskFailureAt: null,
      lastBackgroundTaskFailureMessage: null,
      lastBackgroundTaskSuccessAt: null,
      lastReconcileRunAt: null,
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

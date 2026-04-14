import { create } from "zustand";

import type {
  CollectorDiagnosticRecord,
  DailyAggregateRecord,
  TodayLiveSnapshot,
  ZentraEventRecord,
} from "@/types/zentra";
import {
  clearRepositoryData as clearRepositoryDataFromDb,
  getCollectorDiagnosticsHistory,
  getDailyAggregateForDate,
  getEventsForRange,
  getLatestCollectorDiagnostics,
  getLatestEventByType,
  getTodayLiveSnapshot,
  initializeEventRepository,
} from "@/utils/event-repository";
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

let lastTodayRefreshCompletedAtMs = 0;
let refreshTodayDataInFlight: Promise<void> | null = null;

interface RepositoryStoreState {
  isHydrated: boolean;
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
  clearRepositoryData: () => Promise<void>;
}

export const useRepositoryStore = create<RepositoryStoreState>((set, get) => ({
  isHydrated: false,
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

      set({
        lastUpdatedAt: updatedAt,
        todayDataUpdatedAt: updatedAt,
        todaySnapshot,
        todayAggregate,
        todayEvents,
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
    const [diagnostics, diagnosticsHistory] = await Promise.all([
      getLatestCollectorDiagnostics(),
      getCollectorDiagnosticsHistory(),
    ]);

    const updatedAt = new Date().toISOString();

    set({
      lastUpdatedAt: updatedAt,
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

  clearRepositoryData: async () => {
    await clearRepositoryDataFromDb();
    const updatedAt = new Date().toISOString();

    set({
      isHydrated: true,
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
  },
}));

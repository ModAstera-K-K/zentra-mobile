import { create } from 'zustand';

import type {
  CollectorDiagnosticRecord,
  DailyAggregateRecord,
  TodayLiveSnapshot,
  ZentraEventRecord,
} from '@/types/zentra';
import {
  clearRepositoryData as clearRepositoryDataFromDb,
  getCollectorDiagnosticsHistory,
  getDailyAggregateForDate,
  getLatestCollectorDiagnostics,
  getLatestEventByType,
  getTodayLiveSnapshot,
  initializeEventRepository,
} from '@/utils/event-repository';
import { toISODate } from '@/utils/dates';

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

interface RepositoryStoreState {
  isHydrated: boolean;
  lastUpdatedAt: string | null;
  todaySnapshot: TodayLiveSnapshot;
  todayAggregate: DailyAggregateRecord | null;
  latestSleepEvent: ZentraEventRecord | null;
  diagnostics: CollectorDiagnosticRecord[];
  diagnosticsHistory: CollectorDiagnosticRecord[];
  bootstrap: () => Promise<void>;
  refreshAll: () => Promise<void>;
  clearRepositoryData: () => Promise<void>;
}

export const useRepositoryStore = create<RepositoryStoreState>((set, get) => ({
  isHydrated: false,
  lastUpdatedAt: null,
  todaySnapshot: EMPTY_TODAY_SNAPSHOT,
  todayAggregate: null,
  latestSleepEvent: null,
  diagnostics: [],
  diagnosticsHistory: [],

  bootstrap: async () => {
    if (get().isHydrated) {
      return;
    }

    await initializeEventRepository();
    const [todaySnapshot, diagnostics, diagnosticsHistory, todayAggregate, latestSleepEvent] = await Promise.all([
      getTodayLiveSnapshot(),
      getLatestCollectorDiagnostics(),
      getCollectorDiagnosticsHistory(),
      getDailyAggregateForDate(toISODate(new Date())),
      getLatestEventByType('sleep_inferred'),
    ]);

    set({
      isHydrated: true,
      lastUpdatedAt: new Date().toISOString(),
      todaySnapshot,
      todayAggregate,
      latestSleepEvent,
      diagnostics,
      diagnosticsHistory,
    });
  },

  refreshAll: async () => {
    await initializeEventRepository();
    const [todaySnapshot, diagnostics, diagnosticsHistory, todayAggregate, latestSleepEvent] = await Promise.all([
      getTodayLiveSnapshot(),
      getLatestCollectorDiagnostics(),
      getCollectorDiagnosticsHistory(),
      getDailyAggregateForDate(toISODate(new Date())),
      getLatestEventByType('sleep_inferred'),
    ]);

    set({
      isHydrated: true,
      lastUpdatedAt: new Date().toISOString(),
      todaySnapshot,
      todayAggregate,
      latestSleepEvent,
      diagnostics,
      diagnosticsHistory,
    });
  },

  clearRepositoryData: async () => {
    await clearRepositoryDataFromDb();
    set({
      isHydrated: true,
      lastUpdatedAt: new Date().toISOString(),
      todaySnapshot: EMPTY_TODAY_SNAPSHOT,
      todayAggregate: null,
      latestSleepEvent: null,
      diagnostics: [],
      diagnosticsHistory: [],
    });
  },
}));

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
  getEventsForRange,
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
  todayEvents: ZentraEventRecord[];
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
    const [todaySnapshot, diagnostics, diagnosticsHistory, todayAggregate, latestSleepEvent, todayEvents] = await Promise.all([
      getTodayLiveSnapshot(),
      getLatestCollectorDiagnostics(),
      getCollectorDiagnosticsHistory(),
      getDailyAggregateForDate(todayDate),
      getLatestEventByType('sleep_inferred'),
      getEventsForRange(todayDate, todayDate),
    ]);

    set({
      isHydrated: true,
      lastUpdatedAt: new Date().toISOString(),
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
    const [todaySnapshot, diagnostics, diagnosticsHistory, todayAggregate, latestSleepEvent, todayEvents] = await Promise.all([
      getTodayLiveSnapshot(),
      getLatestCollectorDiagnostics(),
      getCollectorDiagnosticsHistory(),
      getDailyAggregateForDate(todayDate),
      getLatestEventByType('sleep_inferred'),
      getEventsForRange(todayDate, todayDate),
    ]);

    set({
      isHydrated: true,
      lastUpdatedAt: new Date().toISOString(),
      todaySnapshot,
      todayAggregate,
      todayEvents,
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
      todayEvents: [],
      latestSleepEvent: null,
      diagnostics: [],
      diagnosticsHistory: [],
    });
  },
}));

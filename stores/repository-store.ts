import { create } from 'zustand';

import type {
  CollectorDiagnosticRecord,
  TodayLiveSnapshot,
} from '@/types/zentra';
import {
  clearRepositoryData as clearRepositoryDataFromDb,
  getLatestCollectorDiagnostics,
  getTodayLiveSnapshot,
  initializeEventRepository,
} from '@/utils/event-repository';

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
  diagnostics: CollectorDiagnosticRecord[];
  bootstrap: () => Promise<void>;
  refreshAll: () => Promise<void>;
  clearRepositoryData: () => Promise<void>;
}

export const useRepositoryStore = create<RepositoryStoreState>((set, get) => ({
  isHydrated: false,
  lastUpdatedAt: null,
  todaySnapshot: EMPTY_TODAY_SNAPSHOT,
  diagnostics: [],

  bootstrap: async () => {
    if (get().isHydrated) {
      return;
    }

    await initializeEventRepository();
    const [todaySnapshot, diagnostics] = await Promise.all([
      getTodayLiveSnapshot(),
      getLatestCollectorDiagnostics(),
    ]);

    set({
      isHydrated: true,
      lastUpdatedAt: new Date().toISOString(),
      todaySnapshot,
      diagnostics,
    });
  },

  refreshAll: async () => {
    await initializeEventRepository();
    const [todaySnapshot, diagnostics] = await Promise.all([
      getTodayLiveSnapshot(),
      getLatestCollectorDiagnostics(),
    ]);

    set({
      isHydrated: true,
      lastUpdatedAt: new Date().toISOString(),
      todaySnapshot,
      diagnostics,
    });
  },

  clearRepositoryData: async () => {
    await clearRepositoryDataFromDb();
    set({
      isHydrated: true,
      lastUpdatedAt: new Date().toISOString(),
      todaySnapshot: EMPTY_TODAY_SNAPSHOT,
      diagnostics: [],
    });
  },
}));

import { create } from 'zustand';

import type { CollectorKey, CollectorState, DataMode } from '@/types/zentra';
import { createInitialCollectors } from '@/utils/mock-data';
import { loadPersistedAppState, savePersistedAppState } from '@/utils/app-storage';

type CollectorStateMap = Record<CollectorKey, CollectorState>;

interface AppState {
  isHydrated: boolean;
  hasCompletedOnboarding: boolean;
  lastExportedAt: string | null;
  dataMode: DataMode;
  collectors: CollectorStateMap;
  collectorRetryToken: number;
  bootstrap: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  setCollectorEnabled: (key: CollectorKey, enabled: boolean) => Promise<void>;
  setDataMode: (mode: DataMode) => Promise<void>;
  clearAllData: () => Promise<void>;
  noteExport: (timestamp: string) => Promise<void>;
  retryCollectors: () => Promise<void>;
}

async function persistState(state: AppState): Promise<void> {
  await savePersistedAppState({
    hasCompletedOnboarding: state.hasCompletedOnboarding,
    lastExportedAt: state.lastExportedAt,
    dataMode: state.dataMode,
    collectors: state.collectors,
  });
}

function mergeCollectorsWithDefaults(
  persistedCollectors: Partial<CollectorStateMap> | undefined,
): CollectorStateMap {
  return {
    ...createInitialCollectors(),
    ...persistedCollectors,
  };
}

function buildUpdatedCollector(collector: CollectorState, enabled: boolean): CollectorState {
  return {
    ...collector,
    enabled,
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  isHydrated: false,
  hasCompletedOnboarding: false,
  lastExportedAt: null,
  dataMode: 'live',
  collectors: createInitialCollectors(),
  collectorRetryToken: 0,

  bootstrap: async () => {
    if (get().isHydrated) {
      return;
    }

    const persisted = await loadPersistedAppState();

    set({
      isHydrated: true,
      hasCompletedOnboarding: persisted?.hasCompletedOnboarding ?? false,
      lastExportedAt: persisted?.lastExportedAt ?? null,
      dataMode: persisted?.dataMode ?? 'live',
      collectors: mergeCollectorsWithDefaults(persisted?.collectors),
    });
  },

  completeOnboarding: async () => {
    set({ hasCompletedOnboarding: true });
    await persistState(get());
  },

  setCollectorEnabled: async (key, enabled) => {
    const nextCollectors = {
      ...get().collectors,
      [key]: buildUpdatedCollector(get().collectors[key], enabled),
    };

    set({ collectors: nextCollectors });
    await persistState(get());
  },

  setDataMode: async (dataMode) => {
    set({ dataMode });
    await persistState(get());
  },

  clearAllData: async () => {
    set({ lastExportedAt: null });
    await persistState(get());
  },

  noteExport: async (timestamp) => {
    set({ lastExportedAt: timestamp });
    await persistState(get());
  },

  retryCollectors: async () => {
    set({ collectorRetryToken: get().collectorRetryToken + 1 });
  },
}));

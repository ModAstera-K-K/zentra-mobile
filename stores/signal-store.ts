import { create } from 'zustand';

import type { LocationSample, PermissionStatus, SignalStoreState } from '@/types/zentra';
import { loadPersistedSignalState, savePersistedSignalState } from '@/utils/app-storage';

interface SignalState extends SignalStoreState {
  bootstrap: () => Promise<void>;
  setStepSupport: (supported: boolean) => Promise<void>;
  setStepPermissionStatus: (status: PermissionStatus) => Promise<void>;
  setStepCount: (count: number) => Promise<void>;
  setBatterySupport: (supported: boolean) => Promise<void>;
  setBatterySnapshot: (snapshot: {
    batteryLevel?: number | null;
    batteryStateLabel?: string | null;
    lowPowerMode?: boolean | null;
  }) => Promise<void>;
  setLocationSupport: (supported: boolean) => Promise<void>;
  setLocationPermissionStatus: (status: PermissionStatus) => Promise<void>;
  setLocationServicesEnabled: (enabled: boolean) => Promise<void>;
  addLocationSample: (sample: LocationSample) => Promise<void>;
  clearCapturedData: () => Promise<void>;
}

const EMPTY_SIGNAL_STATE: SignalStoreState = {
  isHydrated: false,
  stepCount: null,
  stepSupported: null,
  stepPermissionStatus: 'not_requested',
  stepLastUpdatedAt: null,
  batterySupported: null,
  batteryLevel: null,
  batteryStateLabel: null,
  lowPowerMode: null,
  batteryLastUpdatedAt: null,
  locationSupported: null,
  locationPermissionStatus: 'not_requested',
  locationServicesEnabled: null,
  locationSamples: [],
  locationLastUpdatedAt: null,
};

async function persistSignalState(state: SignalState): Promise<void> {
  await savePersistedSignalState({
    isHydrated: state.isHydrated,
    stepCount: state.stepCount,
    stepSupported: state.stepSupported,
    stepPermissionStatus: state.stepPermissionStatus,
    stepLastUpdatedAt: state.stepLastUpdatedAt,
    batterySupported: state.batterySupported,
    batteryLevel: state.batteryLevel,
    batteryStateLabel: state.batteryStateLabel,
    lowPowerMode: state.lowPowerMode,
    batteryLastUpdatedAt: state.batteryLastUpdatedAt,
    locationSupported: state.locationSupported,
    locationPermissionStatus: state.locationPermissionStatus,
    locationServicesEnabled: state.locationServicesEnabled,
    locationSamples: state.locationSamples,
    locationLastUpdatedAt: state.locationLastUpdatedAt,
  });
}

function withTimestamp<T extends object>(payload: T, key: string): T & Record<string, string> {
  return {
    ...payload,
    [key]: new Date().toISOString(),
  };
}

export const useSignalStore = create<SignalState>((set, get) => ({
  ...EMPTY_SIGNAL_STATE,

  bootstrap: async () => {
    if (get().isHydrated) {
      return;
    }

    const persisted = await loadPersistedSignalState();
    set({
      ...EMPTY_SIGNAL_STATE,
      ...persisted,
      isHydrated: true,
    });
  },

  setStepSupport: async (stepSupported) => {
    set({ stepSupported });
    await persistSignalState(get());
  },

  setStepPermissionStatus: async (stepPermissionStatus) => {
    set({ stepPermissionStatus });
    await persistSignalState(get());
  },

  setStepCount: async (stepCount) => {
    set(withTimestamp({ stepCount }, 'stepLastUpdatedAt'));
    await persistSignalState(get());
  },

  setBatterySupport: async (batterySupported) => {
    set({ batterySupported });
    await persistSignalState(get());
  },

  setBatterySnapshot: async ({ batteryLevel, batteryStateLabel, lowPowerMode }) => {
    set((state) => withTimestamp({
      batteryLevel: batteryLevel ?? state.batteryLevel,
      batteryStateLabel: batteryStateLabel ?? state.batteryStateLabel,
      lowPowerMode: lowPowerMode ?? state.lowPowerMode,
    }, 'batteryLastUpdatedAt'));
    await persistSignalState(get());
  },

  setLocationSupport: async (locationSupported) => {
    set({ locationSupported });
    await persistSignalState(get());
  },

  setLocationPermissionStatus: async (locationPermissionStatus) => {
    set({ locationPermissionStatus });
    await persistSignalState(get());
  },

  setLocationServicesEnabled: async (locationServicesEnabled) => {
    set({ locationServicesEnabled });
    await persistSignalState(get());
  },

  addLocationSample: async (sample) => {
    set((state) => withTimestamp({
      locationSamples: [...state.locationSamples, sample].slice(-24),
    }, 'locationLastUpdatedAt'));
    await persistSignalState(get());
  },

  clearCapturedData: async () => {
    set({
      ...EMPTY_SIGNAL_STATE,
      isHydrated: true,
    });
    await persistSignalState(get());
  },
}));

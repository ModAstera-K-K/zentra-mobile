import { create } from "zustand";

import type {
  LocationSample,
  PermissionStatus,
  SignalStoreState,
} from "@/types/zentra";
import {
  loadPersistedSignalState,
  savePersistedSignalState,
} from "@/utils/app-storage";

const SIGNAL_PERSIST_DEBOUNCE_MS = 1200;

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
  setAmbientLightSupport: (supported: boolean) => Promise<void>;
  setAmbientLightLux: (lux: number) => Promise<void>;
  clearCapturedData: () => Promise<void>;
}

const EMPTY_SIGNAL_STATE: SignalStoreState = {
  isHydrated: false,
  stepCount: null,
  stepSupported: null,
  stepPermissionStatus: "not_requested",
  stepLastUpdatedAt: null,
  batterySupported: null,
  batteryLevel: null,
  batteryStateLabel: null,
  lowPowerMode: null,
  batteryLastUpdatedAt: null,
  locationSupported: null,
  locationPermissionStatus: "not_requested",
  locationServicesEnabled: null,
  locationSamples: [],
  locationLastUpdatedAt: null,
  ambientLightSupported: null,
  ambientLightLux: null,
  ambientLightLastUpdatedAt: null,
};

let pendingPersistTimer: ReturnType<typeof setTimeout> | null = null;
let persistSequence: Promise<void> = Promise.resolve();

function toPersistedSignalState(state: SignalStoreState): SignalStoreState {
  return {
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
    ambientLightSupported: state.ambientLightSupported,
    ambientLightLux: state.ambientLightLux,
    ambientLightLastUpdatedAt: state.ambientLightLastUpdatedAt,
  };
}

async function persistSignalState(state: SignalState): Promise<void> {
  const snapshot = toPersistedSignalState(state);
  persistSequence = persistSequence.then(() =>
    savePersistedSignalState(snapshot),
  );
  await persistSequence;
}

function schedulePersistSignalState(getState: () => SignalState): void {
  if (pendingPersistTimer) {
    clearTimeout(pendingPersistTimer);
  }

  pendingPersistTimer = setTimeout(() => {
    pendingPersistTimer = null;
    void persistSignalState(getState());
  }, SIGNAL_PERSIST_DEBOUNCE_MS);
}

async function flushPersistedSignalState(
  getState: () => SignalState,
): Promise<void> {
  if (pendingPersistTimer) {
    clearTimeout(pendingPersistTimer);
    pendingPersistTimer = null;
  }

  await persistSignalState(getState());
}

function withTimestamp<T extends object>(
  payload: T,
  key: string,
): T & Record<string, string> {
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
    schedulePersistSignalState(get);
  },

  setStepPermissionStatus: async (stepPermissionStatus) => {
    set({ stepPermissionStatus });
    schedulePersistSignalState(get);
  },

  setStepCount: async (stepCount) => {
    set(withTimestamp({ stepCount }, "stepLastUpdatedAt"));
    schedulePersistSignalState(get);
  },

  setBatterySupport: async (batterySupported) => {
    set({ batterySupported });
    schedulePersistSignalState(get);
  },

  setBatterySnapshot: async ({
    batteryLevel,
    batteryStateLabel,
    lowPowerMode,
  }) => {
    set((state) =>
      withTimestamp(
        {
          batteryLevel: batteryLevel ?? state.batteryLevel,
          batteryStateLabel: batteryStateLabel ?? state.batteryStateLabel,
          lowPowerMode: lowPowerMode ?? state.lowPowerMode,
        },
        "batteryLastUpdatedAt",
      ),
    );
    schedulePersistSignalState(get);
  },

  setLocationSupport: async (locationSupported) => {
    set({ locationSupported });
    schedulePersistSignalState(get);
  },

  setLocationPermissionStatus: async (locationPermissionStatus) => {
    set({ locationPermissionStatus });
    schedulePersistSignalState(get);
  },

  setLocationServicesEnabled: async (locationServicesEnabled) => {
    set({ locationServicesEnabled });
    schedulePersistSignalState(get);
  },

  addLocationSample: async (sample) => {
    set((state) =>
      withTimestamp(
        {
          locationSamples: [...state.locationSamples, sample].slice(-24),
        },
        "locationLastUpdatedAt",
      ),
    );
    schedulePersistSignalState(get);
  },

  setAmbientLightSupport: async (ambientLightSupported) => {
    set({ ambientLightSupported });
    schedulePersistSignalState(get);
  },

  setAmbientLightLux: async (ambientLightLux) => {
    set(withTimestamp({ ambientLightLux }, "ambientLightLastUpdatedAt"));
    schedulePersistSignalState(get);
  },

  clearCapturedData: async () => {
    set({
      ...EMPTY_SIGNAL_STATE,
      isHydrated: true,
    });
    await flushPersistedSignalState(get);
  },
}));

import { AppState } from "react-native";
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
    ambientLightSupported: state.ambientLightSupported,
    ambientLightLux: state.ambientLightLux,
    ambientLightLastUpdatedAt: state.ambientLightLastUpdatedAt,
  });
}

// The saved copy only seeds the next launch, and readings arrive far faster
// than that is worth writing. One write follows a burst of changes, or the
// app leaving the foreground, where a pending timer may never fire.
const PERSIST_DELAY_MS = 5_000;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistNow(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  return persistSignalState(useSignalStore.getState());
}

function persistSoon(): void {
  persistTimer ??= setTimeout(() => void persistNow(), PERSIST_DELAY_MS);
}

AppState.addEventListener("change", (state) => {
  if (state !== "active" && persistTimer) void persistNow();
});

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
    if (get().stepSupported === stepSupported) return;
    set({ stepSupported });
    persistSoon();
  },

  setStepPermissionStatus: async (stepPermissionStatus) => {
    if (get().stepPermissionStatus === stepPermissionStatus) return;
    set({ stepPermissionStatus });
    persistSoon();
  },

  setStepCount: async (stepCount) => {
    if (get().stepCount === stepCount) return;
    set(withTimestamp({ stepCount }, "stepLastUpdatedAt"));
    persistSoon();
  },

  setBatterySupport: async (batterySupported) => {
    if (get().batterySupported === batterySupported) return;
    set({ batterySupported });
    persistSoon();
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
    persistSoon();
  },

  setLocationSupport: async (locationSupported) => {
    if (get().locationSupported === locationSupported) return;
    set({ locationSupported });
    persistSoon();
  },

  setLocationPermissionStatus: async (locationPermissionStatus) => {
    if (get().locationPermissionStatus === locationPermissionStatus) return;
    set({ locationPermissionStatus });
    persistSoon();
  },

  setLocationServicesEnabled: async (locationServicesEnabled) => {
    if (get().locationServicesEnabled === locationServicesEnabled) return;
    set({ locationServicesEnabled });
    persistSoon();
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
    persistSoon();
  },

  setAmbientLightSupport: async (ambientLightSupported) => {
    if (get().ambientLightSupported === ambientLightSupported) return;
    set({ ambientLightSupported });
    persistSoon();
  },

  setAmbientLightLux: async (ambientLightLux) => {
    if (get().ambientLightLux === ambientLightLux) return;
    set(withTimestamp({ ambientLightLux }, "ambientLightLastUpdatedAt"));
    persistSoon();
  },

  clearCapturedData: async () => {
    set({
      ...EMPTY_SIGNAL_STATE,
      isHydrated: true,
    });
    await persistNow();
  },
}));

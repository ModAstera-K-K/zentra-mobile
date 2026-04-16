import type {
  CollectorKey,
  LocationSample,
  PermissionStatus,
} from "@/types/zentra";

export type CollectorCapability =
  | "foregroundOnly"
  | "backgroundContinuous"
  | "backgroundPeriodic"
  | "nativeBuffered";

export interface CollectorRuntimeDescriptor {
  capability: CollectorCapability;
  collectorKey: CollectorKey;
}

export interface CollectorHandle {
  stop: () => void;
}

export interface StepCollectorDeps {
  refreshRepository: () => Promise<void>;
  setStepSupport: (supported: boolean) => Promise<void>;
  setStepPermissionStatus: (status: PermissionStatus) => Promise<void>;
  setStepCount: (count: number) => Promise<void>;
}

export interface DeviceStateCollectorDeps {
  refreshRepository: () => Promise<void>;
  setBatterySupport: (supported: boolean) => Promise<void>;
  setBatterySnapshot: (snapshot: {
    batteryLevel?: number | null;
    batteryStateLabel?: string | null;
    lowPowerMode?: boolean | null;
  }) => Promise<void>;
}

export interface LocationCollectorDeps {
  hasSeenBackgroundPermissionRationale: boolean;
  refreshRepository: () => Promise<void>;
  setLocationSupport: (supported: boolean) => Promise<void>;
  setLocationPermissionStatus: (status: PermissionStatus) => Promise<void>;
  setLocationServicesEnabled: (enabled: boolean) => Promise<void>;
  addLocationSample: (sample: LocationSample) => Promise<void>;
}

export interface UnsupportedCollectorDeps {
  collectorKey: CollectorKey;
  message: string;
  refreshRepository: () => Promise<void>;
}

export interface AmbientLightCollectorDeps {
  refreshRepository: () => Promise<void>;
  setAmbientLightSupport: (supported: boolean) => Promise<void>;
  setAmbientLightLux: (lux: number) => Promise<void>;
}

export interface ActivityCollectorDeps {
  drainBufferedEvents: () => Promise<number>;
  refreshRepository: () => Promise<void>;
}

export interface HealthConnectCollectorDeps {
  noteSyncWindowEnd: (timestamp: string) => Promise<void>;
  refreshRepository: () => Promise<void>;
}

export interface AppUsageCollectorDeps {
  refreshRepository: () => Promise<void>;
}

export interface ConnectivityCollectorDeps {
  refreshRepository: () => Promise<void>;
}

export interface SleepCollectorDeps {
  refreshRepository: () => Promise<void>;
}

export interface MotionContextCollectorDeps {
  refreshRepository: () => Promise<void>;
}

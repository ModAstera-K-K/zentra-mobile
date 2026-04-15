import * as ExpoLinking from "expo-linking";
import { Platform } from "react-native";

import type { PermissionStatus } from "@/types/zentra";

export interface NativeActivityTransition {
  id: string;
  activityType: string;
  transitionType: "enter" | "exit";
  confidence: number;
  timestamp: string;
}

export interface NativeHealthConnectRecord {
  id: string;
  recordType: "steps" | "sleep" | "heart_rate" | "exercise_session";
  startTime: string;
  endTime: string;
  valueNumeric?: number | null;
  valueText?: string | null;
  valueJson?: string | null;
  unit: string;
  metadata: Record<string, boolean | number | string>;
}

export type HealthConnectAvailability =
  | "available"
  | "not_installed"
  | "unsupported";
export type UsageAccessPermissionStatus = PermissionStatus;

export interface NativeUsageEvent {
  eventType:
    | "activity_resumed"
    | "activity_paused"
    | "screen_interactive"
    | "screen_non_interactive"
    | "keyguard_hidden";
  packageName?: string | null;
  className?: string | null;
  timestamp: string;
}

interface NativeSignalsSubscription {
  remove: () => void;
}

interface NativeSignalsModule {
  addListener: (
    eventName: "onActivityTransition",
    listener: (payload: NativeActivityTransition) => void,
  ) => NativeSignalsSubscription;
  getActivityRecognitionPermissionStatusAsync: () => Promise<PermissionStatus>;
  requestActivityRecognitionPermissionAsync: () => Promise<PermissionStatus>;
  readBufferedActivityTransitionsAsync?: () => Promise<
    NativeActivityTransition[]
  >;
  acknowledgeBufferedActivityTransitionsAsync?: (
    ids: string[],
  ) => Promise<number>;
  startActivityRecognitionUpdatesAsync: () => Promise<boolean>;
  stopActivityRecognitionUpdatesAsync: () => Promise<void>;
  getHealthConnectAvailabilityAsync: () => Promise<HealthConnectAvailability>;
  getGrantedHealthConnectPermissionsAsync: () => Promise<string[]>;
  openHealthConnectPermissionRequestAsync: () => Promise<boolean>;
  openHealthConnectSettingsAsync: () => Promise<boolean>;
  requestHealthConnectPermissionsAsync: () => Promise<string[]>;
  getUsageAccessPermissionStatusAsync: () => Promise<UsageAccessPermissionStatus>;
  openUsageAccessSettingsAsync: () => Promise<boolean>;
  readUsageEventsAsync: (
    startIso: string,
    endIso: string,
  ) => Promise<NativeUsageEvent[]>;
  readHealthConnectRecordsAsync: (
    startIso: string,
    endIso: string,
  ) => Promise<NativeHealthConnectRecord[]>;
}

const REQUIRED_HEALTH_CONNECT_PERMISSIONS =
  Platform.OS === "ios"
    ? ([
        "ios.healthkit.read.steps",
        "ios.healthkit.read.sleep",
        "ios.healthkit.read.heart_rate",
        "ios.healthkit.read.exercise",
      ] as const)
    : ([
        "android.permission.health.READ_STEPS",
        "android.permission.health.READ_SLEEP",
        "android.permission.health.READ_HEART_RATE",
        "android.permission.health.READ_EXERCISE",
      ] as const);

function loadNativeSignalsModule(): NativeSignalsModule | null {
  try {
    // Local Expo modules only exist in rebuilt native dev clients.
    // Keep the JS app functional before native rebuild by treating absence as unsupported.
    const module = require("../../modules/zentra-native-signals").default as
      | NativeSignalsModule
      | undefined;
    return module ?? null;
  } catch {
    return null;
  }
}

export function getRequiredHealthConnectPermissions(): string[] {
  return [...REQUIRED_HEALTH_CONNECT_PERMISSIONS];
}

export function hasRequiredHealthConnectPermissions(
  grantedPermissions: string[],
): boolean {
  const grantedSet = new Set(grantedPermissions);
  return REQUIRED_HEALTH_CONNECT_PERMISSIONS.every((permission) =>
    grantedSet.has(permission),
  );
}

export async function getActivityRecognitionPermissionStatusAsync(): Promise<PermissionStatus> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return "unsupported";
  }

  return module.getActivityRecognitionPermissionStatusAsync();
}

export async function requestActivityRecognitionPermissionAsync(): Promise<PermissionStatus> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return "unsupported";
  }

  return module.requestActivityRecognitionPermissionAsync();
}

export async function readBufferedActivityTransitionsAsync(): Promise<
  NativeActivityTransition[]
> {
  const module = loadNativeSignalsModule();
  if (
    !module ||
    typeof module.readBufferedActivityTransitionsAsync !== "function"
  ) {
    return [];
  }

  return module.readBufferedActivityTransitionsAsync();
}

export async function acknowledgeBufferedActivityTransitionsAsync(
  ids: string[],
): Promise<number> {
  const module = loadNativeSignalsModule();
  if (
    !module ||
    typeof module.acknowledgeBufferedActivityTransitionsAsync !== "function"
  ) {
    return 0;
  }

  return module.acknowledgeBufferedActivityTransitionsAsync(ids);
}

export async function startActivityRecognitionUpdatesAsync(): Promise<boolean> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return false;
  }

  return module.startActivityRecognitionUpdatesAsync();
}

export async function stopActivityRecognitionUpdatesAsync(): Promise<void> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return;
  }

  await module.stopActivityRecognitionUpdatesAsync();
}

export function addActivityTransitionListener(
  listener: (payload: NativeActivityTransition) => void,
): NativeSignalsSubscription | null {
  const module = loadNativeSignalsModule();
  if (!module) {
    return null;
  }

  return module.addListener("onActivityTransition", listener);
}

export async function getHealthConnectAvailabilityAsync(): Promise<HealthConnectAvailability> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return "unsupported";
  }

  return module.getHealthConnectAvailabilityAsync();
}

export async function getUsageAccessPermissionStatusAsync(): Promise<UsageAccessPermissionStatus> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return "unsupported";
  }

  return module.getUsageAccessPermissionStatusAsync();
}

export async function openUsageAccessSettingsAsync(): Promise<boolean> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return false;
  }

  return module.openUsageAccessSettingsAsync();
}

export async function readUsageEventsAsync(
  startIso: string,
  endIso: string,
): Promise<NativeUsageEvent[]> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return [];
  }

  return module.readUsageEventsAsync(startIso, endIso);
}

export async function getGrantedHealthConnectPermissionsAsync(): Promise<
  string[]
> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return [];
  }

  return module.getGrantedHealthConnectPermissionsAsync();
}

export async function openHealthConnectSettingsAsync(): Promise<boolean> {
  const module = loadNativeSignalsModule();
  if (module && typeof module.openHealthConnectSettingsAsync === "function") {
    return module.openHealthConnectSettingsAsync();
  }

  if (Platform.OS !== "android") {
    return false;
  }

  try {
    await ExpoLinking.sendIntent(
      "androidx.health.ACTION_HEALTH_CONNECT_SETTINGS",
    );
    return true;
  } catch {
    return false;
  }
}

export async function openHealthConnectPermissionRequestAsync(): Promise<boolean> {
  const module = loadNativeSignalsModule();
  if (
    module &&
    typeof module.openHealthConnectPermissionRequestAsync === "function"
  ) {
    return module.openHealthConnectPermissionRequestAsync();
  }

  return false;
}

export async function requestHealthConnectPermissionsAsync(): Promise<
  string[]
> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return [];
  }

  return module.requestHealthConnectPermissionsAsync();
}

export async function readHealthConnectRecordsAsync(
  startIso: string,
  endIso: string,
): Promise<NativeHealthConnectRecord[]> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return [];
  }

  return module.readHealthConnectRecordsAsync(startIso, endIso);
}

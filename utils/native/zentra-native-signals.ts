import type { PermissionStatus } from '@/types/zentra';

export interface NativeActivityTransition {
  activityType: string;
  transitionType: 'enter' | 'exit';
  confidence: number;
  timestamp: string;
}

export interface NativeHealthConnectRecord {
  id: string;
  recordType: 'steps' | 'sleep' | 'heart_rate' | 'exercise_session';
  startTime: string;
  endTime: string;
  valueNumeric?: number | null;
  valueText?: string | null;
  valueJson?: string | null;
  unit: string;
  metadata: Record<string, boolean | number | string>;
}

export type HealthConnectAvailability = 'available' | 'not_installed' | 'unsupported';

interface NativeSignalsSubscription {
  remove: () => void;
}

interface NativeSignalsModule {
  addListener: (
    eventName: 'onActivityTransition',
    listener: (payload: NativeActivityTransition) => void,
  ) => NativeSignalsSubscription;
  getActivityRecognitionPermissionStatusAsync: () => Promise<PermissionStatus>;
  requestActivityRecognitionPermissionAsync: () => Promise<PermissionStatus>;
  startActivityRecognitionUpdatesAsync: () => Promise<boolean>;
  stopActivityRecognitionUpdatesAsync: () => Promise<void>;
  getHealthConnectAvailabilityAsync: () => Promise<HealthConnectAvailability>;
  getGrantedHealthConnectPermissionsAsync: () => Promise<string[]>;
  requestHealthConnectPermissionsAsync: () => Promise<string[]>;
  readHealthConnectRecordsAsync: (startIso: string, endIso: string) => Promise<NativeHealthConnectRecord[]>;
}

const REQUIRED_HEALTH_CONNECT_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_EXERCISE',
] as const;

function loadNativeSignalsModule(): NativeSignalsModule | null {
  try {
    // Local Expo modules only exist in rebuilt native dev clients.
    // Keep the JS app functional before native rebuild by treating absence as unsupported.
    const module = require('../../modules/zentra-native-signals').default as NativeSignalsModule | undefined;
    return module ?? null;
  } catch {
    return null;
  }
}

export function getRequiredHealthConnectPermissions(): string[] {
  return [...REQUIRED_HEALTH_CONNECT_PERMISSIONS];
}

export function hasRequiredHealthConnectPermissions(grantedPermissions: string[]): boolean {
  const grantedSet = new Set(grantedPermissions);
  return REQUIRED_HEALTH_CONNECT_PERMISSIONS.every((permission) => grantedSet.has(permission));
}

export async function getActivityRecognitionPermissionStatusAsync(): Promise<PermissionStatus> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return 'unsupported';
  }

  return module.getActivityRecognitionPermissionStatusAsync();
}

export async function requestActivityRecognitionPermissionAsync(): Promise<PermissionStatus> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return 'unsupported';
  }

  return module.requestActivityRecognitionPermissionAsync();
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

  return module.addListener('onActivityTransition', listener);
}

export async function getHealthConnectAvailabilityAsync(): Promise<HealthConnectAvailability> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return 'unsupported';
  }

  return module.getHealthConnectAvailabilityAsync();
}

export async function getGrantedHealthConnectPermissionsAsync(): Promise<string[]> {
  const module = loadNativeSignalsModule();
  if (!module) {
    return [];
  }

  return module.getGrantedHealthConnectPermissionsAsync();
}

export async function requestHealthConnectPermissionsAsync(): Promise<string[]> {
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

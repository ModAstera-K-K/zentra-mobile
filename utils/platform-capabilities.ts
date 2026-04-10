import { Platform } from 'react-native';

import type { CollectorKey, CollectorState } from '@/types/zentra';

export function getPlatformName(): string {
  return Platform.OS === 'ios' ? 'iOS' : 'Android';
}

export function getHealthPlatformName(): string {
  return Platform.OS === 'ios' ? 'HealthKit' : 'Health Connect';
}

export function getHealthSourceLabel(): string {
  return Platform.OS === 'ios' ? 'Apple HealthKit' : 'Health Connect SDK';
}

export function getActivityPermissionLabel(): string {
  return Platform.OS === 'ios' ? 'Motion access' : 'Activity recognition';
}

export function getActivitySourceLabel(): string {
  return Platform.OS === 'ios' ? 'Core Motion' : 'Activity Recognition';
}

export function getActivityUnsupportedMessage(): string {
  return `Activity recognition is unsupported in this build until the ${getPlatformName()} dev client is rebuilt`;
}

export function getHealthUnsupportedMessage(): string {
  return `${getHealthPlatformName()} is unsupported in this build until the ${getPlatformName()} dev client is rebuilt`;
}

export function getAppUsageUnsupportedMessage(): string {
  return Platform.OS === 'ios'
    ? 'App usage, screen-state history, and unlock events are unsupported on iOS'
    : 'Usage stats are unsupported in this build until the Android dev client is rebuilt';
}

export function getAmbientLightUnsupportedMessage(): string {
  return Platform.OS === 'ios'
    ? 'Ambient light is unsupported on iOS'
    : 'Ambient light sensor is not available on this device';
}

export function getLiveSignalsSummary(): string {
  return Platform.OS === 'ios'
    ? 'Live signals currently supported in this build: steps, battery state, foreground location, iOS motion activity, and HealthKit once the iOS dev client is rebuilt. Screen time, unlock history, and ambient light remain unsupported on iOS.'
    : 'Live signals currently supported in this build: steps, battery state, foreground location, ambient light, and native Activity or Health Connect once the Android dev client is rebuilt.';
}

export function getCollectorPlatformOverrides(key: CollectorKey): Partial<CollectorState> {
  if (Platform.OS !== 'ios') {
    return {};
  }

  switch (key) {
    case 'activity':
      return {
        description: 'Walking, stillness, running, cycling, and motion context from Core Motion.',
        permissionLabel: getActivityPermissionLabel(),
        sourceLabel: getActivitySourceLabel(),
      };
    case 'appUsage':
      return {
        description: 'Android-only app usage, screen time, and unlock behavior.',
        permissionLabel: 'Unsupported on iOS',
        sourceLabel: 'Android Usage Stats',
      };
    case 'deviceState':
      return {
        description: 'Battery level and charging state. Screen and unlock history stay Android-only.',
        permissionLabel: 'System state',
        sourceLabel: 'Battery monitoring',
      };
    case 'healthConnect':
      return {
        label: getHealthPlatformName(),
        description: 'Imported health records like sleep, heart rate, steps, or workouts.',
        permissionLabel: 'Health access',
        sourceLabel: getHealthSourceLabel(),
      };
    case 'ambientLight':
      return {
        description: 'Android-only ambient light context from a hardware sensor.',
        permissionLabel: 'Unsupported on iOS',
        sourceLabel: 'Android Light Sensor',
      };
    default:
      return {};
  }
}

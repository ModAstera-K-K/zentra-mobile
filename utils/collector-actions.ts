import { Platform } from 'react-native';

import type { CollectorKey, CollectorState } from '@/types/zentra';
import { getActivityPermissionLabel, getHealthPlatformName } from '@/utils/platform-capabilities';

export type CollectorQuickActionType =
  | 'request_activity'
  | 'open_app_settings'
  | 'open_usage_access'
  | 'connect_health';

export interface CollectorQuickAction {
  helperText: string;
  label: string;
  type: CollectorQuickActionType;
}

export function getCollectorActionPendingLabel(collectorKey: CollectorKey): string {
  switch (collectorKey) {
    case 'activity':
      return 'Requesting access…';
    case 'appUsage':
      return 'Opening settings…';
    case 'healthConnect':
      return Platform.OS === 'android' ? 'Opening Health Connect…' : 'Opening health access…';
    default:
      return 'Working…';
  }
}

export function getCollectorQuickAction(collector: CollectorState): CollectorQuickAction | null {
  if (!collector.enabled) {
    return null;
  }

  if (collector.permissionStatus === 'granted' || collector.permissionStatus === 'derived' || collector.permissionStatus === 'unsupported') {
    return null;
  }

  switch (collector.key) {
    case 'activity':
      if (collector.permissionStatus === 'blocked') {
        return {
          helperText: `Open Zentra app settings and allow ${getActivityPermissionLabel().toLowerCase()}.`,
          label: 'Open App Settings',
          type: 'open_app_settings',
        };
      }

      return {
        helperText: `Request ${getActivityPermissionLabel().toLowerCase()} for live activity transitions.`,
        label: Platform.OS === 'ios' ? 'Request Motion Access' : 'Request Access',
        type: 'request_activity',
      };
    case 'appUsage':
      return {
        helperText: 'Open Android Usage Access and allow Zentra to read app and screen history.',
        label: 'Open Usage Access',
        type: 'open_usage_access',
      };
    case 'healthConnect':
      return {
        helperText: Platform.OS === 'android'
          ? `Request ${getHealthPlatformName()} permissions for Zentra. After Zentra is connected, you can manage access from ${getHealthPlatformName()}.`
          : `Grant ${getHealthPlatformName()} permissions and retry the import from inside Zentra.`,
        label: Platform.OS === 'android'
          ? `Connect ${getHealthPlatformName()}`
          : `Connect ${getHealthPlatformName()}`,
        type: 'connect_health',
      };
    default:
      return null;
  }
}

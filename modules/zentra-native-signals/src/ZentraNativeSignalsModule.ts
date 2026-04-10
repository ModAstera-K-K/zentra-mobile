import { NativeModule, requireOptionalNativeModule } from 'expo';

import { ZentraNativeSignalsModuleEvents } from './ZentraNativeSignals.types';

declare class ZentraNativeSignalsModule extends NativeModule<ZentraNativeSignalsModuleEvents> {
  getActivityRecognitionPermissionStatusAsync(): Promise<
    'granted' | 'not_requested' | 'blocked' | 'unsupported'
  >;
  requestActivityRecognitionPermissionAsync(): Promise<
    'granted' | 'not_requested' | 'blocked' | 'unsupported'
  >;
  startActivityRecognitionUpdatesAsync(): Promise<boolean>;
  stopActivityRecognitionUpdatesAsync(): Promise<void>;
  getHealthConnectAvailabilityAsync(): Promise<'available' | 'not_installed' | 'unsupported'>;
  getGrantedHealthConnectPermissionsAsync(): Promise<string[]>;
  openHealthConnectSettingsAsync(): Promise<boolean>;
  requestHealthConnectPermissionsAsync(): Promise<string[]>;
  getUsageAccessPermissionStatusAsync(): Promise<
    'granted' | 'not_requested' | 'blocked' | 'unsupported'
  >;
  openUsageAccessSettingsAsync(): Promise<boolean>;
  readUsageEventsAsync(startIso: string, endIso: string): Promise<Array<{
    eventType:
      | 'activity_resumed'
      | 'activity_paused'
      | 'screen_interactive'
      | 'screen_non_interactive'
      | 'keyguard_hidden';
    packageName?: string | null;
    className?: string | null;
    timestamp: string;
  }>>;
  readHealthConnectRecordsAsync(startIso: string, endIso: string): Promise<Array<{
    id: string;
    recordType: 'steps' | 'sleep' | 'heart_rate' | 'exercise_session';
    startTime: string;
    endTime: string;
    valueNumeric?: number | null;
    valueText?: string | null;
    valueJson?: string | null;
    unit: string;
    metadata: Record<string, boolean | number | string>;
  }>>;
}

export default requireOptionalNativeModule<ZentraNativeSignalsModule>('ZentraNativeSignals');

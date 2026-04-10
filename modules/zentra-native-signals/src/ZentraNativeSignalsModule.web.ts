import { registerWebModule, NativeModule } from 'expo';

import { ActivityTransitionEventPayload } from './ZentraNativeSignals.types';

type ZentraNativeSignalsModuleEvents = {
  onActivityTransition: (params: ActivityTransitionEventPayload) => void;
}

class ZentraNativeSignalsModule extends NativeModule<ZentraNativeSignalsModuleEvents> {
  async getActivityRecognitionPermissionStatusAsync(): Promise<'unsupported'> {
    return 'unsupported';
  }

  async requestActivityRecognitionPermissionAsync(): Promise<'unsupported'> {
    return 'unsupported';
  }

  async startActivityRecognitionUpdatesAsync(): Promise<boolean> {
    return false;
  }

  async stopActivityRecognitionUpdatesAsync(): Promise<void> {}

  async getHealthConnectAvailabilityAsync(): Promise<'unsupported'> {
    return 'unsupported';
  }

  async getGrantedHealthConnectPermissionsAsync(): Promise<string[]> {
    return [];
  }

  async requestHealthConnectPermissionsAsync(): Promise<string[]> {
    return [];
  }

  async readHealthConnectRecordsAsync(): Promise<[]> {
    return [];
  }
}

export default registerWebModule(ZentraNativeSignalsModule, 'ZentraNativeSignalsModule');

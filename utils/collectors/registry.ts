import type {
  ActivityCollectorDeps,
  AmbientLightCollectorDeps,
  CollectorHandle,
  DeviceStateCollectorDeps,
  HealthConnectCollectorDeps,
  LocationCollectorDeps,
  StepCollectorDeps,
} from '@/utils/collectors/types';
import { startActivityCollector } from '@/utils/collectors/activity-collector';
import { startAmbientLightCollector } from '@/utils/collectors/ambient-light-collector';
import { startDeviceStateCollector } from '@/utils/collectors/device-state-collector';
import { startHealthConnectCollector } from '@/utils/collectors/health-connect-collector';
import { startLocationCollector } from '@/utils/collectors/location-collector';
import { startStepCollector } from '@/utils/collectors/step-collector';
import { startUnsupportedCollector } from '@/utils/collectors/unsupported-collector';

export function startStepCollectorModule(deps: StepCollectorDeps): Promise<CollectorHandle> {
  return startStepCollector(deps);
}

export function startDeviceStateCollectorModule(
  deps: DeviceStateCollectorDeps,
): Promise<CollectorHandle> {
  return startDeviceStateCollector(deps);
}

export function startLocationCollectorModule(
  deps: LocationCollectorDeps,
): Promise<CollectorHandle> {
  return startLocationCollector(deps);
}

export function startAmbientLightCollectorModule(
  deps: AmbientLightCollectorDeps,
): Promise<CollectorHandle> {
  return startAmbientLightCollector(deps);
}

export function startActivityCollectorModule(
  deps: ActivityCollectorDeps,
): Promise<CollectorHandle> {
  return startActivityCollector(deps);
}

export function startAppUsageCollectorModule(refreshRepository: () => Promise<void>): Promise<CollectorHandle> {
  return startUnsupportedCollector({
    collectorKey: 'appUsage',
    message: 'Usage stats and screen time require Android Usage Access integration',
    refreshRepository,
  });
}

export function startHealthConnectCollectorModule(
  deps: HealthConnectCollectorDeps,
): Promise<CollectorHandle> {
  return startHealthConnectCollector(deps);
}

export function startSleepCollectorModule(refreshRepository: () => Promise<void>): Promise<CollectorHandle> {
  return startUnsupportedCollector({
    collectorKey: 'sleep',
    message: 'Sleep inference depends on native activity and device-state history collectors',
    refreshRepository,
  });
}

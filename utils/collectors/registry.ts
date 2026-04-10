import type {
  ActivityCollectorDeps,
  AppUsageCollectorDeps,
  AmbientLightCollectorDeps,
  CollectorHandle,
  DeviceStateCollectorDeps,
  HealthConnectCollectorDeps,
  LocationCollectorDeps,
  SleepCollectorDeps,
  StepCollectorDeps,
} from '@/utils/collectors/types';
import { startActivityCollector } from '@/utils/collectors/activity-collector';
import { startAppUsageCollector } from '@/utils/collectors/app-usage-collector';
import { startAmbientLightCollector } from '@/utils/collectors/ambient-light-collector';
import { startDeviceStateCollector } from '@/utils/collectors/device-state-collector';
import { startHealthConnectCollector } from '@/utils/collectors/health-connect-collector';
import { startLocationCollector } from '@/utils/collectors/location-collector';
import { startSleepCollector } from '@/utils/collectors/sleep-collector';
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

export function startAppUsageCollectorModule(
  deps: AppUsageCollectorDeps,
): Promise<CollectorHandle> {
  return startAppUsageCollector(deps);
}

export function startHealthConnectCollectorModule(
  deps: HealthConnectCollectorDeps,
): Promise<CollectorHandle> {
  return startHealthConnectCollector(deps);
}

export function startSleepCollectorModule(
  deps: SleepCollectorDeps,
): Promise<CollectorHandle> {
  return startSleepCollector(deps);
}

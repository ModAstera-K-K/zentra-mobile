import type { CollectorHandle, DeviceStateCollectorDeps, LocationCollectorDeps, StepCollectorDeps } from '@/utils/collectors/types';
import { startDeviceStateCollector } from '@/utils/collectors/device-state-collector';
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

export function startActivityCollectorModule(refreshRepository: () => Promise<void>): Promise<CollectorHandle> {
  return startUnsupportedCollector({
    collectorKey: 'activity',
    message: 'Activity recognition requires native Android integration beyond this Expo build',
    refreshRepository,
  });
}

export function startAppUsageCollectorModule(refreshRepository: () => Promise<void>): Promise<CollectorHandle> {
  return startUnsupportedCollector({
    collectorKey: 'appUsage',
    message: 'Usage stats and screen time require Android Usage Access integration',
    refreshRepository,
  });
}

export function startHealthConnectCollectorModule(refreshRepository: () => Promise<void>): Promise<CollectorHandle> {
  return startUnsupportedCollector({
    collectorKey: 'healthConnect',
    message: 'Health Connect collection requires a custom native Android implementation',
    refreshRepository,
  });
}

export function startSleepCollectorModule(refreshRepository: () => Promise<void>): Promise<CollectorHandle> {
  return startUnsupportedCollector({
    collectorKey: 'sleep',
    message: 'Sleep inference depends on native activity and device-state history collectors',
    refreshRepository,
  });
}

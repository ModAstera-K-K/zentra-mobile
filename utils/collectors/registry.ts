import type { CollectorKey, CollectorState } from "@/types/zentra";
import type {
  ActivityCollectorDeps,
  AppUsageCollectorDeps,
  AmbientLightCollectorDeps,
  CollectorCapability,
  CollectorHandle,
  ConnectivityCollectorDeps,
  DeviceStateCollectorDeps,
  HealthConnectCollectorDeps,
  LocationCollectorDeps,
  MotionContextCollectorDeps,
  SleepCollectorDeps,
  StepCollectorDeps,
} from "@/utils/collectors/types";
import { startActivityCollector } from "@/utils/collectors/activity-collector";
import { startAppUsageCollector } from "@/utils/collectors/app-usage-collector";
import { startAmbientLightCollector } from "@/utils/collectors/ambient-light-collector";
import { startConnectivityCollector } from "@/utils/collectors/connectivity-collector";
import { startDeviceStateCollector } from "@/utils/collectors/device-state-collector";
import { startHealthConnectCollector } from "@/utils/collectors/health-connect-collector";
import { startLocationCollector } from "@/utils/collectors/location-collector";
import { startMotionContextCollector } from "@/utils/collectors/motion-context-collector";
import { startSleepCollector } from "@/utils/collectors/sleep-collector";
import { startStepCollector } from "@/utils/collectors/step-collector";
import { startUnsupportedCollector } from "@/utils/collectors/unsupported-collector";

export const collectorCapabilities: Record<CollectorKey, CollectorCapability> =
  {
    // Android native receivers can buffer transitions before JS reconnects.
    activity: "nativeBuffered",
    // Expo light readings only stream while the JS runtime is active.
    ambientLight: "foregroundOnly",
    // Usage snapshots can be re-read on demand during reconcile windows.
    appUsage: "backgroundPeriodic",
    // Network listeners are app-runtime-bound and not used as background work.
    connectivity: "foregroundOnly",
    // Battery listeners are foreground app signals, not scheduled background work.
    deviceState: "foregroundOnly",
    // Health data is imported by periodic reads rather than continuous streaming.
    healthConnect: "backgroundPeriodic",
    // Location can continue in background through platform-supported location updates.
    location: "backgroundContinuous",
    // Motion summaries depend on live sensor subscriptions in the foreground runtime.
    motionContext: "foregroundOnly",
    // Sleep is derived from stored events during reconcile windows.
    sleep: "backgroundPeriodic",
    // Step subscriptions depend on the foreground JS runtime.
    steps: "foregroundOnly",
  };

export function collectorHasCapability(
  collectorKey: CollectorKey,
  capability: CollectorCapability,
): boolean {
  return collectorCapabilities[collectorKey] === capability;
}

export function hasEnabledCollectorCapability(
  collectors: Record<string, CollectorState>,
  capabilities: CollectorCapability | CollectorCapability[],
): boolean {
  const capabilitySet = new Set(
    Array.isArray(capabilities) ? capabilities : [capabilities],
  );

  return Object.entries(collectorCapabilities).some(
    ([collectorKey, capability]) => {
      if (!capabilitySet.has(capability)) {
        return false;
      }

      return Boolean(collectors[collectorKey]?.enabled);
    },
  );
}

export function startStepCollectorModule(
  deps: StepCollectorDeps,
): Promise<CollectorHandle> {
  return startStepCollector(deps);
}

export function startDeviceStateCollectorModule(
  deps: DeviceStateCollectorDeps,
): Promise<CollectorHandle> {
  return startDeviceStateCollector(deps);
}

export function startConnectivityCollectorModule(
  deps: ConnectivityCollectorDeps,
): Promise<CollectorHandle> {
  return startConnectivityCollector(deps);
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

export function startMotionContextCollectorModule(
  deps: MotionContextCollectorDeps,
): Promise<CollectorHandle> {
  return startMotionContextCollector(deps);
}

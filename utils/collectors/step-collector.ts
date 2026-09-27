import { Pedometer } from "expo-sensors";

import {
  appendEventsForCollector,
  ensureCollectorFailureState,
} from "@/utils/event-repository";
import { createStepEvent } from "@/utils/live-event-builders";
import { mapExpoPermissionStatus } from "@/utils/device-signals";
import type {
  CollectorHandle,
  StepCollectorDeps,
} from "@/utils/collectors/types";

export async function startStepCollector(
  deps: StepCollectorDeps,
): Promise<CollectorHandle> {
  const supported = await Pedometer.isAvailableAsync();
  await deps.setStepSupport(supported);

  if (!supported) {
    await deps.setStepPermissionStatus("blocked");
    await ensureCollectorFailureState(
      "steps",
      "Step counter is not available on this device",
    );
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  const existingPermission = await Pedometer.getPermissionsAsync();
  const permission =
    existingPermission.status === "granted" || !existingPermission.canAskAgain
      ? existingPermission
      : await Pedometer.requestPermissionsAsync();

  await deps.setStepPermissionStatus(
    mapExpoPermissionStatus(permission.status),
  );

  if (permission.status !== "granted") {
    await ensureCollectorFailureState(
      "steps",
      "Motion permission is required for live step events",
    );
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  let previousCount = 0;
  let previousObservedAt = Date.now();
  const subscription = Pedometer.watchStepCount((result) => {
    const event = createStepEvent(result.steps);
    event.metadata.step_delta =
      result.steps < previousCount
        ? result.steps
        : result.steps - previousCount;
    const observedAt = Date.now();
    event.metadata.step_timing_verified = observedAt - previousObservedAt <= 60_000;
    previousObservedAt = observedAt;
    previousCount = result.steps;
    void (async () => {
      await deps.setStepCount(result.steps);
      await appendEventsForCollector("steps", [event], "Step reading stored");
      await deps.refreshRepository();
    })();
  });

  return {
    stop: () => subscription.remove(),
  };
}

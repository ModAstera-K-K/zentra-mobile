import { LightSensor } from 'expo-sensors';

import { appendEventsForCollector, ensureCollectorFailureState } from '@/utils/event-repository';
import { createAmbientLightEvent } from '@/utils/live-event-builders';
import type { AmbientLightCollectorDeps, CollectorHandle } from '@/utils/collectors/types';

export async function startAmbientLightCollector(
  deps: AmbientLightCollectorDeps,
): Promise<CollectorHandle> {
  const supported = await LightSensor.isAvailableAsync();
  await deps.setAmbientLightSupport(supported);

  if (!supported) {
    await ensureCollectorFailureState('ambientLight', 'Ambient light sensor is not available on this device');
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  LightSensor.setUpdateInterval(3000);

  const subscription = LightSensor.addListener((measurement) => {
    void (async () => {
      await deps.setAmbientLightLux(measurement.illuminance);
      await appendEventsForCollector(
        'ambientLight',
        [createAmbientLightEvent(measurement.illuminance, new Date(measurement.timestamp * 1000).toISOString())],
        'Ambient light reading stored',
      );
      await deps.refreshRepository();
    })();
  });

  return {
    stop: () => subscription.remove(),
  };
}

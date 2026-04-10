import { Platform } from 'react-native';
import { LightSensor } from 'expo-sensors';

import { appendEventsForCollector, ensureCollectorFailureState } from '@/utils/event-repository';
import { createAmbientLightEvent } from '@/utils/live-event-builders';
import type { AmbientLightCollectorDeps, CollectorHandle } from '@/utils/collectors/types';
import { getAmbientLightUnsupportedMessage } from '@/utils/platform-capabilities';

export async function startAmbientLightCollector(
  deps: AmbientLightCollectorDeps,
): Promise<CollectorHandle> {
  if (Platform.OS === 'ios') {
    await deps.setAmbientLightSupport(false);
    await ensureCollectorFailureState('ambientLight', getAmbientLightUnsupportedMessage());
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  const supported = await LightSensor.isAvailableAsync();
  await deps.setAmbientLightSupport(supported);

  if (!supported) {
    await ensureCollectorFailureState('ambientLight', getAmbientLightUnsupportedMessage());
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

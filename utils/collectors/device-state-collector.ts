import * as Battery from 'expo-battery';

import { appendEventsForCollector, ensureCollectorFailureState } from '@/utils/event-repository';
import { formatBatteryStateLabel } from '@/utils/device-signals';
import { createBatteryEvent } from '@/utils/live-event-builders';
import type { CollectorHandle, DeviceStateCollectorDeps } from '@/utils/collectors/types';

async function persistBatterySnapshot(
  deps: DeviceStateCollectorDeps,
  snapshot: {
    batteryLevel?: number | null;
    batteryStateLabel?: string | null;
    lowPowerMode?: boolean | null;
  },
  successMessage: string,
): Promise<void> {
  await deps.setBatterySnapshot(snapshot);
  await appendEventsForCollector('deviceState', [createBatteryEvent(snapshot)], successMessage);
  await deps.refreshRepository();
}

export async function startDeviceStateCollector(
  deps: DeviceStateCollectorDeps,
): Promise<CollectorHandle> {
  const supported = await Battery.isAvailableAsync();
  await deps.setBatterySupport(supported);

  if (!supported) {
    await ensureCollectorFailureState('deviceState', 'Battery state is not available on this device');
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  const snapshot = await Battery.getPowerStateAsync();
  await persistBatterySnapshot(
    deps,
    {
      batteryLevel: snapshot.batteryLevel,
      batteryStateLabel: formatBatteryStateLabel(snapshot.batteryState),
      lowPowerMode: snapshot.lowPowerMode,
    },
    'Device state stored',
  );

  const batteryLevelSubscription = Battery.addBatteryLevelListener((event) => {
    void persistBatterySnapshot(
      deps,
      {
        batteryLevel: event.batteryLevel,
        batteryStateLabel: null,
        lowPowerMode: null,
      },
      'Battery level updated',
    );
  });

  const batteryStateSubscription = Battery.addBatteryStateListener((event) => {
    void persistBatterySnapshot(
      deps,
      {
        batteryLevel: null,
        batteryStateLabel: formatBatteryStateLabel(event.batteryState),
        lowPowerMode: null,
      },
      'Battery state updated',
    );
  });

  const lowPowerSubscription = Battery.addLowPowerModeListener((event) => {
    void persistBatterySnapshot(
      deps,
      {
        batteryLevel: null,
        batteryStateLabel: null,
        lowPowerMode: event.lowPowerMode,
      },
      'Low power mode updated',
    );
  });

  return {
    stop: () => {
      batteryLevelSubscription.remove();
      batteryStateSubscription.remove();
      lowPowerSubscription.remove();
    },
  };
}

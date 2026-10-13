import * as Battery from 'expo-battery';

import {
  isBatteryReadingDue,
  mergeBatteryReading,
  type BatteryReading,
  type StoredBatteryReading,
} from '@/utils/battery-reading';
import { appendEventsForCollector, ensureCollectorFailureState } from '@/utils/event-repository';
import { formatBatteryStateLabel } from '@/utils/device-signals';
import { createBatteryEvent } from '@/utils/live-event-builders';
import type { CollectorHandle, DeviceStateCollectorDeps } from '@/utils/collectors/types';

const BATTERY_POLL_INTERVAL_MS = 15_000;

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

  let stored: StoredBatteryReading | null = null;

  // The poll and the listeners report the same reading over and over. A row,
  // and the refresh that follows one, is only worth it when something changed.
  async function persistBatterySnapshot(
    update: Partial<BatteryReading>,
    successMessage: string,
  ): Promise<void> {
    const reading = mergeBatteryReading(stored?.reading ?? null, update);
    const nowMs = Date.now();
    if (!isBatteryReadingDue(stored, reading, nowMs)) {
      return;
    }

    // Claimed before the first await so the poll and a listener cannot both
    // store the same reading.
    const previous = stored;
    const claim = { reading, atMs: nowMs };
    stored = claim;
    try {
      await deps.setBatterySnapshot(reading);
      await appendEventsForCollector('deviceState', [createBatteryEvent(reading)], successMessage);
    } catch (error) {
      if (stored === claim) {
        stored = previous;
      }
      throw error;
    }
    await deps.refreshRepository();
  }

  const snapshot = await Battery.getPowerStateAsync();
  await persistBatterySnapshot(
    {
      batteryLevel: snapshot.batteryLevel,
      batteryStateLabel: formatBatteryStateLabel(snapshot.batteryState),
      lowPowerMode: snapshot.lowPowerMode,
    },
    'Device state stored',
  );

  const batteryLevelSubscription = Battery.addBatteryLevelListener((event) => {
    void persistBatterySnapshot(
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
      {
        batteryLevel: null,
        batteryStateLabel: null,
        lowPowerMode: event.lowPowerMode,
      },
      'Low power mode updated',
    );
  });

  const pollingInterval = setInterval(() => {
    void (async () => {
      try {
        const polledSnapshot = await Battery.getPowerStateAsync();
        await persistBatterySnapshot(
          {
            batteryLevel: polledSnapshot.batteryLevel,
            batteryStateLabel: formatBatteryStateLabel(polledSnapshot.batteryState),
            lowPowerMode: polledSnapshot.lowPowerMode,
          },
          'Battery snapshot refreshed',
        );
      } catch {
        await ensureCollectorFailureState('deviceState', 'Battery polling failed');
      }
    })();
  }, BATTERY_POLL_INTERVAL_MS);

  return {
    stop: () => {
      batteryLevelSubscription.remove();
      batteryStateSubscription.remove();
      lowPowerSubscription.remove();
      clearInterval(pollingInterval);
    },
  };
}

import type {
  EventSource,
  LocationSample,
  SignalStoreState,
  ZentraEventRecord,
} from '@/types/zentra';

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createBaseEvent(
  dataType: ZentraEventRecord['dataType'],
  source: EventSource,
  timestamp: string,
): ZentraEventRecord {
  return {
    id: createId(dataType),
    timestampStart: timestamp,
    timestampEnd: timestamp,
    dataType,
    source,
    unit: 'count',
    confidence: 1,
    metadata: {},
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
  };
}

export function createStepEvent(stepCount: number): ZentraEventRecord {
  const timestamp = new Date().toISOString();
  return {
    ...createBaseEvent('steps', 'sensor', timestamp),
    valueNumeric: stepCount,
    unit: 'count',
  };
}

export function createBatteryEvent(snapshot: {
  batteryLevel?: number | null;
  batteryStateLabel?: string | null;
  lowPowerMode?: boolean | null;
}): ZentraEventRecord {
  const timestamp = new Date().toISOString();

  return {
    ...createBaseEvent('charging_state', 'system_broadcast', timestamp),
    valueNumeric: snapshot.batteryLevel ?? undefined,
    valueText: snapshot.batteryStateLabel ?? undefined,
    unit: 'fraction',
    metadata: {
      low_power_mode: Boolean(snapshot.lowPowerMode),
    },
  };
}

export function createLocationEvent(sample: LocationSample): ZentraEventRecord {
  return {
    ...createBaseEvent('location', 'sensor', sample.timestamp),
    valueJson: JSON.stringify({
      latitude: sample.latitude,
      longitude: sample.longitude,
    }),
    unit: 'wgs84',
  };
}

export function buildSeedEventsFromSignals(signals: SignalStoreState): ZentraEventRecord[] {
  const events: ZentraEventRecord[] = [];

  if (signals.stepCount !== null) {
    events.push(createStepEvent(signals.stepCount));
  }

  if (signals.batteryLevel !== null || signals.batteryStateLabel || signals.lowPowerMode !== null) {
    events.push(createBatteryEvent({
      batteryLevel: signals.batteryLevel,
      batteryStateLabel: signals.batteryStateLabel,
      lowPowerMode: signals.lowPowerMode,
    }));
  }

  signals.locationSamples.forEach((sample) => {
    events.push(createLocationEvent(sample));
  });

  return events;
}

import type {
  EventSource,
  LocationSample,
  SignalStoreState,
  ZentraEventRecord,
} from '@/types/zentra';
import type {
  NativeActivityTransition,
  NativeHealthConnectRecord,
} from '@/utils/native/zentra-native-signals';

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

export function createAmbientLightEvent(lux: number, timestamp = new Date().toISOString()): ZentraEventRecord {
  return {
    ...createBaseEvent('ambient_light', 'sensor', timestamp),
    valueNumeric: lux,
    unit: 'lux',
  };
}

export function createActivityEvent(transition: NativeActivityTransition): ZentraEventRecord {
  return {
    ...createBaseEvent('activity', 'activity_recognition', transition.timestamp),
    valueText: transition.activityType,
    unit: 'transition',
    metadata: {
      confidence: transition.confidence,
      transition: transition.transitionType,
    },
  };
}

function createHealthConnectEvent(record: NativeHealthConnectRecord): ZentraEventRecord {
  const dataType = record.recordType === 'sleep' ? 'sleep_inferred' : record.recordType;

  return {
    ...createBaseEvent(dataType, 'health_connect', record.startTime),
    id: `health-connect-${record.recordType}-${record.id}`,
    timestampEnd: record.endTime,
    valueNumeric: record.valueNumeric ?? undefined,
    valueText: record.valueText ?? undefined,
    valueJson: record.valueJson ?? undefined,
    unit: record.unit,
    confidence: 1,
    metadata: {
      ...record.metadata,
      record_id: record.id,
    },
  };
}

export function createHealthConnectEvents(records: NativeHealthConnectRecord[]): ZentraEventRecord[] {
  return records.map(createHealthConnectEvent);
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

  if (signals.ambientLightLux !== null) {
    events.push(createAmbientLightEvent(
      signals.ambientLightLux,
      signals.ambientLightLastUpdatedAt ?? new Date().toISOString(),
    ));
  }

  return events;
}

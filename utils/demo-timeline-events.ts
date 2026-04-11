import type { CollectorState, EventDataType, EventSource, ZentraEventRecord } from '@/types/zentra';
import { shiftISODate, toISODate } from '@/utils/dates';

type CollectorStateMap = Record<string, CollectorState>;

function buildWaveValue(index: number, min: number, max: number, phase: number): number {
  const midpoint = (min + max) / 2;
  const amplitude = (max - min) / 2;
  return Math.round(midpoint + Math.sin((index + phase) / 2.7) * amplitude);
}

function createEventRecord(
  type: EventDataType,
  source: EventSource,
  id: string,
  overrides: Partial<ZentraEventRecord>,
): ZentraEventRecord {
  return {
    id,
    timestampStart: new Date().toISOString(),
    timestampEnd: new Date().toISOString(),
    dataType: type,
    source,
    unit: 'count',
    confidence: 1,
    metadata: {},
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function isReady(collectors: CollectorStateMap, key: string): boolean {
  const collector = collectors[key];
  return Boolean(collector?.enabled);
}

function createIsoTimestamp(date: string, hour: number, minute = 0): string {
  return `${date}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00Z`;
}

export function buildDemoTimelineEvents(
  collectors: CollectorStateMap,
  totalDays = 365,
): ZentraEventRecord[] {
  const end = toISODate(new Date());
  const events: ZentraEventRecord[] = [];

  for (let index = 0; index < totalDays; index += 1) {
    const date = shiftISODate(end, index - (totalDays - 1));
    const idBase = `${date}-${index}`;
    const morningStepCount = buildWaveValue(index, 900, 2600, 1);
    const afternoonStepCount = morningStepCount + buildWaveValue(index, 1800, 5400, 2);
    const eveningStepCount = afternoonStepCount + buildWaveValue(index, 1200, 3200, 3);

    if (isReady(collectors, 'steps')) {
      events.push(
        createEventRecord('steps', 'sensor', `${idBase}-steps-morning`, {
          timestampStart: createIsoTimestamp(date, 8),
          timestampEnd: createIsoTimestamp(date, 8, 5),
          unit: 'count',
          valueNumeric: morningStepCount,
        }),
        createEventRecord('steps', 'sensor', `${idBase}-steps-afternoon`, {
          timestampStart: createIsoTimestamp(date, 14),
          timestampEnd: createIsoTimestamp(date, 14, 5),
          unit: 'count',
          valueNumeric: afternoonStepCount,
        }),
        createEventRecord('steps', 'sensor', `${idBase}-steps-evening`, {
          timestampStart: createIsoTimestamp(date, 19),
          timestampEnd: createIsoTimestamp(date, 19, 5),
          unit: 'count',
          valueNumeric: eveningStepCount,
        }),
      );
    }

    if (isReady(collectors, 'activity')) {
      events.push(
        createEventRecord('activity', 'activity_recognition', `${idBase}-activity-commute`, {
          timestampStart: createIsoTimestamp(date, 7, 30),
          timestampEnd: createIsoTimestamp(date, 8, 30),
          unit: 'state',
          valueText: index % 5 === 0 ? 'running' : 'walking',
        }),
        createEventRecord('activity', 'activity_recognition', `${idBase}-activity-midday`, {
          timestampStart: createIsoTimestamp(date, 12),
          timestampEnd: createIsoTimestamp(date, 12, 45),
          unit: 'state',
          valueText: 'walking',
        }),
        createEventRecord('activity', 'activity_recognition', `${idBase}-activity-night`, {
          timestampStart: createIsoTimestamp(date, 23),
          timestampEnd: createIsoTimestamp(date, 23, 45),
          unit: 'state',
          valueText: 'still',
        }),
      );
    }

    if (isReady(collectors, 'appUsage')) {
      events.push(
        createEventRecord('app_usage', 'usage_stats', `${idBase}-usage-evening`, {
          timestampStart: createIsoTimestamp(date, 20),
          timestampEnd: createIsoTimestamp(date, 21, 30),
          unit: 'seconds',
          valueNumeric: buildWaveValue(index, 1800, 5400, 4),
        }),
        createEventRecord('screen_state', 'usage_stats', `${idBase}-screen-on`, {
          timestampStart: createIsoTimestamp(date, 20),
          timestampEnd: createIsoTimestamp(date, 21, 30),
          unit: 'state',
          valueText: 'interactive',
        }),
        createEventRecord('unlock_event', 'usage_stats', `${idBase}-unlock`, {
          timestampStart: createIsoTimestamp(date, 8, 5),
          timestampEnd: createIsoTimestamp(date, 8, 5),
          unit: 'count',
          valueNumeric: 1,
        }),
      );
    }

    if (isReady(collectors, 'deviceState')) {
      events.push(
        createEventRecord('charging_state', 'system_broadcast', `${idBase}-charging-on`, {
          timestampStart: createIsoTimestamp(date, 22, 30),
          timestampEnd: createIsoTimestamp(date, 22, 30),
          unit: 'state',
          valueNumeric: buildWaveValue(index, 40, 88, 5),
          valueText: 'charging',
        }),
        createEventRecord('charging_state', 'system_broadcast', `${idBase}-charging-off`, {
          timestampStart: createIsoTimestamp(date, 6, 45),
          timestampEnd: createIsoTimestamp(date, 6, 45),
          unit: 'state',
          valueNumeric: buildWaveValue(index, 52, 96, 6),
          valueText: 'unplugged',
        }),
      );
    }

    if (isReady(collectors, 'sleep')) {
      const sleepStartDate = shiftISODate(date, -1);
      events.push(
        createEventRecord('sleep_inferred', 'inferred', `${idBase}-sleep`, {
          timestampStart: createIsoTimestamp(sleepStartDate, 22, 45),
          timestampEnd: createIsoTimestamp(date, 6, 25),
          unit: 'minutes',
          valueNumeric: buildWaveValue(index, 390, 505, 2),
          confidence: 0.84,
        }),
      );
    }

    if (isReady(collectors, 'location')) {
      events.push(
        createEventRecord('location', 'sensor', `${idBase}-location-midday`, {
          timestampStart: createIsoTimestamp(date, 12, 15),
          timestampEnd: createIsoTimestamp(date, 12, 20),
          unit: 'sample',
          valueNumeric: 1,
        }),
      );
    }

    if (isReady(collectors, 'ambientLight')) {
      events.push(
        createEventRecord('ambient_light', 'sensor', `${idBase}-light-morning`, {
          timestampStart: createIsoTimestamp(date, 9),
          timestampEnd: createIsoTimestamp(date, 9, 1),
          unit: 'lux',
          valueNumeric: buildWaveValue(index, 120, 800, 7),
        }),
        createEventRecord('ambient_light', 'sensor', `${idBase}-light-night`, {
          timestampStart: createIsoTimestamp(date, 21),
          timestampEnd: createIsoTimestamp(date, 21, 1),
          unit: 'lux',
          valueNumeric: buildWaveValue(index, 6, 80, 3),
        }),
      );
    }
  }

  return events;
}

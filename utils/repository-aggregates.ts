import type {
  DailyAggregateRecord,
  LocationSample,
  TodayLiveSnapshot,
  ZentraEventRecord,
} from '@/types/zentra';
import { parseISODate, shiftISODate, toISODate } from '@/utils/dates';

interface LocationPayload {
  latitude: number;
  longitude: number;
}

const COMPLETENESS_TYPES: ZentraEventRecord['dataType'][] = [
  'steps',
  'activity',
  'app_usage',
  'charging_state',
  'location',
  'sleep_inferred',
];

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMeters(a: LocationSample, b: LocationSample): number {
  const earthRadius = 6371000;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const latA = toRadians(a.latitude);
  const latB = toRadians(b.latitude);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

function parseLocationPayload(valueJson?: string): LocationPayload | null {
  if (!valueJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(valueJson) as Partial<LocationPayload>;
    if (typeof parsed.latitude !== 'number' || typeof parsed.longitude !== 'number') {
      return null;
    }

    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
    };
  } catch {
    return null;
  }
}

function extractLocationSamples(events: ZentraEventRecord[]): LocationSample[] {
  return events
    .filter((event) => event.dataType === 'location')
    .map((event) => {
      const payload = parseLocationPayload(event.valueJson);
      if (!payload) {
        return null;
      }

      return {
        latitude: payload.latitude,
        longitude: payload.longitude,
        timestamp: event.timestampStart,
      };
    })
    .filter((sample): sample is LocationSample => sample !== null)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function calculateMobilityRadius(samples: LocationSample[]): number | null {
  if (samples.length < 2) {
    return null;
  }

  const origin = samples[0];
  return Math.max(...samples.map((sample) => distanceMeters(origin, sample)));
}

function countTopActivity(events: ZentraEventRecord[]): string | null {
  const counts = events.reduce<Record<string, number>>((result, event) => {
    if (event.dataType !== 'activity' || !event.valueText) {
      return result;
    }

    result[event.valueText] = (result[event.valueText] ?? 0) + 1;
    return result;
  }, {});

  const topEntry = Object.entries(counts).sort((left, right) => right[1] - left[1])[0];
  return topEntry?.[0] ?? null;
}

function calculateCompleteness(events: ZentraEventRecord[]): number {
  if (!events.length) {
    return 0;
  }

  const presentTypes = new Set(events.map((event) => event.dataType));
  const coveredTypes = COMPLETENESS_TYPES.filter((type) => presentTypes.has(type)).length;

  return Number((coveredTypes / COMPLETENESS_TYPES.length).toFixed(2));
}

function getLocalDate(timestamp: string): string {
  return toISODate(new Date(timestamp));
}

export function buildDailyAggregateRecord(
  date: string,
  events: ZentraEventRecord[],
): DailyAggregateRecord {
  const locationSamples = extractLocationSamples(events);
  const sleepEvent = events
    .filter((event) => event.dataType === 'sleep_inferred' && typeof event.valueNumeric === 'number')
    .sort((left, right) => right.timestampStart.localeCompare(left.timestampStart))[0];
  const stepsTotal = Math.max(
    0,
    ...events
      .filter((event) => event.dataType === 'steps' && typeof event.valueNumeric === 'number')
      .map((event) => Math.round(event.valueNumeric ?? 0)),
  );

  return {
    date,
    stepsTotal,
    activeMinutes: events.filter((event) => event.dataType === 'activity' && event.valueText !== 'still').length,
    distanceMeters: 0,
    screenTimeSeconds: events
      .filter((event) => event.dataType === 'app_usage' && typeof event.valueNumeric === 'number')
      .reduce((total, event) => total + Math.round(event.valueNumeric ?? 0), 0),
    unlockCount: events.filter((event) => event.dataType === 'unlock_event').length,
    sleepEstimateMinutes: sleepEvent?.valueNumeric ? Math.round(sleepEvent.valueNumeric) : null,
    mobilityRadiusMeters: calculateMobilityRadius(locationSamples),
    topActivity: countTopActivity(events),
    dataCompleteness: calculateCompleteness(events),
    computedAt: new Date().toISOString(),
  };
}

export function buildTodaySnapshot(events: ZentraEventRecord[]): TodayLiveSnapshot {
  const stepEvents = events
    .filter((event) => event.dataType === 'steps' && typeof event.valueNumeric === 'number')
    .sort((left, right) => right.timestampStart.localeCompare(left.timestampStart));
  const batteryEvents = events
    .filter((event) => event.dataType === 'charging_state')
    .sort((left, right) => right.timestampStart.localeCompare(left.timestampStart));
  const latestBatteryEvent = batteryEvents[0];
  const locationSamples = extractLocationSamples(events);

  return {
    stepCount: stepEvents[0]?.valueNumeric ?? null,
    stepLastUpdatedAt: stepEvents[0]?.timestampStart ?? null,
    batteryLevel: latestBatteryEvent?.valueNumeric ?? null,
    batteryStateLabel: latestBatteryEvent?.valueText ?? null,
    lowPowerMode: typeof latestBatteryEvent?.metadata.low_power_mode === 'boolean'
      ? latestBatteryEvent.metadata.low_power_mode
      : null,
    batteryLastUpdatedAt: latestBatteryEvent?.timestampStart ?? null,
    locationSamples,
    locationLastUpdatedAt: locationSamples.at(-1)?.timestamp ?? null,
  };
}

export function getLocalDatesForEvents(events: ZentraEventRecord[]): string[] {
  return Array.from(new Set(events.map((event) => getLocalDate(event.timestampStart))));
}

export function getRangeBounds(start: string, end: string): { startIso: string; endExclusiveIso: string } {
  const startDate = parseISODate(start);
  const endExclusiveDate = parseISODate(shiftISODate(end, 1));

  return {
    startIso: startDate.toISOString(),
    endExclusiveIso: endExclusiveDate.toISOString(),
  };
}

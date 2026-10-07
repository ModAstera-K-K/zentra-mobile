import type { SQLiteDatabase } from "expo-sqlite";
import type { ActiveMinutesSummary } from "@/types/active-minutes";
import { resolveActiveMinutes } from "@/utils/active-minutes";
import {
  resolveStepTotal,
  resolvedSleepMinutes,
} from "@/utils/source-resolution";
import type {
  DailyAggregateRecord,
  LocationSample,
  TodayLiveSnapshot,
  ZentraEventRecord,
} from "@/types/zentra";
import {
  compareTimestamps,
  enumerateISODateRange,
  parseISODate,
  shiftISODate,
  toISODate,
} from "@/utils/dates";
import { parseLocationPayload } from "@/utils/location-trends";

const COMPLETENESS_TYPES: ZentraEventRecord["dataType"][] = [
  "steps",
  "activity",
  "app_usage",
  "charging_state",
  "location",
  "sleep_inferred",
];

/**
 * Sum step deltas from sensor step events.
 * Each sensor step event stores the running pedometer counter.
 * Convert consecutive readings to deltas and sum them for the true
 * cumulative step count.
 */
export function computeCumulativeSteps(events: ZentraEventRecord[]): number {
  const sensorSteps = events
    .filter(
      (event) =>
        event.dataType === "steps" &&
        event.source === "sensor" &&
        typeof event.valueNumeric === "number",
    )
    .sort((left, right) =>
      compareTimestamps(left.timestampStart, right.timestampStart),
    );

  if (!sensorSteps.length) {
    return 0;
  }

  let total = Math.max(0, Math.round(sensorSteps[0].valueNumeric ?? 0));
  for (let i = 1; i < sensorSteps.length; i++) {
    const current = Math.max(0, Math.round(sensorSteps[i].valueNumeric ?? 0));
    const previous = Math.max(
      0,
      Math.round(sensorSteps[i - 1].valueNumeric ?? 0),
    );
    total += Math.max(0, current - previous);
  }

  return total;
}

/** Compatibility entry point; the shared resolver owns all activity calculations. */
export function computeActiveMinutes(
  events: ZentraEventRecord[],
  date = toISODate(new Date()),
): number {
  return resolveActiveMinutes(date, events).supportedMinutes ?? 0;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMeters(a: LocationSample, b: LocationSample): number {
  const earthRadius = 6371000;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const latA = toRadians(a.latitude);
  const latB = toRadians(b.latitude);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

function extractLocationSamples(events: ZentraEventRecord[]): LocationSample[] {
  const samples: LocationSample[] = [];

  events
    .filter((event) => event.dataType === "location")
    .forEach((event) => {
      const payload = parseLocationPayload(event.valueJson);
      if (!payload) {
        return;
      }

      samples.push({
        latitude: payload.latitude,
        longitude: payload.longitude,
        timestamp: event.timestampStart,
        altitudeMeters:
          typeof payload.altitude === "number" ? payload.altitude : undefined,
      });
    });

  return samples.sort((left, right) =>
    compareTimestamps(left.timestamp, right.timestamp),
  );
}

function calculateMobilityRadius(samples: LocationSample[]): number | null {
  if (samples.length < 2) {
    return null;
  }

  const origin = samples[0];
  return Math.max(...samples.map((sample) => distanceMeters(origin, sample)));
}

function calculateDistanceTravelled(samples: LocationSample[]): number {
  if (samples.length < 2) {
    return 0;
  }

  let totalDistance = 0;

  for (let index = 1; index < samples.length; index += 1) {
    totalDistance += distanceMeters(samples[index - 1], samples[index]);
  }

  return Math.round(totalDistance);
}

function countTopActivity(events: ZentraEventRecord[]): string | null {
  const activityEvents = events.filter(
    (event) => event.dataType === "activity" && event.valueText,
  );

  // Fall back to motion_context labels when no activity transitions exist
  const source =
    activityEvents.length > 0
      ? activityEvents
      : events.filter(
          (event) => event.dataType === "motion_context" && event.valueText,
        );

  const counts = source.reduce<Record<string, number>>((result, event) => {
    if (!event.valueText) {
      return result;
    }
    result[event.valueText] = (result[event.valueText] ?? 0) + 1;
    return result;
  }, {});

  const topEntry = Object.entries(counts).sort(
    (left, right) => right[1] - left[1],
  )[0];
  return topEntry?.[0] ?? null;
}

function calculateCompleteness(events: ZentraEventRecord[]): number {
  if (!events.length) {
    return 0;
  }

  const presentTypes = new Set(events.map((event) => event.dataType));
  const coveredTypes = COMPLETENESS_TYPES.filter((type) =>
    presentTypes.has(type),
  ).length;

  return Number((coveredTypes / COMPLETENESS_TYPES.length).toFixed(2));
}

function getLocalDate(timestamp: string): string {
  return toISODate(new Date(timestamp));
}

function getScreenTimeSecondsWithinDate(
  event: ZentraEventRecord,
  date: string,
): number {
  if (event.metadata.coverage_window === true) return 0;
  if (
    event.dataType !== "app_usage" ||
    typeof event.valueNumeric !== "number"
  ) {
    return 0;
  }

  const startMs = new Date(event.timestampStart).getTime();
  const endMs = new Date(event.timestampEnd).getTime();
  const dateStartMs = parseISODate(date).getTime();
  const dateEndMs = parseISODate(shiftISODate(date, 1)).getTime();

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return Math.max(0, Math.round(event.valueNumeric ?? 0));
  }

  const overlapMs = Math.max(
    0,
    Math.min(endMs, dateEndMs) - Math.max(startMs, dateStartMs),
  );

  return Math.round(overlapMs / 1000);
}

export function buildDailyAggregateRecord(
  date: string,
  events: ZentraEventRecord[],
  activeSummary?: ActiveMinutesSummary,
): DailyAggregateRecord {
  events = events.filter((event) => event.metadata.stale_import !== true);
  const locationSamples = extractLocationSamples(events);
  const stepsTotal = resolveStepTotal(events) ?? 0;
  const resolvedActivity = activeSummary ?? resolveActiveMinutes(date, events);

  return {
    date,
    stepsTotal,
    activeMinutes: resolvedActivity.supportedMinutes ?? 0,
    activeSummary: resolvedActivity,
    distanceMeters: calculateDistanceTravelled(locationSamples),
    screenTimeSeconds: events.reduce(
      (total, event) => total + getScreenTimeSecondsWithinDate(event, date),
      0,
    ),
    unlockCount: events.filter((event) => event.dataType === "unlock_event")
      .length,
    sleepEstimateMinutes: resolvedSleepMinutes(events, date),
    mobilityRadiusMeters: calculateMobilityRadius(locationSamples),
    topActivity: countTopActivity(events),
    dataCompleteness: calculateCompleteness(events),
    computedAt: new Date().toISOString(),
  };
}

export function buildTodaySnapshot(
  events: ZentraEventRecord[],
): TodayLiveSnapshot {
  events = events.filter((event) => event.metadata.stale_import !== true);
  const stepEvents = events
    .filter(
      (event) =>
        event.dataType === "steps" && typeof event.valueNumeric === "number",
    )
    .sort((left, right) =>
      compareTimestamps(right.timestampStart, left.timestampStart),
    );
  const batteryEvents = events
    .filter((event) => event.dataType === "charging_state")
    .sort((left, right) =>
      compareTimestamps(right.timestampStart, left.timestampStart),
    );
  const latestBatteryEvent = batteryEvents[0];
  const latestBatteryLevelEvent = batteryEvents.find(
    (event) => typeof event.valueNumeric === "number",
  );
  const latestBatteryStateEvent = batteryEvents.find(
    (event) => typeof event.valueText === "string" && event.valueText.length,
  );
  const latestLowPowerModeEvent = batteryEvents.find(
    (event) => typeof event.metadata.low_power_mode === "boolean",
  );
  const locationSamples = extractLocationSamples(events);

  return {
    stepCount: resolveStepTotal(events),
    stepLastUpdatedAt: stepEvents[0]?.timestampStart ?? null,
    batteryLevel: latestBatteryLevelEvent?.valueNumeric ?? null,
    batteryStateLabel: latestBatteryStateEvent?.valueText ?? null,
    lowPowerMode:
      typeof latestLowPowerModeEvent?.metadata.low_power_mode === "boolean"
        ? latestLowPowerModeEvent.metadata.low_power_mode
        : null,
    batteryLastUpdatedAt: latestBatteryEvent?.timestampStart ?? null,
    locationSamples,
    locationLastUpdatedAt: locationSamples.at(-1)?.timestamp ?? null,
  };
}

export function getLocalDatesForEvents(events: ZentraEventRecord[]): string[] {
  return Array.from(
    new Set(
      events.flatMap((event) => {
        const startDate = getLocalDate(event.timestampStart);
        const endDate = getLocalDate(event.timestampEnd);

        return enumerateISODateRange(startDate, endDate);
      }),
    ),
  );
}

export function getRangeBounds(
  start: string,
  end: string,
): { startIso: string; endExclusiveIso: string } {
  const startDate = parseISODate(start);
  const endExclusiveDate = parseISODate(shiftISODate(end, 1));

  return {
    startIso: startDate.toISOString(),
    endExclusiveIso: endExclusiveDate.toISOString(),
  };
}

/**
 * Local dates in [start, end] that have a record starting on them, or a sleep
 * record ending on them. Each date is one probe of the timestamp index;
 * filtering on date(timestamp_start) instead scanned every stored record.
 */
export async function readDatesWithEvents(
  database: SQLiteDatabase,
  start: string,
  end: string,
): Promise<{ date: string }[]> {
  const found = new Set<string>();
  const dates = enumerateISODateRange(start, end);
  // Three bound values per date; stay well under SQLite's variable limit.
  for (let index = 0; index < dates.length; index += 250) {
    const chunk = dates.slice(index, index + 250);
    const rows = await database.getAllAsync<{ date: string }>(
      `WITH days(date, start_iso, end_iso) AS (VALUES ${chunk.map(() => "(?,?,?)").join(",")})
        SELECT date FROM days WHERE EXISTS (
          SELECT 1 FROM events
            WHERE timestamp_start >= start_iso AND timestamp_start < end_iso
        )`,
      ...chunk.flatMap((date) => {
        const day = getRangeBounds(date, date);
        return [date, day.startIso, day.endExclusiveIso];
      }),
    );
    for (const row of rows) found.add(row.date);
  }
  const sleep = await database.getAllAsync<{ date: string }>(
    "SELECT DISTINCT date(timestamp_end,'localtime') AS date FROM events WHERE data_type='sleep_inferred' AND date(timestamp_end,'localtime') BETWEEN ? AND ?",
    start,
    end,
  );
  for (const row of sleep) found.add(row.date);
  return [...found].sort().map((date) => ({ date }));
}

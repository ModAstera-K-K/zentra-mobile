import type {
  DailyAggregateRecord,
  LocationSample,
  TodayLiveSnapshot,
  ZentraEventRecord,
} from "@/types/zentra";
import { parseISODate, shiftISODate, toISODate } from "@/utils/dates";

interface LocationPayload {
  latitude: number;
  longitude: number;
}

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
      left.timestampStart.localeCompare(right.timestampStart),
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

/**
 * Compute active minutes from paired enter/exit activity transitions.
 * Falls back to counting non-still events as 1 minute each if no
 * transition metadata is present (e.g. demo data with timestampStart/End).
 */
export function computeActiveMinutes(events: ZentraEventRecord[]): number {
  const activityEvents = events
    .filter((event) => event.dataType === "activity")
    .sort((left, right) =>
      left.timestampStart.localeCompare(right.timestampStart),
    );

  if (!activityEvents.length) {
    return 0;
  }

  // Check if events use transition metadata (live data)
  const hasTransitions = activityEvents.some(
    (event) =>
      event.metadata.transition === "enter" ||
      event.metadata.transition === "exit",
  );

  if (hasTransitions) {
    return computeActiveMinutesFromTransitions(activityEvents);
  }

  // Fall back to duration from timestampStart/End for non-transition events (demo data)
  return computeActiveMinutesFromDurations(activityEvents);
}

function computeActiveMinutesFromTransitions(
  events: ZentraEventRecord[],
): number {
  let totalMs = 0;
  let activeStart: string | null = null;

  for (const event of events) {
    const isStill = event.valueText === "still";
    const transition = event.metadata.transition;

    if (transition === "enter" && !isStill) {
      activeStart = event.timestampStart;
    } else if (
      (transition === "exit" && !isStill && activeStart) ||
      (transition === "enter" && isStill && activeStart)
    ) {
      const startMs = new Date(activeStart).getTime();
      const endMs = new Date(event.timestampStart).getTime();
      totalMs += Math.max(0, endMs - startMs);
      activeStart = null;
    }
  }

  // If still in an active state at the end, count up to now (capped at 60 min)
  if (activeStart) {
    const startMs = new Date(activeStart).getTime();
    const elapsed = Math.max(0, Date.now() - startMs);
    totalMs += Math.min(elapsed, 60 * 60_000);
  }

  return Math.round(totalMs / 60_000);
}

function computeActiveMinutesFromDurations(
  events: ZentraEventRecord[],
): number {
  let totalMs = 0;

  for (const event of events) {
    if (event.valueText === "still") {
      continue;
    }
    const startMs = new Date(event.timestampStart).getTime();
    const endMs = new Date(event.timestampEnd).getTime();
    const durationMs = Math.max(0, endMs - startMs);
    totalMs += durationMs > 0 ? durationMs : 60_000; // default 1 minute if point-in-time
  }

  return Math.round(totalMs / 60_000);
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

function parseLocationPayload(valueJson?: string): LocationPayload | null {
  if (!valueJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(valueJson) as Partial<LocationPayload>;
    if (
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number"
    ) {
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
    .filter((event) => event.dataType === "location")
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
    if (event.dataType !== "activity" || !event.valueText) {
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

export function buildDailyAggregateRecord(
  date: string,
  events: ZentraEventRecord[],
): DailyAggregateRecord {
  const locationSamples = extractLocationSamples(events);
  const sleepEvent = events
    .filter(
      (event) =>
        event.dataType === "sleep_inferred" &&
        typeof event.valueNumeric === "number",
    )
    .sort((left, right) =>
      right.timestampStart.localeCompare(left.timestampStart),
    )[0];
  const stepsTotal = computeCumulativeSteps(events);

  return {
    date,
    stepsTotal,
    activeMinutes: computeActiveMinutes(events),
    distanceMeters: 0,
    screenTimeSeconds: events
      .filter(
        (event) =>
          event.dataType === "app_usage" &&
          typeof event.valueNumeric === "number",
      )
      .reduce((total, event) => total + Math.round(event.valueNumeric ?? 0), 0),
    unlockCount: events.filter((event) => event.dataType === "unlock_event")
      .length,
    sleepEstimateMinutes: sleepEvent?.valueNumeric
      ? Math.round(sleepEvent.valueNumeric)
      : null,
    mobilityRadiusMeters: calculateMobilityRadius(locationSamples),
    topActivity: countTopActivity(events),
    dataCompleteness: calculateCompleteness(events),
    computedAt: new Date().toISOString(),
  };
}

export function buildTodaySnapshot(
  events: ZentraEventRecord[],
): TodayLiveSnapshot {
  const stepEvents = events
    .filter(
      (event) =>
        event.dataType === "steps" && typeof event.valueNumeric === "number",
    )
    .sort((left, right) =>
      right.timestampStart.localeCompare(left.timestampStart),
    );
  const batteryEvents = events
    .filter((event) => event.dataType === "charging_state")
    .sort((left, right) =>
      right.timestampStart.localeCompare(left.timestampStart),
    );
  const latestBatteryEvent = batteryEvents[0];
  const locationSamples = extractLocationSamples(events);

  return {
    stepCount: stepEvents[0]?.valueNumeric ?? null,
    stepLastUpdatedAt: stepEvents[0]?.timestampStart ?? null,
    batteryLevel: latestBatteryEvent?.valueNumeric ?? null,
    batteryStateLabel: latestBatteryEvent?.valueText ?? null,
    lowPowerMode:
      typeof latestBatteryEvent?.metadata.low_power_mode === "boolean"
        ? latestBatteryEvent.metadata.low_power_mode
        : null,
    batteryLastUpdatedAt: latestBatteryEvent?.timestampStart ?? null,
    locationSamples,
    locationLastUpdatedAt: locationSamples.at(-1)?.timestamp ?? null,
  };
}

export function getLocalDatesForEvents(events: ZentraEventRecord[]): string[] {
  return Array.from(
    new Set(events.map((event) => getLocalDate(event.timestampStart))),
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

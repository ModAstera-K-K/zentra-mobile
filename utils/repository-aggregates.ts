import type {
  DailyAggregateRecord,
  LocationSample,
  TodayLiveSnapshot,
  ZentraEventRecord,
} from "@/types/zentra";
import {
  enumerateISODateRange,
  parseISODate,
  shiftISODate,
  toISODate,
} from "@/utils/dates";

interface LocationPayload {
  latitude: number;
  longitude: number;
  altitude?: number;
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

  if (activityEvents.length) {
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

  // When the Activity Transition API delivers no events, estimate active
  // minutes from motion_context classifications (accelerometer/gyroscope)
  // or from step cadence as a last resort.
  const motionMinutes = computeActiveMinutesFromMotionContext(events);
  if (motionMinutes > 0) {
    return motionMinutes;
  }

  return computeActiveMinutesFromStepCadence(events);
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

/** Each non-sedentary motion_context window (~60 s) counts as 1 active minute. */
function computeActiveMinutesFromMotionContext(
  events: ZentraEventRecord[],
): number {
  const MOTION_WINDOW_MINUTES = 1;
  return (
    events.filter(
      (event) =>
        event.dataType === "motion_context" && event.valueText !== "sedentary",
    ).length * MOTION_WINDOW_MINUTES
  );
}

/**
 * Estimate active minutes from step cadence: group step events into
 * 1-minute bins and count bins where at least one step delta > 0.
 */
function computeActiveMinutesFromStepCadence(
  events: ZentraEventRecord[],
): number {
  const stepEvents = events
    .filter(
      (event) =>
        event.dataType === "steps" &&
        event.source === "sensor" &&
        typeof event.valueNumeric === "number",
    )
    .sort((left, right) =>
      left.timestampStart.localeCompare(right.timestampStart),
    );

  if (stepEvents.length < 2) {
    return 0;
  }

  const activeBins = new Set<number>();
  for (let i = 1; i < stepEvents.length; i++) {
    const current = Math.round(stepEvents[i].valueNumeric ?? 0);
    const previous = Math.round(stepEvents[i - 1].valueNumeric ?? 0);
    if (current > previous) {
      const minuteBin = Math.floor(
        new Date(stepEvents[i].timestampStart).getTime() / 60_000,
      );
      activeBins.add(minuteBin);
    }
  }

  return activeBins.size;
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
    left.timestamp.localeCompare(right.timestamp),
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
    distanceMeters: calculateDistanceTravelled(locationSamples),
    screenTimeSeconds: events.reduce(
      (total, event) => total + getScreenTimeSecondsWithinDate(event, date),
      0,
    ),
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
    stepCount: stepEvents[0]?.valueNumeric ?? null,
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

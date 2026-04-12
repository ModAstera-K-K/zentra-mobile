import type {
  ActivityPatternCell,
  ActivityPatternGranularity,
  EventDataType,
  EventSource,
  UnifiedTimelineBucket,
  UnifiedTimelineResolution,
  UnifiedTimelineWindow,
  ZentraEventRecord,
} from "@/types/zentra";
import { parseISODate, shiftISODate, toISODate } from "@/utils/dates";

const TRACKED_TIMELINE_TYPES: EventDataType[] = [
  "steps",
  "activity",
  "app_usage",
  "screen_state",
  "unlock_event",
  "charging_state",
  "sleep_inferred",
  "location",
  "ambient_light",
  "heart_rate",
  "exercise_session",
];

function getResolutionMinutes(resolution: UnifiedTimelineResolution): number {
  switch (resolution) {
    case "minute":
      return 1;
    case "hour":
      return 60;
    default:
      return 15;
  }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function formatBucketLabel(
  date: Date,
  resolution: UnifiedTimelineResolution,
): string {
  if (resolution === "hour") {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function createCoverageRecord<T extends string>(): Partial<Record<T, number>> {
  return {};
}

function createEmptyBucket(
  start: Date,
  end: Date,
  resolution: UnifiedTimelineResolution,
): UnifiedTimelineBucket {
  return {
    activityEvents: 0,
    ambientLightAverageLux: null,
    batteryLevel: null,
    chargingStateLabel: null,
    dataCompleteness: 0,
    dataTypeCoverage: createCoverageRecord<EventDataType>(),
    dominantKind: "rest",
    exerciseSeconds: 0,
    hasAnyData: false,
    heartRateAverageBpm: null,
    label: formatBucketLabel(start, resolution),
    locationSamples: 0,
    movementScore: 0,
    resolution,
    restScore: 0,
    screenScore: 0,
    screenTimeSeconds: 0,
    sleepMinutes: 0,
    sourceCoverage: createCoverageRecord<EventSource>(),
    steps: 0,
    timestampEnd: end.toISOString(),
    timestampStart: start.toISOString(),
    unlockCount: 0,
  };
}

function enumerateBuckets(
  window: UnifiedTimelineWindow,
): UnifiedTimelineBucket[] {
  const resolutionMinutes = getResolutionMinutes(window.resolution);
  const buckets: UnifiedTimelineBucket[] = [];
  let cursor = new Date(window.startTimestamp);
  const endDate = new Date(window.endTimestamp);

  while (cursor < endDate) {
    const next = addMinutes(cursor, resolutionMinutes);
    buckets.push(createEmptyBucket(cursor, next, window.resolution));
    cursor = next;
  }

  return buckets;
}

function getBucketDurationMs(bucket: UnifiedTimelineBucket): number {
  return (
    new Date(bucket.timestampEnd).getTime() -
    new Date(bucket.timestampStart).getTime()
  );
}

function getOverlapMs(
  eventStartIso: string,
  eventEndIso: string,
  bucket: UnifiedTimelineBucket,
): number {
  const eventStart = new Date(eventStartIso).getTime();
  const eventEnd = new Date(eventEndIso).getTime();
  const bucketStart = new Date(bucket.timestampStart).getTime();
  const bucketEnd = new Date(bucket.timestampEnd).getTime();
  const start = Math.max(eventStart, bucketStart);
  const end = Math.min(eventEnd, bucketEnd);

  return Math.max(0, end - start);
}

function incrementCoverage<T extends string>(
  coverage: Partial<Record<T, number>>,
  key: T,
): void {
  coverage[key] = (coverage[key] ?? 0) + 1;
}

function markBucketCoverage(
  bucket: UnifiedTimelineBucket,
  event: ZentraEventRecord,
): void {
  incrementCoverage(bucket.dataTypeCoverage, event.dataType);
  incrementCoverage(bucket.sourceCoverage, event.source);
  bucket.hasAnyData = true;
}

function toOverlapWeight(
  event: ZentraEventRecord,
  bucket: UnifiedTimelineBucket,
): number {
  const eventStart = event.timestampStart;
  const eventEnd =
    event.timestampEnd > event.timestampStart
      ? event.timestampEnd
      : event.timestampStart;
  const eventStartMs = new Date(eventStart).getTime();
  const eventEndMs = new Date(eventEnd).getTime();
  const durationMs = eventEndMs - eventStartMs;

  // Point-in-time events (start === end): return 1 if the point falls inside the bucket
  if (durationMs <= 0) {
    const bucketStartMs = new Date(bucket.timestampStart).getTime();
    const bucketEndMs = new Date(bucket.timestampEnd).getTime();
    return eventStartMs >= bucketStartMs && eventStartMs < bucketEndMs ? 1 : 0;
  }

  const overlapMs = getOverlapMs(eventStart, eventEnd, bucket);
  return overlapMs / durationMs;
}

function parseBatteryLevel(event: ZentraEventRecord): number | null {
  return typeof event.valueNumeric === "number" ? event.valueNumeric : null;
}

function parseHeartRateValue(event: ZentraEventRecord): number | null {
  return typeof event.valueNumeric === "number" ? event.valueNumeric : null;
}

function getMovementContribution(event: ZentraEventRecord): number {
  if (event.dataType === "activity") {
    return event.valueText === "still" ? 0 : 6;
  }

  if (event.dataType === "location") {
    return 2;
  }

  return 0;
}

function getScreenStateContribution(event: ZentraEventRecord): {
  rest: number;
  screen: number;
} {
  if (event.valueText === "interactive") {
    return { rest: 0, screen: 3 };
  }

  if (event.valueText === "non_interactive") {
    return { rest: 3, screen: 0 };
  }

  return { rest: 0, screen: 0 };
}

function buildSensorStepDeltaMap(
  events: ZentraEventRecord[],
): Map<string, number> {
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
  const deltas = new Map<string, number>();
  let previousCount: number | null = null;

  sensorSteps.forEach((event) => {
    const currentCount = Math.max(0, Math.round(event.valueNumeric ?? 0));
    const delta =
      previousCount === null
        ? currentCount
        : Math.max(0, currentCount - previousCount);
    deltas.set(event.id, delta);
    previousCount = currentCount;
  });

  return deltas;
}

function applyStepsEvent(
  bucket: UnifiedTimelineBucket,
  event: ZentraEventRecord,
  sensorStepDeltas: Map<string, number>,
  weight: number,
): void {
  let delta: number;
  if (event.source === "sensor") {
    delta = Math.round((sensorStepDeltas.get(event.id) ?? 0) * weight);
  } else {
    delta = Math.round((event.valueNumeric ?? 0) * weight);
  }

  bucket.steps += delta;

  if (delta > 0) {
    bucket.movementScore += Math.max(1, Math.round(delta / 50));
  }
}

function applyActivityEvent(
  bucket: UnifiedTimelineBucket,
  event: ZentraEventRecord,
): void {
  bucket.activityEvents += 1;
  bucket.movementScore += getMovementContribution(event);

  if (event.valueText === "still") {
    bucket.restScore += 2;
  }
}

function applyAppUsageEvent(
  bucket: UnifiedTimelineBucket,
  event: ZentraEventRecord,
  weight: number,
): void {
  const durationSeconds = Math.round((event.valueNumeric ?? 0) * weight);
  bucket.screenTimeSeconds += durationSeconds;
  bucket.screenScore += Math.max(1, Math.round(durationSeconds / 300));
}

function applyScreenStateEvent(
  bucket: UnifiedTimelineBucket,
  event: ZentraEventRecord,
): void {
  const contribution = getScreenStateContribution(event);
  bucket.screenScore += contribution.screen;
  bucket.restScore += contribution.rest;
}

function applyUnlockEvent(bucket: UnifiedTimelineBucket): void {
  bucket.unlockCount += 1;
  bucket.screenScore += 1;
}

function applyChargingStateEvent(
  bucket: UnifiedTimelineBucket,
  event: ZentraEventRecord,
): void {
  bucket.batteryLevel = parseBatteryLevel(event);
  bucket.chargingStateLabel = event.valueText ?? null;
}

function applySleepEvent(
  bucket: UnifiedTimelineBucket,
  event: ZentraEventRecord,
  weight: number,
): void {
  const durationMinutes = Math.round((event.valueNumeric ?? 0) * weight);
  bucket.sleepMinutes += durationMinutes;
  bucket.restScore += Math.max(1, Math.round(durationMinutes / 15));
}

function applyLocationEvent(bucket: UnifiedTimelineBucket): void {
  bucket.locationSamples += 1;
  bucket.movementScore += 2;
}

function applyAmbientLightEvent(
  bucket: UnifiedTimelineBucket,
  event: ZentraEventRecord,
): void {
  const nextValue =
    typeof event.valueNumeric === "number" ? event.valueNumeric : null;
  if (nextValue === null) {
    return;
  }

  if (bucket.ambientLightAverageLux === null) {
    bucket.ambientLightAverageLux = nextValue;
    return;
  }

  bucket.ambientLightAverageLux = Math.round(
    (bucket.ambientLightAverageLux + nextValue) / 2,
  );
}

function applyHeartRateEvent(
  bucket: UnifiedTimelineBucket,
  event: ZentraEventRecord,
): void {
  const nextValue = parseHeartRateValue(event);
  if (nextValue === null) {
    return;
  }

  if (bucket.heartRateAverageBpm === null) {
    bucket.heartRateAverageBpm = nextValue;
    return;
  }

  bucket.heartRateAverageBpm = Number(
    ((bucket.heartRateAverageBpm + nextValue) / 2).toFixed(1),
  );
}

function applyExerciseEvent(
  bucket: UnifiedTimelineBucket,
  event: ZentraEventRecord,
  weight: number,
): void {
  const durationSeconds = Math.round((event.valueNumeric ?? 0) * weight);
  bucket.exerciseSeconds += durationSeconds;
  bucket.movementScore += Math.max(1, Math.round(durationSeconds / 600));
}

function applyEventToBucket(
  bucket: UnifiedTimelineBucket,
  event: ZentraEventRecord,
  sensorStepDeltas: Map<string, number>,
): void {
  const weight = toOverlapWeight(event, bucket);
  if (weight <= 0) {
    return;
  }

  markBucketCoverage(bucket, event);

  switch (event.dataType) {
    case "steps":
      applyStepsEvent(bucket, event, sensorStepDeltas, weight);
      break;
    case "activity":
      applyActivityEvent(bucket, event);
      break;
    case "app_usage":
      applyAppUsageEvent(bucket, event, weight);
      break;
    case "screen_state":
      applyScreenStateEvent(bucket, event);
      break;
    case "unlock_event":
      applyUnlockEvent(bucket);
      break;
    case "charging_state":
      applyChargingStateEvent(bucket, event);
      break;
    case "sleep_inferred":
      applySleepEvent(bucket, event, weight);
      break;
    case "location":
      applyLocationEvent(bucket);
      break;
    case "ambient_light":
      applyAmbientLightEvent(bucket, event);
      break;
    case "heart_rate":
      applyHeartRateEvent(bucket, event);
      break;
    case "exercise_session":
      applyExerciseEvent(bucket, event, weight);
      break;
    default:
      break;
  }
}

function getDominantKind(
  bucket: UnifiedTimelineBucket,
): ActivityPatternCell["dominantKind"] {
  if (
    bucket.movementScore >= bucket.screenScore &&
    bucket.movementScore >= bucket.restScore
  ) {
    return bucket.movementScore > 0 ? "movement" : "rest";
  }

  if (bucket.screenScore >= bucket.restScore) {
    return bucket.screenScore > 0 ? "screen" : "rest";
  }

  return "rest";
}

function finalizeBucket(bucket: UnifiedTimelineBucket): UnifiedTimelineBucket {
  const coveredTypes = TRACKED_TIMELINE_TYPES.filter(
    (type) => (bucket.dataTypeCoverage[type] ?? 0) > 0,
  ).length;

  return {
    ...bucket,
    dataCompleteness: Number(
      (coveredTypes / TRACKED_TIMELINE_TYPES.length).toFixed(2),
    ),
    dominantKind: getDominantKind(bucket),
  };
}

function getIntensityValue(
  cell: Omit<ActivityPatternCell, "intensity">,
): number {
  return Math.max(cell.movementScore, cell.screenScore, cell.restScore);
}

function normalizePatternIntensity(
  cells: Omit<ActivityPatternCell, "intensity">[],
): ActivityPatternCell[] {
  const maxValue = Math.max(0, ...cells.map(getIntensityValue));

  return cells.map((cell) => ({
    ...cell,
    intensity:
      maxValue <= 0 || !cell.hasAnyData
        ? 0
        : Math.max(
            8,
            Math.min(
              100,
              Math.round((getIntensityValue(cell) / maxValue) * 100),
            ),
          ),
  }));
}

function createPatternCell(
  granularity: ActivityPatternGranularity,
  start: Date,
  end: Date,
  bucket: {
    movementScore: number;
    restScore: number;
    screenScore: number;
    hasAnyData: boolean;
  },
  label: string,
  detailLabel: string,
): Omit<ActivityPatternCell, "intensity"> {
  const dominantKind =
    bucket.movementScore >= bucket.screenScore &&
    bucket.movementScore >= bucket.restScore
      ? bucket.movementScore > 0
        ? "movement"
        : "rest"
      : bucket.screenScore >= bucket.restScore
        ? bucket.screenScore > 0
          ? "screen"
          : "rest"
        : "rest";

  return {
    detailLabel,
    dominantKind,
    endTimestamp: end.toISOString(),
    granularity,
    hasAnyData: bucket.hasAnyData,
    id: `${granularity}-${start.toISOString()}`,
    label,
    movementScore: bucket.movementScore,
    restScore: bucket.restScore,
    screenScore: bucket.screenScore,
    startTimestamp: start.toISOString(),
  };
}

function summarizeTimeline(buckets: UnifiedTimelineBucket[]): {
  hasAnyData: boolean;
  movementScore: number;
  restScore: number;
  screenScore: number;
} {
  return buckets.reduce<{
    hasAnyData: boolean;
    movementScore: number;
    restScore: number;
    screenScore: number;
  }>(
    (result, bucket) => ({
      hasAnyData: result.hasAnyData || bucket.hasAnyData,
      movementScore: result.movementScore + bucket.movementScore,
      restScore: result.restScore + bucket.restScore,
      screenScore: result.screenScore + bucket.screenScore,
    }),
    {
      hasAnyData: false,
      movementScore: 0,
      restScore: 0,
      screenScore: 0,
    },
  );
}

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function buildUnifiedTimeline(
  events: ZentraEventRecord[],
  window: UnifiedTimelineWindow,
): UnifiedTimelineBucket[] {
  const buckets = enumerateBuckets(window);

  if (!buckets.length || !events.length) {
    return buckets;
  }

  const resolutionMs = getResolutionMinutes(window.resolution) * 60_000;
  const windowStartMs = new Date(window.startTimestamp).getTime();
  const windowEndMs = new Date(window.endTimestamp).getTime();
  const sensorStepDeltas = buildSensorStepDeltaMap(events);

  events.forEach((event) => {
    const eventStartMs = new Date(event.timestampStart).getTime();
    const eventEndMs =
      event.timestampEnd > event.timestampStart
        ? new Date(event.timestampEnd).getTime()
        : eventStartMs;

    if (eventEndMs < windowStartMs || eventStartMs >= windowEndMs) {
      return;
    }

    const firstBucket = Math.max(
      0,
      Math.floor((eventStartMs - windowStartMs) / resolutionMs),
    );
    const lastBucket = Math.min(
      buckets.length - 1,
      Math.floor(
        (Math.min(eventEndMs, windowEndMs - 1) - windowStartMs) / resolutionMs,
      ),
    );

    for (let i = firstBucket; i <= lastBucket; i++) {
      applyEventToBucket(buckets[i], event, sensorStepDeltas);
    }
  });

  return buckets.map(finalizeBucket);
}

export function buildUnifiedDailyTimeline(
  events: ZentraEventRecord[],
  date: string,
  resolution: UnifiedTimelineResolution = "15min",
): UnifiedTimelineBucket[] {
  const start = parseISODate(date);
  const end = parseISODate(shiftISODate(date, 1));

  return buildUnifiedTimeline(events, {
    endTimestamp: end.toISOString(),
    resolution,
    startTimestamp: start.toISOString(),
  });
}

export function buildMonthlyActivityPattern(
  events: ZentraEventRecord[],
  anchorDate: string,
  resolution: UnifiedTimelineResolution = "15min",
): ActivityPatternCell[] {
  const anchor = parseISODate(anchorDate);
  // Find the Monday of the current week
  const anchorDay = anchor.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const mondayOffset = anchorDay === 0 ? 6 : anchorDay - 1; // days since Monday
  const currentWeekMonday = shiftISODate(anchorDate, -mondayOffset);
  // Start 3 weeks before that Monday = 4 weeks total
  const gridStart = shiftISODate(currentWeekMonday, -21);

  const cells: Omit<ActivityPatternCell, "intensity">[] = [];

  for (let offset = 0; offset < 28; offset += 1) {
    const currentDate = shiftISODate(gridStart, offset);
    const current = parseISODate(currentDate);
    const next = parseISODate(shiftISODate(currentDate, 1));
    const isFuture = currentDate > anchorDate;

    if (isFuture) {
      cells.push({
        detailLabel: "",
        dominantKind: "rest",
        endTimestamp: next.toISOString(),
        granularity: "month",
        hasAnyData: false,
        id: `month-placeholder-${offset}`,
        label: String(current.getDate()),
        movementScore: 0,
        placeholder: true,
        restScore: 0,
        screenScore: 0,
        startTimestamp: current.toISOString(),
      });
    } else {
      const timeline = buildUnifiedDailyTimeline(
        events,
        currentDate,
        resolution,
      );
      const summary = summarizeTimeline(timeline);

      cells.push({
        ...createPatternCell(
          "month",
          current,
          next,
          summary,
          String(current.getDate()),
          new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
          }).format(current),
        ),
        placeholder: false,
      });
    }
  }

  return normalizePatternIntensity(cells);
}

export function buildYearlyActivityPattern(
  events: ZentraEventRecord[],
  anchorDate: string,
  resolution: UnifiedTimelineResolution = "15min",
): ActivityPatternCell[] {
  const anchorMonthStart = getMonthStart(parseISODate(anchorDate));
  const cells: Omit<ActivityPatternCell, "intensity">[] = [];

  for (let offset = 11; offset >= 0; offset -= 1) {
    const monthStart = shiftMonth(anchorMonthStart, -offset);
    const nextMonthStart = shiftMonth(monthStart, 1);
    const currentDate = toISODate(monthStart);
    const lastDate = shiftISODate(toISODate(nextMonthStart), -1);
    const timeline = buildUnifiedTimeline(events, {
      endTimestamp: nextMonthStart.toISOString(),
      resolution,
      startTimestamp: monthStart.toISOString(),
    });
    const summary = summarizeTimeline(timeline);

    cells.push(
      createPatternCell(
        "year",
        monthStart,
        nextMonthStart,
        summary,
        new Intl.DateTimeFormat("en-US", { month: "short" }).format(monthStart),
        `${new Intl.DateTimeFormat("en-US", { month: "long" }).format(monthStart)} ${monthStart.getFullYear()} (${currentDate} to ${lastDate})`,
      ),
    );
  }

  return normalizePatternIntensity(cells);
}

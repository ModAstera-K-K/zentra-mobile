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
import {
  buildDailyRhythmMovementScore,
  buildActivityScoreMaxima,
  buildBucketCompositeScores,
  buildNormalizedScreenScore,
} from "@/utils/activity-intensity";
import type { ActivityScoreMaxima } from "@/types/zentra";
import { parseISODate, shiftISODate, toISODate } from "@/utils/dates";
import {
  buildSensorStepDeltaMap,
  getResolvedStepEvents,
  getStepEventResolvedValue,
} from "@/utils/source-resolution";

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
    dailyRhythmMovementScore: 0,
    dataTypeCoverage: createCoverageRecord<EventDataType>(),
    dominantKind: "rest",
    exerciseSeconds: 0,
    heartRateLoad: 0,
    hasAnyData: false,
    heartRateAverageBpm: null,
    idleSignals: 0,
    intensityScore: 0,
    label: formatBucketLabel(start, resolution),
    locationSamples: 0,
    movementSignals: 0,
    movementScore: 0,
    nonSedentaryActivityCount: 0,
    normalizedScreenScore: 0,
    resolution,
    restCompositeScore: 0,
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

function applyStepsEvent(
  bucket: UnifiedTimelineBucket,
  event: ZentraEventRecord,
  sensorStepDeltas: Map<string, number>,
  weight: number,
): void {
  const delta = Math.round(
    getStepEventResolvedValue(event, sensorStepDeltas) * weight,
  );

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
    bucket.idleSignals += 1;
    bucket.restScore += 2;
    return;
  }

  bucket.nonSedentaryActivityCount += 1;
  bucket.movementSignals += 1;
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

  if (event.valueText === "non_interactive") {
    bucket.idleSignals += 1;
  }
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
  bucket.movementSignals += 1;
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
  bucket.heartRateLoad = bucket.heartRateAverageBpm;
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
    heartRateLoad: bucket.heartRateAverageBpm ?? bucket.heartRateLoad,
  };
}

function buildRawUnifiedTimeline(
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
  const resolvedStepEvents = getResolvedStepEvents(events);
  const sensorStepDeltas = buildSensorStepDeltaMap(resolvedStepEvents);
  const eventsForTimeline = [
    ...events.filter((event) => event.dataType !== "steps"),
    ...resolvedStepEvents,
  ];

  eventsForTimeline.forEach((event) => {
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

function buildEventWindow(
  events: ZentraEventRecord[],
  resolution: UnifiedTimelineResolution,
): UnifiedTimelineWindow | null {
  if (!events.length) {
    return null;
  }

  const resolutionMs = getResolutionMinutes(resolution) * 60_000;
  let minStartMs = Number.POSITIVE_INFINITY;
  let maxEndMs = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    const startMs = new Date(event.timestampStart).getTime();
    const endMs =
      event.timestampEnd > event.timestampStart
        ? new Date(event.timestampEnd).getTime()
        : startMs + resolutionMs;

    minStartMs = Math.min(minStartMs, startMs);
    maxEndMs = Math.max(maxEndMs, endMs);
  }

  if (!Number.isFinite(minStartMs) || !Number.isFinite(maxEndMs)) {
    return null;
  }

  return {
    endTimestamp: new Date(maxEndMs).toISOString(),
    resolution,
    startTimestamp: new Date(minStartMs).toISOString(),
  };
}

function applyCompositeScores(
  buckets: UnifiedTimelineBucket[],
  normalizationBuckets: UnifiedTimelineBucket[],
): UnifiedTimelineBucket[] {
  const maxima = buildActivityScoreMaxima(normalizationBuckets);

  return applyMaxima(buckets, maxima);
}

function applyMaxima(
  buckets: UnifiedTimelineBucket[],
  maxima: ActivityScoreMaxima,
): UnifiedTimelineBucket[] {
  return buckets.map((bucket) => {
    const composite = buildBucketCompositeScores(bucket, maxima);
    return {
      ...bucket,
      dailyRhythmMovementScore: buildDailyRhythmMovementScore(bucket, maxima),
      intensityScore: composite.intensityScore,
      normalizedScreenScore: buildNormalizedScreenScore(
        bucket.screenScore,
        maxima,
      ),
      restCompositeScore: composite.restCompositeScore,
    };
  });
}

function getIntensityValue(
  cell: Omit<ActivityPatternCell, "intensity">,
): number {
  return cell.intensityScore;
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
    hasAnyData: boolean;
    intensityScore: number;
    restCompositeScore: number;
  },
  label: string,
  detailLabel: string,
): Omit<ActivityPatternCell, "intensity"> {
  const dominantKind =
    bucket.intensityScore >= bucket.restCompositeScore &&
    bucket.intensityScore > 0
      ? "movement"
      : "rest";

  return {
    detailLabel,
    dominantKind,
    endTimestamp: end.toISOString(),
    granularity,
    hasAnyData: bucket.hasAnyData,
    id: `${granularity}-${start.toISOString()}`,
    intensityScore: bucket.intensityScore,
    label,
    movementScore: bucket.intensityScore,
    restCompositeScore: bucket.restCompositeScore,
    restScore: bucket.restCompositeScore,
    screenScore: 0,
    startTimestamp: start.toISOString(),
  };
}

function summarizeTimeline(buckets: UnifiedTimelineBucket[]): {
  hasAnyData: boolean;
  intensityScore: number;
  restCompositeScore: number;
} {
  const bucketsWithData = buckets.filter((bucket) => bucket.hasAnyData);

  if (!bucketsWithData.length) {
    return {
      hasAnyData: false,
      intensityScore: 0,
      restCompositeScore: 0,
    };
  }

  return {
    hasAnyData: true,
    intensityScore:
      bucketsWithData.reduce(
        (total, bucket) => total + bucket.intensityScore,
        0,
      ) / bucketsWithData.length,
    restCompositeScore:
      bucketsWithData.reduce(
        (total, bucket) => total + bucket.restCompositeScore,
        0,
      ) / bucketsWithData.length,
  };
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
  normalizationEvents: ZentraEventRecord[] = events,
  precomputedMaxima?: ActivityScoreMaxima | null,
): UnifiedTimelineBucket[] {
  const buckets = buildRawUnifiedTimeline(events, window);

  if (precomputedMaxima) {
    return applyMaxima(buckets, precomputedMaxima);
  }

  const normalizationWindow = buildEventWindow(
    normalizationEvents,
    window.resolution,
  );

  if (!normalizationWindow) {
    return buckets;
  }

  const normalizationBuckets = buildRawUnifiedTimeline(
    normalizationEvents,
    normalizationWindow,
  );

  return applyCompositeScores(buckets, normalizationBuckets);
}

export function buildUnifiedDailyTimeline(
  events: ZentraEventRecord[],
  date: string,
  resolution: UnifiedTimelineResolution = "15min",
  normalizationEvents: ZentraEventRecord[] = events,
  precomputedMaxima?: ActivityScoreMaxima | null,
): UnifiedTimelineBucket[] {
  const start = parseISODate(date);
  const end = parseISODate(shiftISODate(date, 1));

  return buildUnifiedTimeline(
    events,
    {
      endTimestamp: end.toISOString(),
      resolution,
      startTimestamp: start.toISOString(),
    },
    normalizationEvents,
    precomputedMaxima,
  );
}

export function buildMonthlyActivityPattern(
  events: ZentraEventRecord[],
  anchorDate: string,
  resolution: UnifiedTimelineResolution = "15min",
  normalizationEvents: ZentraEventRecord[] = events,
  precomputedMaxima?: ActivityScoreMaxima | null,
): ActivityPatternCell[] {
  const anchor = parseISODate(anchorDate);
  // Find the Monday of the current week
  const anchorDay = anchor.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const mondayOffset = anchorDay === 0 ? 6 : anchorDay - 1; // days since Monday
  const currentWeekMonday = shiftISODate(anchorDate, -mondayOffset);
  // Start 3 weeks before that Monday = 4 weeks total
  const gridStart = shiftISODate(currentWeekMonday, -21);

  // Partition events by date once (O(events)) instead of scanning all events per day (O(28 × events))
  const gridStartMs = parseISODate(gridStart).getTime();
  const gridEndMs = parseISODate(shiftISODate(gridStart, 28)).getTime();
  const gridLastDate = shiftISODate(gridStart, 27);
  const eventsByDate = new Map<string, ZentraEventRecord[]>();

  for (const event of events) {
    const startMs = new Date(event.timestampStart).getTime();
    const endMs =
      event.timestampEnd > event.timestampStart
        ? new Date(event.timestampEnd).getTime()
        : startMs;

    if (endMs < gridStartMs || startMs >= gridEndMs) {
      continue;
    }

    // Use local ISO date keys instead of fixed 24h ms offsets so DST days do not shift buckets.
    const boundedEndMs = Math.min(endMs, gridEndMs - 1);
    let dateKey = toISODate(new Date(Math.max(startMs, gridStartMs)));
    const lastDateKey = toISODate(new Date(boundedEndMs));

    if (dateKey < gridStart) {
      dateKey = gridStart;
    }

    while (dateKey <= lastDateKey && dateKey <= gridLastDate) {
      let bucket = eventsByDate.get(dateKey);
      if (!bucket) {
        bucket = [];
        eventsByDate.set(dateKey, bucket);
      }
      bucket.push(event);
      dateKey = shiftISODate(dateKey, 1);
    }
  }

  const cells: Omit<ActivityPatternCell, "intensity">[] = [];
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });

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
        intensityScore: 0,
        label: String(current.getDate()),
        movementScore: 0,
        placeholder: true,
        restCompositeScore: 0,
        restScore: 0,
        screenScore: 0,
        startTimestamp: current.toISOString(),
      });
    } else {
      const dayEvents = eventsByDate.get(currentDate) ?? [];
      const timeline = buildUnifiedDailyTimeline(
        dayEvents,
        currentDate,
        resolution,
        normalizationEvents,
        precomputedMaxima,
      );
      const summary = summarizeTimeline(timeline);

      cells.push({
        ...createPatternCell(
          "month",
          current,
          next,
          summary,
          String(current.getDate()),
          dateFormatter.format(current),
        ),
        placeholder: false,
      });
    }
  }

  return normalizePatternIntensity(cells);
}

/**
 * Pre-compute the normalization maxima from a set of events. Pass the result
 * to `buildUnifiedDailyTimeline` or `buildMonthlyActivityPattern` as
 * `precomputedMaxima` to avoid recomputing the normalization pass on every
 * call (e.g. 28× in the monthly pattern loop).
 */
export function buildNormalizationMaxima(
  normalizationEvents: ZentraEventRecord[],
  resolution: UnifiedTimelineResolution,
): ActivityScoreMaxima | null {
  const window = buildEventWindow(normalizationEvents, resolution);
  if (!window) return null;
  const buckets = buildRawUnifiedTimeline(normalizationEvents, window);
  return buildActivityScoreMaxima(buckets);
}

export function buildYearlyActivityPattern(
  events: ZentraEventRecord[],
  anchorDate: string,
  resolution: UnifiedTimelineResolution = "15min",
  normalizationEvents: ZentraEventRecord[] = events,
): ActivityPatternCell[] {
  const anchorMonthStart = getMonthStart(parseISODate(anchorDate));
  const cells: Omit<ActivityPatternCell, "intensity">[] = [];

  for (let offset = 11; offset >= 0; offset -= 1) {
    const monthStart = shiftMonth(anchorMonthStart, -offset);
    const nextMonthStart = shiftMonth(monthStart, 1);
    const currentDate = toISODate(monthStart);
    const lastDate = shiftISODate(toISODate(nextMonthStart), -1);
    const timeline = buildUnifiedTimeline(
      events,
      {
        endTimestamp: nextMonthStart.toISOString(),
        resolution,
        startTimestamp: monthStart.toISOString(),
      },
      normalizationEvents,
    );
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

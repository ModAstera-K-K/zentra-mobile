import { resolvedTimelineEventsWork } from "@/utils/source-resolution";
import { runCooperatively } from "@/utils/cooperative-work";
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
import type { ActivityScoreInput } from "@/utils/activity-intensity";
import type { ActivityScoreMaxima } from "@/types/zentra";
import {
  compareTimestamps,
  localDateFormatter,
  parseISODate,
  shiftISODate,
  toISODate,
} from "@/utils/dates";

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

function formatBucketLabel(
  date: Date,
  resolution: UnifiedTimelineResolution,
): string {
  return (
    resolution === "hour"
      ? localDateFormatter("bucket-hour", { hour: "numeric" })
      : localDateFormatter("bucket-minute", {
          hour: "numeric",
          minute: "2-digit",
        })
  ).format(date);
}

function createCoverageRecord<T extends string>(): Partial<Record<T, number>> {
  return {};
}

function createEmptyBucket(
  start: Date,
  end: Date,
  resolution: UnifiedTimelineResolution,
  withLabel: boolean,
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
    label: withLabel ? formatBucketLabel(start, resolution) : "",
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

// Share of an event that falls in a bucket; a point event counts whole in the
// bucket that contains it. Callers pass timestamps already parsed once.
function overlapWeight(
  eventStartMs: number,
  eventEndMs: number,
  bucketStartMs: number,
  bucketEndMs: number,
): number {
  const durationMs = eventEndMs - eventStartMs;
  if (durationMs <= 0) {
    return eventStartMs >= bucketStartMs && eventStartMs < bucketEndMs ? 1 : 0;
  }

  const overlapMs = Math.max(
    0,
    Math.min(eventEndMs, bucketEndMs) - Math.max(eventStartMs, bucketStartMs),
  );
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

function* sensorStepDeltaWork(
  events: ZentraEventRecord[],
): Generator<void, Map<string, number>> {
  const sensorSteps: ZentraEventRecord[] = [];
  for (let i = 0; i < events.length; i++) {
    if (i && i % 500 === 0) yield;
    const event = events[i];
    if (
      event.dataType === "steps" &&
      event.source === "sensor" &&
      typeof event.valueNumeric === "number"
    )
      sensorSteps.push(event);
  }
  yield;
  sensorSteps.sort((left, right) =>
    compareTimestamps(left.timestampStart, right.timestampStart),
  );
  const deltas = new Map<string, number>();
  let previousCount: number | null = null;

  for (let i = 0; i < sensorSteps.length; i++) {
    if (i && i % 500 === 0) yield;
    const event = sensorSteps[i];
    const currentCount = Math.max(0, Math.round(event.valueNumeric ?? 0));
    const delta =
      typeof event.metadata.step_delta === "number"
        ? event.metadata.step_delta
        : previousCount === null
          ? currentCount
          : currentCount < previousCount
            ? currentCount
            : currentCount - previousCount;
    deltas.set(event.id, delta);
    previousCount = currentCount;
  }

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
  weight: number,
): void {
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

interface RawTimelineOptions {
  /** Skip hour labels when only the bucket values are kept, as for stored days. */
  labels?: boolean;
}

// Applications between yield points: fine-grained enough for an 8 ms slice
// without paying a generator resume and a clock read for every event.
const EVENTS_PER_YIELD = 64;

function* rawTimelineWork(
  events: ZentraEventRecord[],
  window: UnifiedTimelineWindow,
  options: RawTimelineOptions = {},
): Generator<void, UnifiedTimelineBucket[]> {
  const withLabels = options.labels !== false;
  const buckets: UnifiedTimelineBucket[] = [];
  const bucketStartMs: number[] = [];
  const bucketEndMs: number[] = [];
  const resolutionMs = getResolutionMinutes(window.resolution) * 60_000;
  const windowStartMs = new Date(window.startTimestamp).getTime();
  const windowEndMs = new Date(window.endTimestamp).getTime();
  for (
    let startMs = windowStartMs;
    startMs < windowEndMs;
    startMs += resolutionMs
  ) {
    const endMs = Math.min(startMs + resolutionMs, windowEndMs);
    buckets.push(
      createEmptyBucket(
        new Date(startMs),
        new Date(endMs),
        window.resolution,
        withLabels,
      ),
    );
    bucketStartMs.push(startMs);
    bucketEndMs.push(endMs);
    yield;
  }

  if (!buckets.length || !events.length) {
    return buckets;
  }

  events = yield* resolvedTimelineEventsWork(events);
  const sensorStepDeltas = yield* sensorStepDeltaWork(events);

  let applied = 0;
  for (const event of events) {
    if (event.metadata.coverage_window === true) continue;
    const eventStartMs = new Date(event.timestampStart).getTime();
    const eventEndMs =
      event.timestampEnd > event.timestampStart
        ? new Date(event.timestampEnd).getTime()
        : eventStartMs;

    if (eventEndMs < windowStartMs || eventStartMs >= windowEndMs) {
      continue;
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
      applyEventToBucket(
        buckets[i],
        event,
        sensorStepDeltas,
        overlapWeight(
          eventStartMs,
          eventEndMs,
          bucketStartMs[i],
          bucketEndMs[i],
        ),
      );
      if (++applied % EVENTS_PER_YIELD === 0) yield;
    }
  }

  for (let i = 0; i < buckets.length; i++) {
    buckets[i] = finalizeBucket(buckets[i]);
    yield;
  }
  return buckets;
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

function buildRawUnifiedTimeline(
  events: ZentraEventRecord[],
  window: UnifiedTimelineWindow,
): UnifiedTimelineBucket[] {
  const work = rawTimelineWork(events, window);
  let next = work.next();
  while (!next.done) next = work.next();
  return next.value;
}

export async function buildUnifiedTimelineAsync(
  events: ZentraEventRecord[],
  window: UnifiedTimelineWindow,
  signal?: AbortSignal,
  maxima?: ActivityScoreMaxima,
  options?: RawTimelineOptions,
): Promise<UnifiedTimelineBucket[]> {
  const buckets = await runCooperatively(
    rawTimelineWork(events, window, options),
    signal,
  );
  return runCooperatively(
    scoreTimelineWork(buckets, maxima ?? buildActivityScoreMaxima(buckets)),
    signal,
  );
}

/**
 * Re-normalize buckets from `buildUnifiedTimelineAsync` against new maxima.
 * Raw bucket fields are untouched by scoring, so this skips the event pass.
 */
export function rescoreTimeline(
  buckets: UnifiedTimelineBucket[],
  maxima: ActivityScoreMaxima,
): UnifiedTimelineBucket[] {
  return applyMaxima(buckets, maxima);
}

function* scoreTimelineWork(
  buckets: UnifiedTimelineBucket[],
  maxima: ActivityScoreMaxima,
): Generator<void, UnifiedTimelineBucket[]> {
  for (let i = 0; i < buckets.length; i++) {
    buckets[i] = applyMaxima([buckets[i]], maxima)[0];
    yield;
  }
  return buckets;
}

export async function buildNormalizationMaximaAsync(
  events: ZentraEventRecord[],
  signal?: AbortSignal,
): Promise<ActivityScoreMaxima> {
  const window = buildEventWindow(events, "hour");
  const buckets = window
    ? await runCooperatively(rawTimelineWork(events, window), signal)
    : [];
  return buildActivityScoreMaxima(buckets);
}

/** Monday-aligned four-week grid rendered by the Today activity pattern. */
export function getMonthlyPatternGrid(anchorDate: string): string[] {
  const anchorDay = parseISODate(anchorDate).getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const mondayOffset = anchorDay === 0 ? 6 : anchorDay - 1; // days since Monday
  // Start 3 weeks before the current week's Monday = 4 weeks total
  const gridStart = shiftISODate(anchorDate, -mondayOffset - 21);
  return Array.from({ length: 28 }, (_, offset) =>
    shiftISODate(gridStart, offset),
  );
}

export type ActivityPatternDayCell = Omit<ActivityPatternCell, "intensity">;

// Partition events by date once (O(events)) instead of scanning all events per day.
function* partitionEventsByDateWork(
  events: ZentraEventRecord[],
  firstDate: string,
  lastDate: string,
): Generator<void, Map<string, ZentraEventRecord[]>> {
  const rangeStartMs = parseISODate(firstDate).getTime();
  const rangeEndMs = parseISODate(shiftISODate(lastDate, 1)).getTime();
  const eventsByDate = new Map<string, ZentraEventRecord[]>();

  let processed = 0;
  for (const event of events) {
    // Yield points only; runCooperatively decides when a time slice is spent.
    if (++processed % 200 === 0) yield;
    const startMs = new Date(event.timestampStart).getTime();
    const endMs =
      event.timestampEnd > event.timestampStart
        ? new Date(event.timestampEnd).getTime()
        : startMs;

    if (endMs < rangeStartMs || startMs >= rangeEndMs) {
      continue;
    }

    // Use local ISO date keys instead of fixed 24h ms offsets so DST days do not shift buckets.
    const boundedEndMs = Math.min(endMs, rangeEndMs - 1);
    let dateKey = toISODate(new Date(Math.max(startMs, rangeStartMs)));
    const lastDateKey = toISODate(new Date(boundedEndMs));

    if (dateKey < firstDate) {
      dateKey = firstDate;
    }

    while (dateKey <= lastDateKey && dateKey <= lastDate) {
      let bucket = eventsByDate.get(dateKey);
      if (!bucket) {
        bucket = [];
        eventsByDate.set(dateKey, bucket);
      }
      bucket.push(event);
      dateKey = shiftISODate(dateKey, 1);
    }
  }

  return eventsByDate;
}

function createPatternDayCell(
  date: string,
  summary: ReturnType<typeof summarizeTimeline>,
): ActivityPatternDayCell {
  const current = parseISODate(date);
  const next = parseISODate(shiftISODate(date, 1));
  return {
    ...createPatternCell(
      "month",
      current,
      next,
      summary,
      String(current.getDate()),
      localDateFormatter("pattern-day", {
        month: "short",
        day: "numeric",
      }).format(current),
    ),
    placeholder: false,
  };
}

/**
 * Build un-normalized pattern cells for a contiguous run of dates. Cells for
 * different date runs (e.g. history vs today) can be computed independently
 * and combined with `assembleMonthlyActivityPattern`.
 */
export async function buildPatternDayCellsAsync(
  events: ZentraEventRecord[],
  dates: string[],
  resolution: UnifiedTimelineResolution,
  precomputedMaxima?: ActivityScoreMaxima | null,
  signal?: AbortSignal,
): Promise<Map<string, ActivityPatternDayCell>> {
  const cells = new Map<string, ActivityPatternDayCell>();
  if (!dates.length) return cells;

  const eventsByDate = await runCooperatively(
    partitionEventsByDateWork(events, dates[0], dates[dates.length - 1]),
    signal,
  );

  for (const date of dates) {
    const timeline = await buildUnifiedTimelineAsync(
      eventsByDate.get(date) ?? [],
      {
        startTimestamp: parseISODate(date).toISOString(),
        endTimestamp: parseISODate(shiftISODate(date, 1)).toISOString(),
        resolution,
      },
      signal,
      precomputedMaxima ?? undefined,
    );
    cells.set(date, createPatternDayCell(date, summarizeTimeline(timeline)));
  }

  return cells;
}

/**
 * Build a pattern cell from a day's cached hourly score inputs. Matches
 * `buildPatternDayCellsAsync` for the same day without re-reading its events.
 */
export function buildPatternDayCellFromSamples(
  date: string,
  samples: ActivityScoreInput[],
  maxima: ActivityScoreMaxima,
): ActivityPatternDayCell {
  const scored = samples
    .filter((sample) => sample.hasAnyData)
    .map((sample) => buildBucketCompositeScores(sample, maxima));

  return createPatternDayCell(
    date,
    scored.length
      ? {
          hasAnyData: true,
          intensityScore:
            scored.reduce((total, score) => total + score.intensityScore, 0) /
            scored.length,
          restCompositeScore:
            scored.reduce(
              (total, score) => total + score.restCompositeScore,
              0,
            ) / scored.length,
        }
      : { hasAnyData: false, intensityScore: 0, restCompositeScore: 0 },
  );
}

/**
 * Lay day cells onto the four-week grid and normalize intensity across it.
 * A past day in `pendingDates` is still being loaded: it is drawn as a
 * placeholder, like a future day, rather than as a day with no records.
 */
export function assembleMonthlyActivityPattern(
  anchorDate: string,
  dayCells: Map<string, ActivityPatternDayCell>,
  pendingDates?: ReadonlySet<string>,
): ActivityPatternCell[] {
  const cells = getMonthlyPatternGrid(anchorDate).map(
    (date, offset): ActivityPatternDayCell => {
      if (date <= anchorDate) {
        const empty = () =>
          createPatternDayCell(date, {
            hasAnyData: false,
            intensityScore: 0,
            restCompositeScore: 0,
          });
        return (
          dayCells.get(date) ??
          (pendingDates?.has(date) ? { ...empty(), placeholder: true } : empty())
        );
      }

      const current = parseISODate(date);
      return {
        detailLabel: "",
        dominantKind: "rest",
        endTimestamp: parseISODate(shiftISODate(date, 1)).toISOString(),
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
      };
    },
  );

  return normalizePatternIntensity(cells);
}

/**
 * A grid saved on `savedOn`, as [date, cell] pairs in grid order.
 *
 * A saved grid is one cell per grid date, so a cell's date is its position.
 * Its timestamps cannot say: they are local midnight where the grid was
 * saved, which is another date once the device is in another time zone. Each
 * cell is therefore re-anchored to its date here and now, so what is drawn,
 * and what a tap looks up, is that calendar day.
 */
function savedPatternGrid(
  cells: ActivityPatternCell[],
  savedOn: string,
): [string, ActivityPatternCell][] {
  const grid = getMonthlyPatternGrid(savedOn);
  if (cells.length !== grid.length) return [];
  return cells.map((cell, index) => {
    const date = grid[index];
    const start = parseISODate(date).toISOString();
    return [
      date,
      {
        ...cell,
        // A future day's placeholder is identified by its position instead.
        id: date > savedOn ? cell.id : `month-${start}`,
        startTimestamp: start,
        endTimestamp: parseISODate(shiftISODate(date, 1)).toISOString(),
      },
    ];
  });
}

/** A grid saved earlier today, as it should be drawn now. */
export function restoreSavedPattern(
  cells: ActivityPatternCell[],
  savedOn: string,
): ActivityPatternCell[] {
  return savedPatternGrid(cells, savedOn).map(([, cell]) => cell);
}

/**
 * The full days of a grid saved on `savedOn`, by local date. The cell for
 * `savedOn` itself is left out: it only held the part of that day so far.
 */
export function patternDayCellsByDate(
  cells: ActivityPatternCell[],
  savedOn: string,
): Map<string, ActivityPatternDayCell> {
  const byDate = new Map<string, ActivityPatternDayCell>();
  for (const [date, cell] of savedPatternGrid(cells, savedOn))
    if (!cell.placeholder && date < savedOn) byDate.set(date, cell);
  return byDate;
}

/**
 * A grid saved on an earlier day, laid onto the grid for `anchorDate`. Days
 * it has no full cell for are pending until their history loads.
 */
export function carryPatternCellsForward(
  anchorDate: string,
  savedCells: ActivityPatternCell[],
  savedOn: string,
): ActivityPatternCell[] {
  const dayCells = patternDayCellsByDate(savedCells, savedOn);
  const pending = new Set(
    getMonthlyPatternGrid(anchorDate).filter(
      (date) => date <= anchorDate && !dayCells.has(date),
    ),
  );
  return assembleMonthlyActivityPattern(anchorDate, dayCells, pending);
}

export async function buildMonthlyActivityPatternAsync(
  events: ZentraEventRecord[],
  anchorDate: string,
  resolution: UnifiedTimelineResolution = "15min",
  precomputedMaxima?: ActivityScoreMaxima | null,
  signal?: AbortSignal,
): Promise<ActivityPatternCell[]> {
  const dates = getMonthlyPatternGrid(anchorDate).filter(
    (date) => date <= anchorDate,
  );
  const dayCells = await buildPatternDayCellsAsync(
    events,
    dates,
    resolution,
    precomputedMaxima,
    signal,
  );
  return assembleMonthlyActivityPattern(anchorDate, dayCells);
}

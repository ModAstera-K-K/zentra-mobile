import { sleepNightSummaries } from "@/utils/sleep-night-summaries";
import { buildMetricObservation } from "@/utils/metric-observations";
import { sleepEventsByWakeDate } from "@/utils/sleep-wake-date";
import { sleepTimelineEvents } from "@/utils/sleep-timeline";
import { resolvedSleepMinutes } from "@/utils/source-resolution";
import {
  buildActivityScoreInputMaxima,
  mergeActivityScoreMaxima,
  type ActivityScoreInput,
} from "@/utils/activity-intensity";
import {
  TREND_DAYPARTS,
  buildTrendDaySummary,
  type ReadingTotal,
  type TrendDaySummary,
} from "@/utils/trend-day-summary";
import { buildPatternDayCellFromSamples } from "@/utils/unified-timeline";
import type {
  DailyAggregateRecord,
  HeatmapCell,
  TrendDetailBar,
  TrendSeries,
  TrendSeriesGroup,
  TrendSeriesGroupKey,
  TrendSurface,
  ZentraEventRecord,
} from "@/types/zentra";
import {
  enumerateISODateRange,
  localDateFormatter,
  parseISODate,
  toISODate,
} from "@/utils/dates";
import { formatMinutes, formatNumber } from "@/utils/format";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HEATMAP_HOURS = [
  "00",
  "02",
  "04",
  "06",
  "08",
  "10",
  "12",
  "14",
  "16",
  "18",
  "20",
  "22",
];

// A range builds one label per point per series, so the formatters are the
// shared ones, which also follow the device into a new time zone.
function formatTrendLabel(dateValue: string, totalPoints: number): string {
  const date = parseISODate(dateValue);

  if (totalPoints <= 14) {
    return localDateFormatter("trend-weekday", { weekday: "short" }).format(
      date,
    );
  }

  return localDateFormatter("trend-date", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function calculateVariability(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  const mean =
    values.reduce((total, value) => total + value, 0) / values.length;

  if (mean === 0) {
    return 0;
  }

  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length;
  const standardDeviation = Math.sqrt(variance);

  return Math.round((standardDeviation / mean) * 100);
}

function calculateChange(first: number, last: number): number | null {
  if (first === 0) {
    return last > 0 ? null : 0;
  }

  return Math.round(((last - first) / first) * 100);
}

function createTrendSeries(
  key: string,
  label: string,
  unit: string,
  tone: TrendSeries["tone"],
  values: (number | null)[],
  dates: string[],
  group?: TrendSeriesGroupKey,
  coverageLabel?: string,
  sourceLabel?: string,
  hasCoverage = values.some((value) => value !== null && value > 0),
): TrendSeries | null {
  if (!hasCoverage) {
    return null;
  }

  return {
    key,
    label,
    unit,
    tone,
    points: values.map((value, index) => ({
      label: formatTrendLabel(dates[index], dates.length),
      value,
    })),
    change:
      key === "activeMinutes" ||
      ((key === "inferredSleep" || key === "importedSleep") &&
        (values[0] == null || values.at(-1) == null))
        ? null
        : calculateChange(values[0] ?? 0, values.at(-1) ?? 0),
    variability: calculateVariability(
      values.filter((v): v is number => v !== null),
    ),
    coverageLabel,
    group,
    sourceLabel,
  };
}

function buildAverageCompletenessLabel(
  aggregates: DailyAggregateRecord[],
): string {
  if (!aggregates.length) {
    return "No coverage yet";
  }

  const averageCompleteness =
    aggregates.reduce((total, record) => total + record.dataCompleteness, 0) /
    aggregates.length;

  return `${Math.round(averageCompleteness * 100)}% avg completeness`;
}

function buildDaysWithDataLabel(
  values: (number | null)[],
  dates: string[],
  qualifier: string,
): string {
  const coveredDays = values.filter(
    (value) => value !== null && value > 0,
  ).length;
  return `${coveredDays}/${dates.length} days ${qualifier}`;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getHealthSourceLabel(
  events: ZentraEventRecord[],
  fallback: string,
): string {
  for (const event of events) {
    if (typeof event.metadata.health_platform === "string") {
      return event.metadata.health_platform;
    }
  }

  return fallback;
}

function buildSleepStartHeatmap(
  events: ZentraEventRecord[],
): TrendSurface | null {
  const cells = DAY_LABELS.flatMap((dayLabel) =>
    HEATMAP_HOURS.map((hourLabel) => ({
      dayLabel,
      hourLabel,
      value: 0,
    })),
  );
  const cellMap = new Map(
    cells.map((cell) => [`${cell.dayLabel}-${cell.hourLabel}`, cell]),
  );
  const sleepEvents = sleepNightSummaries(events);

  if (!sleepEvents.length) {
    return null;
  }

  const sources = new Set<string>();
  for (const event of sleepEvents) {
    const bucket = getHeatmapBucket(new Date(event.timestampStart));
    const cell = cellMap.get(`${bucket.dayLabel}-${bucket.hourLabel}`);
    if (!cell) {
      continue;
    }

    cell.value += 1;
    sources.add(event.source === "health_connect" ? "imported" : "inferred");
  }

  const normalizedCells = cells.filter((cell) => cell.value > 0);
  const maxValue = Math.max(...normalizedCells.map((cell) => cell.value), 0);
  if (maxValue <= 0) {
    return null;
  }

  const strongestCell = normalizedCells.reduce((best, cell) =>
    cell.value > best.value ? cell : best,
  );
  const sourceLabel =
    sources.size > 1
      ? "Sleep history"
      : sources.has("imported")
        ? getHealthSourceLabel(sleepEvents, "Health import")
        : "Local inference";

  return {
    key: "sleepStartHeatmap",
    title: sources.has("inferred") ? "Sleep and Rest Timing" : "Sleep Timing",
    summary: `Selected overnight windows most often begin around ${strongestCell.hourLabel}:00.`,
    tone: "human",
    group: "health",
    valueLabel: `${sleepEvents.length}`,
    metaLabel: "overnight windows",
    coverageLabel: `${sleepEvents.length} selected overnight window${sleepEvents.length === 1 ? "" : "s"} in range`,
    sourceLabel,
    visual: {
      type: "heatmap",
      annotation:
        "When selected sleep or estimated-rest windows begin across this range.",
      cells: cells.map((cell) => ({
        ...cell,
        value: Math.round((cell.value / maxValue) * 100),
      })),
    },
  };
}

function buildHeartRateDaypartSurface(
  days: TrendDaySummary[],
): TrendSurface | null {
  const totals = TREND_DAYPARTS.map((): ReadingTotal => [0, 0]);
  let sourceLabel: string | null = null;
  for (const day of days) {
    day.heartRateDayparts.forEach(([sum, count], index) => {
      totals[index][0] += sum;
      totals[index][1] += count;
    });
    sourceLabel ??= day.heartRatePlatform;
  }
  const readings = totals.reduce((total, [, count]) => total + count, 0);

  if (!readings) {
    return null;
  }

  const bars: TrendDetailBar[] = TREND_DAYPARTS.flatMap((label, index) => {
    const [sum, count] = totals[index];
    if (!count) {
      return [];
    }

    const average = Math.round(sum / count);
    return [{ label, value: average, valueLabel: `${average} bpm` }];
  });

  const peak = bars.reduce((best, bar) =>
    bar.value > best.value ? bar : best,
  );

  return {
    key: "heartRateDayparts",
    title: "Heart Rate Dayparts",
    summary: `${peak.label} ran highest at ${peak.valueLabel} on average.`,
    tone: "human",
    group: "health",
    valueLabel: bars[0]?.valueLabel,
    metaLabel: `${readings} readings`,
    coverageLabel: `${readings} imported reading${readings === 1 ? "" : "s"} across ${bars.length} dayparts`,
    sourceLabel: sourceLabel ?? "Health import",
    visual: {
      type: "distribution",
      annotation: "Average imported heart rate by part of day.",
      bars,
    },
  };
}

function getExerciseDurationMinutes(event: ZentraEventRecord): number {
  if (typeof event.valueNumeric !== "number") {
    return 0;
  }

  if (event.unit === "seconds") {
    return Math.round(event.valueNumeric / 60);
  }

  return Math.round(event.valueNumeric);
}

function buildExerciseMixSurface(
  events: ZentraEventRecord[],
): TrendSurface | null {
  const exerciseEvents = events.filter(
    (event) => event.dataType === "exercise_session",
  );

  if (!exerciseEvents.length) {
    return null;
  }

  const durationByType = new Map<string, number>();
  for (const event of exerciseEvents) {
    const label = titleCase(event.valueText ?? "session");
    durationByType.set(
      label,
      (durationByType.get(label) ?? 0) + getExerciseDurationMinutes(event),
    );
  }

  const bars = Array.from(durationByType.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, minutes]) => ({
      label,
      value: minutes,
      valueLabel: formatMinutes(minutes),
    }));

  if (!bars.length) {
    return null;
  }

  const leader = bars[0];

  return {
    key: "exerciseMix",
    title: "Exercise Mix",
    summary: `${leader.label} led the range with ${leader.valueLabel}.`,
    tone: "physical",
    group: "health",
    valueLabel: leader.valueLabel,
    metaLabel: leader.label,
    coverageLabel: `${formatNumber(exerciseEvents.length)} imported session${exerciseEvents.length === 1 ? "" : "s"} in range`,
    sourceLabel: getHealthSourceLabel(exerciseEvents, "Health import"),
    visual: {
      type: "distribution",
      annotation: "Total imported exercise minutes by session type.",
      bars,
    },
  };
}

/** What a range of Trends is assembled from; none of it is per-record except sleep and exercise. */
export interface TrendRangeInputs {
  /**
   * Day summaries by local date. May hold the day before the range, whose
   * records count toward the range-wide labels and cards as they always have.
   */
  days: Map<string, TrendDaySummary>;
  /** Stored sleep records starting from the day before the range. */
  sleepEvents: ZentraEventRecord[];
  /** Stored exercise sessions starting from the day before the range. */
  exerciseEvents: ZentraEventRecord[];
}

export interface TrendCompositeValues {
  intensityValues: number[];
  restValues: number[];
}

/**
 * Daily activity intensity and rest from stored hourly samples, normalized
 * against the maxima of `dates` themselves. `samplesByDate` may hold other
 * days (the day before the range is loaded for the range-wide cards); a day
 * outside `dates` never sets the scale.
 */
export function buildTrendCompositeValues(
  dates: string[],
  samplesByDate: ReadonlyMap<string, ActivityScoreInput[]>,
): TrendCompositeValues {
  let maxima = buildActivityScoreInputMaxima([]);
  for (const date of dates)
    maxima = mergeActivityScoreMaxima(
      maxima,
      buildActivityScoreInputMaxima(samplesByDate.get(date) ?? []),
    );
  const values: TrendCompositeValues = { intensityValues: [], restValues: [] };
  for (const date of dates) {
    const cell = buildPatternDayCellFromSamples(
      date,
      samplesByDate.get(date) ?? [],
      maxima,
    );
    values.intensityValues.push(Math.round(cell.intensityScore));
    values.restValues.push(Math.round(cell.restCompositeScore));
  }
  return values;
}

/**
 * The inputs a list of raw records gives. Trends itself loads stored day
 * summaries; this is for callers that already hold a range's records.
 */
export function trendInputsFromEvents(
  events: ZentraEventRecord[],
): TrendRangeInputs {
  const byDate = new Map<string, ZentraEventRecord[]>();
  for (const event of events) {
    const date = toISODate(new Date(event.timestampStart));
    const day = byDate.get(date);
    if (day) day.push(event);
    else byDate.set(date, [event]);
  }
  return {
    days: new Map(
      [...byDate]
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([date, day]) => [date, buildTrendDaySummary(date, day)]),
    ),
    sleepEvents: events.filter((event) => event.dataType === "sleep_inferred"),
    exerciseEvents: events.filter(
      (event) => event.dataType === "exercise_session",
    ),
  };
}

function orderedDays(inputs: TrendRangeInputs): TrendDaySummary[] {
  return [...inputs.days]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([, day]) => day);
}

function averageReading([sum, count]: ReadingTotal): number {
  return count ? Math.round(sum / count) : 0;
}

function stepSourceLabel(days: TrendDaySummary[]): string {
  const platform = days.some((day) => day.steps.platform);
  const phone = days.some((day) => day.steps.phone);
  if (platform && phone) return "Platform totals; phone fallback on other days";
  if (platform) return "Platform-resolved health totals";
  if (phone) return "Phone sensor fallback";
  return days.some((day) => day.steps.any)
    ? "Single-source health records; unresolved estimate"
    : "No step observations";
}

export function buildLiveTrendSeries(
  aggregates: DailyAggregateRecord[],
  rangeSelection: { start: string; end: string },
  inputs: TrendRangeInputs,
  composite: TrendCompositeValues,
): TrendSeries[] {
  const dates = enumerateISODateRange(rangeSelection.start, rangeSelection.end);
  const days = orderedDays(inputs);
  const aggregateByDate = new Map(
    aggregates.map((record) => [record.date, record]),
  );

  const normalizedAggregates = dates.map(
    (date) =>
      aggregateByDate.get(date) ?? {
        date,
        stepsTotal: 0,
        activeMinutes: 0,
        distanceMeters: 0,
        screenTimeSeconds: 0,
        unlockCount: 0,
        sleepEstimateMinutes: null,
        mobilityRadiusMeters: null,
        topActivity: null,
        dataCompleteness: 0,
        computedAt: new Date().toISOString(),
      },
  );

  const ambientValues = dates.map((date) =>
    averageReading(inputs.days.get(date)?.ambientLight ?? [0, 0]),
  );
  const heartRateValues = dates.map((date) =>
    averageReading(inputs.days.get(date)?.heartRate ?? [0, 0]),
  );
  const exerciseValues = dates.map(
    (date) =>
      buildMetricObservation("exercise", date, inputs.exerciseEvents, [])
        .value ?? 0,
  );
  const speeds = dates.map(
    (date) => inputs.days.get(date)?.averageSpeedKmh ?? null,
  );
  const gains = dates.map(
    (date) => inputs.days.get(date)?.elevationGainMeters ?? null,
  );
  const averageSpeedValues = speeds.map((value) => value ?? 0);
  const averageSpeedCoveredDays = speeds.filter((v) => v !== null).length;
  const elevationGainValues = gains.map((value) => value ?? 0);
  const elevationCoveredDays = gains.filter((v) => v !== null).length;
  const { intensityValues, restValues } = composite;

  // Source resolution leaves sleep as its expanded, de-overlapped intervals.
  const sleep = sleepTimelineEvents(inputs.sleepEvents);
  const importedSleep = sleep.filter((e) => e.source === "health_connect");
  const inferredSleep = sleep.filter((e) => e.source === "inferred");
  // Grouped into nights once. A night resolves the same from its own records
  // as from the whole list, so each date only looks at its own.
  const importedNights = sleepEventsByWakeDate(importedSleep);
  const inferredNights = sleepEventsByWakeDate(inferredSleep);
  const importedSleepValues = dates.map((date) =>
    resolvedSleepMinutes(importedNights.get(date) ?? [], date),
  );
  const inferredSleepValues = dates.map((date) =>
    resolvedSleepMinutes(inferredNights.get(date) ?? [], date),
  );
  // The first imported record of the range names the platform; sleep follows
  // every other record, as it did when all records were scanned in order.
  const importedSleepSourceLabel =
    days.find((day) => day.healthPlatform)?.healthPlatform ??
    getHealthSourceLabel(importedSleep, "Health import");
  const completenessLabel = buildAverageCompletenessLabel(normalizedAggregates);

  const series = [
    createTrendSeries(
      "steps",
      "Steps",
      "count",
      "hero",
      normalizedAggregates.map((record) => record.stepsTotal),
      dates,
      "body",
      completenessLabel,
      stepSourceLabel(days),
    ),
    createTrendSeries(
      "activeMinutes",
      "Active Minutes",
      "min",
      "physical",
      normalizedAggregates.map(
        (record) => record.activeSummary?.supportedMinutes ?? null,
      ),
      dates,
      "body",
      "Partial timing coverage; gaps mean unavailable",
      "Timed activity + steps · Partial coverage",
    ),
    createTrendSeries(
      "activityIntensity",
      "Activity Intensity",
      "%",
      "physical",
      intensityValues,
      dates,
      "body",
      buildDaysWithDataLabel(intensityValues, dates, "with composite activity"),
      "Local composite",
    ),
    createTrendSeries(
      "distanceMeters",
      "Distance",
      "km",
      "human",
      normalizedAggregates.map(
        (record) => Math.round(((record.distanceMeters ?? 0) / 1000) * 10) / 10,
      ),
      dates,
      "body",
      buildDaysWithDataLabel(
        normalizedAggregates.map((record) => record.distanceMeters ?? 0),
        dates,
        "with distance",
      ),
      "Foreground location",
    ),
    createTrendSeries(
      "avgSpeed",
      "Avg Speed",
      "km/h",
      "physical",
      averageSpeedValues,
      dates,
      "body",
      `${averageSpeedCoveredDays}/${dates.length} days with speed data`,
      "Foreground location",
      averageSpeedCoveredDays > 0,
    ),
    createTrendSeries(
      "elevationGain",
      "Elevation Gain",
      "m",
      "human",
      elevationGainValues,
      dates,
      "body",
      `${elevationCoveredDays}/${dates.length} days with altitude data`,
      "Foreground location",
      elevationCoveredDays > 0,
    ),
    createTrendSeries(
      "screenTime",
      "Screen Time",
      "min",
      "cool",
      normalizedAggregates.map((record) =>
        Math.round(record.screenTimeSeconds / 60),
      ),
      dates,
      "device",
      completenessLabel,
      "Usage Access",
    ),
    createTrendSeries(
      "unlockCount",
      "Unlocks",
      "count",
      "cool",
      normalizedAggregates.map((record) => record.unlockCount),
      dates,
      "device",
      completenessLabel,
      "Usage Access",
    ),
    createTrendSeries(
      "inferredSleep",
      "Estimated Rest",
      "min",
      "human",
      inferredSleepValues,
      dates,
      "health",
      buildDaysWithDataLabel(inferredSleepValues, dates, "with estimated rest"),
      "Local inference / user-reported adjustments",
    ),
    createTrendSeries(
      "importedSleep",
      "Imported Sleep",
      "min",
      "human",
      importedSleepValues,
      dates,
      "health",
      buildDaysWithDataLabel(importedSleepValues, dates, "with imported sleep"),
      importedSleepSourceLabel,
    ),
    createTrendSeries(
      "restScore",
      "Rest Score",
      "%",
      "human",
      restValues,
      dates,
      "health",
      buildDaysWithDataLabel(restValues, dates, "with composite rest"),
      "Local composite",
    ),
    createTrendSeries(
      "mobilityRadius",
      "Mobility Radius",
      "m",
      "human",
      normalizedAggregates.map((record) =>
        Math.round(record.mobilityRadiusMeters ?? 0),
      ),
      dates,
      "body",
      buildDaysWithDataLabel(
        normalizedAggregates.map((record) =>
          Math.round(record.mobilityRadiusMeters ?? 0),
        ),
        dates,
        "with location",
      ),
      "Foreground location",
    ),
    createTrendSeries(
      "ambientLight",
      "Ambient Light",
      "lux",
      "cool",
      ambientValues,
      dates,
      "environment",
      buildDaysWithDataLabel(ambientValues, dates, "with sensor data"),
      "Light sensor",
    ),
    createTrendSeries(
      "dataCompleteness",
      "Signal types observed",
      "%",
      "hero",
      normalizedAggregates.map((record) =>
        Math.round(record.dataCompleteness * 100),
      ),
      dates,
      "quality",
      `${Math.round(
        (normalizedAggregates.reduce(
          (total, record) => total + record.dataCompleteness,
          0,
        ) /
          Math.max(normalizedAggregates.length, 1)) *
          100,
      )}% range average`,
      "Signal diversity, not continuous observation coverage",
    ),
    createTrendSeries(
      "heartRate",
      "Heart Rate",
      "bpm",
      "human",
      heartRateValues,
      dates,
      "health",
      buildDaysWithDataLabel(heartRateValues, dates, "with imports"),
      "Health Connect",
    ),
    createTrendSeries(
      "exerciseSessions",
      "Exercise",
      "min",
      "physical",
      exerciseValues,
      dates,
      "health",
      buildDaysWithDataLabel(exerciseValues, dates, "with sessions"),
      "Health Connect",
    ),
  ];

  const observed = new Map<string, Set<string>>();
  for (const [date, day] of inputs.days)
    if (day.observedTypes.length)
      observed.set(date, new Set(day.observedTypes));
  for (const event of sleep) {
    const date = toISODate(new Date(event.timestampEnd));
    const types = observed.get(date) ?? new Set<string>();
    types.add(event.dataType);
    observed.set(date, types);
  }
  const hasSleep = (key: string, date: string) =>
    (key === "importedSleep" ? importedNights : inferredNights).has(date);
  const signalForSeries: Record<string, string[]> = {
    steps: ["steps"],
    activeMinutes: ["activity", "motion_context", "steps"],
    distanceMeters: ["location"],
    avgSpeed: ["location"],
    elevationGain: ["location"],
    screenTime: ["app_usage", "screen_state"],
    unlockCount: ["unlock_event"],
    sleepEstimate: ["sleep_inferred"],
    importedSleep: ["sleep_inferred"],
    inferredSleep: ["sleep_inferred"],
    heartRate: ["heart_rate"],
    exerciseSessions: ["exercise_session"],
    ambientLight: ["ambient_light"],
    mobilityRadius: ["location"],
  };
  return series
    .filter((entry): entry is TrendSeries => entry !== null)
    .map((entry) => {
      const points = entry.points.map((point, index) => ({
        ...point,
        value:
          entry.key === "importedSleep" || entry.key === "inferredSleep"
            ? hasSleep(entry.key, dates[index])
              ? point.value
              : null
            : (signalForSeries[entry.key] ?? []).length
              ? signalForSeries[entry.key].some((type) =>
                  observed.get(dates[index])?.has(type),
                )
                ? point.value
                : null
              : observed.has(dates[index])
                ? point.value
                : null,
      }));
      const values = points
        .map((point) => point.value)
        .filter((value): value is number => value !== null);
      return {
        ...entry,
        points,
        // Eligible matched-week comparisons live in What changed; endpoints are not comparisons.
        change: null,
        variability: calculateVariability(
          values.filter((v): v is number => v !== null),
        ),
        coverageLabel: `${values.length}/${dates.length} days with available observations`,
      };
    });
}

export function buildLiveTrendSurfaces(
  inputs: TrendRangeInputs,
): TrendSurface[] {
  return [
    buildSleepStartHeatmap(inputs.sleepEvents),
    buildHeartRateDaypartSurface(orderedDays(inputs)),
    buildExerciseMixSurface(inputs.exerciseEvents),
  ].filter((entry): entry is TrendSurface => entry !== null);
}

export const GROUP_ORDER: TrendSeriesGroupKey[] = [
  "body",
  "device",
  "health",
  "environment",
  "quality",
];
export const GROUP_LABELS: Record<TrendSeriesGroupKey, string> = {
  body: "Body & Movement",
  device: "Device Behavior",
  health: "Health & Recovery",
  environment: "Environment",
  quality: "Data Quality",
};

export function groupTrendSeries(series: TrendSeries[]): TrendSeriesGroup[] {
  const grouped = new Map<TrendSeriesGroupKey, TrendSeries[]>();

  series.forEach((entry) => {
    const groupKey = entry.group ?? "body";
    const existing = grouped.get(groupKey) ?? [];
    existing.push(entry);
    grouped.set(groupKey, existing);
  });

  return GROUP_ORDER.filter((key) => grouped.has(key)).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    series: grouped.get(key)!,
  }));
}

function getHeatmapBucket(date: Date): { dayLabel: string; hourLabel: string } {
  const hour = date.getHours();
  const bucketIndex = Math.floor(hour / 2);

  return {
    dayLabel: DAY_LABELS[date.getDay()] ?? "Sun",
    hourLabel: HEATMAP_HOURS[bucketIndex] ?? "00",
  };
}

function getMovementValue(event: ZentraEventRecord): number {
  switch (event.dataType) {
    case "steps":
      return typeof event.valueNumeric === "number" ? event.valueNumeric : 0;
    case "activity":
      return event.valueText === "still" ? 0 : 1;
    case "location":
      return 1;
    default:
      return 0;
  }
}

export function buildLiveHeatmap(events: ZentraEventRecord[]): HeatmapCell[] {
  const cells = DAY_LABELS.flatMap((dayLabel) =>
    HEATMAP_HOURS.map((hourLabel) => ({
      dayLabel,
      hourLabel,
      value: 0,
    })),
  );
  const cellMap = new Map(
    cells.map((cell) => [`${cell.dayLabel}-${cell.hourLabel}`, cell]),
  );
  const movementEvents = events.filter(
    (event) =>
      event.dataType === "steps" ||
      event.dataType === "activity" ||
      event.dataType === "location",
  );

  if (!movementEvents.length) {
    return [];
  }

  movementEvents.forEach((event) => {
    const bucket = getHeatmapBucket(new Date(event.timestampStart));
    const key = `${bucket.dayLabel}-${bucket.hourLabel}`;
    const cell = cellMap.get(key);

    if (!cell) {
      return;
    }

    cell.value += getMovementValue(event);
  });

  const maxValue = Math.max(...cells.map((cell) => cell.value), 0);

  if (maxValue <= 0) {
    return [];
  }

  return cells.map((cell) => ({
    ...cell,
    value: Math.round((cell.value / maxValue) * 100),
  }));
}

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
import { enumerateISODateRange, parseISODate } from "@/utils/dates";
import { formatMinutes, formatNumber } from "@/utils/format";
import { buildDailyLocationTrendData } from "@/utils/location-trends";
import {
  buildNormalizationMaxima,
  buildUnifiedDailyTimeline,
} from "@/utils/unified-timeline";

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

function formatTrendLabel(dateValue: string, totalPoints: number): string {
  const date = parseISODate(dateValue);

  if (totalPoints <= 14) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
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

function calculateChange(first: number, last: number): number {
  if (first === 0) {
    return last > 0 ? 100 : 0;
  }

  return Math.round(((last - first) / first) * 100);
}

function createTrendSeries(
  key: string,
  label: string,
  unit: string,
  tone: TrendSeries["tone"],
  values: number[],
  dates: string[],
  group?: TrendSeriesGroupKey,
  coverageLabel?: string,
  sourceLabel?: string,
  hasCoverage = values.some((value) => value > 0),
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
    change: calculateChange(values[0] ?? 0, values.at(-1) ?? 0),
    variability: calculateVariability(values),
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
  values: number[],
  dates: string[],
  qualifier: string,
): string {
  const coveredDays = values.filter((value) => value > 0).length;
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

function getDaypartLabel(date: Date): string {
  const hour = date.getHours();

  if (hour < 6) {
    return "Night";
  }

  if (hour < 12) {
    return "Morning";
  }

  if (hour < 18) {
    return "Afternoon";
  }

  return "Evening";
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
  const sleepEvents = events.filter(
    (event) =>
      event.dataType === "sleep_inferred" &&
      typeof event.valueNumeric === "number",
  );

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
    title: "Sleep Timing",
    summary: `Sleep windows most often begin around ${strongestCell.hourLabel}:00.`,
    tone: "human",
    group: "health",
    valueLabel: `${sleepEvents.length}`,
    metaLabel: "sleep windows",
    coverageLabel: `${sleepEvents.length} recorded sleep window${sleepEvents.length === 1 ? "" : "s"} in range`,
    sourceLabel,
    visual: {
      type: "heatmap",
      annotation: "When sleep windows usually begin across this range.",
      cells: cells.map((cell) => ({
        ...cell,
        value: Math.round((cell.value / maxValue) * 100),
      })),
    },
  };
}

function buildHeartRateDaypartSurface(
  events: ZentraEventRecord[],
): TrendSurface | null {
  const heartRateEvents = events.filter(
    (event) =>
      event.dataType === "heart_rate" && typeof event.valueNumeric === "number",
  );

  if (!heartRateEvents.length) {
    return null;
  }

  const buckets = new Map<string, number[]>();
  for (const event of heartRateEvents) {
    const label = getDaypartLabel(new Date(event.timestampStart));
    buckets.set(label, [
      ...(buckets.get(label) ?? []),
      event.valueNumeric ?? 0,
    ]);
  }

  const bars: TrendDetailBar[] = ["Night", "Morning", "Afternoon", "Evening"]
    .map((label) => {
      const values = buckets.get(label) ?? [];
      if (!values.length) {
        return null;
      }

      const average = Math.round(
        values.reduce((total, value) => total + value, 0) / values.length,
      );

      return {
        label,
        value: average,
        valueLabel: `${average} bpm`,
      };
    })
    .filter((entry): entry is TrendDetailBar => entry !== null);

  if (!bars.length) {
    return null;
  }

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
    metaLabel: `${heartRateEvents.length} readings`,
    coverageLabel: `${heartRateEvents.length} imported reading${heartRateEvents.length === 1 ? "" : "s"} across ${bars.length} dayparts`,
    sourceLabel: getHealthSourceLabel(heartRateEvents, "Health import"),
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

function buildDailyCompositeValues(
  dates: string[],
  events: ZentraEventRecord[],
): {
  intensityValues: number[];
  restValues: number[];
} {
  const eventsByDate = dates.reduce<Record<string, ZentraEventRecord[]>>(
    (result, date) => {
      result[date] = [];
      return result;
    },
    {},
  );

  for (const event of events) {
    const startKey = event.timestampStart.slice(0, 10);
    const endKey = event.timestampEnd.slice(0, 10);

    if (startKey === endKey) {
      if (eventsByDate[startKey]) {
        eventsByDate[startKey].push(event);
      }
    } else {
      for (const date of dates) {
        if (date >= startKey && date <= endKey && eventsByDate[date]) {
          eventsByDate[date].push(event);
        }
      }
    }
  }

  // Hoist normalization maxima outside the loop — each date used to recompute
  // this from all events, making the loop O(N_days × N_events). Now it's O(N_events)
  // once, then O(n_day_events) per day.
  const normalizationMaxima = buildNormalizationMaxima(events, "hour");

  return dates.reduce<{
    intensityValues: number[];
    restValues: number[];
  }>(
    (result, date) => {
      const dayEvents = eventsByDate[date] ?? [];
      const timeline = buildUnifiedDailyTimeline(
        dayEvents,
        date,
        "hour",
        events,
        normalizationMaxima,
      );
      const bucketsWithData = timeline.filter((bucket) => bucket.hasAnyData);

      if (!bucketsWithData.length) {
        result.intensityValues.push(0);
        result.restValues.push(0);
        return result;
      }

      const averageIntensity =
        bucketsWithData.reduce(
          (total, bucket) => total + bucket.intensityScore,
          0,
        ) / bucketsWithData.length;
      const averageRest =
        bucketsWithData.reduce(
          (total, bucket) => total + bucket.restCompositeScore,
          0,
        ) / bucketsWithData.length;

      result.intensityValues.push(Math.round(averageIntensity));
      result.restValues.push(Math.round(averageRest));
      return result;
    },
    { intensityValues: [], restValues: [] },
  );
}

function buildDailySleepValues(
  dates: string[],
  events: ZentraEventRecord[],
): {
  importedSleepValues: number[];
  importedSleepSourceLabel: string;
  inferredSleepValues: number[];
} {
  const importedByDate = dates.reduce<Record<string, number>>(
    (result, date) => {
      result[date] = 0;
      return result;
    },
    {},
  );
  const inferredByDate = dates.reduce<Record<string, number>>(
    (result, date) => {
      result[date] = 0;
      return result;
    },
    {},
  );
  let importedSleepSourceLabel = "Health import";

  for (const event of events) {
    if (
      event.dataType !== "sleep_inferred" ||
      typeof event.valueNumeric !== "number"
    ) {
      continue;
    }

    if (event.source === "health_connect") {
      if (typeof event.metadata.health_platform === "string") {
        importedSleepSourceLabel = event.metadata.health_platform;
      }
    }

    const startKey = event.timestampStart.slice(0, 10);
    const endKey = event.timestampEnd.slice(0, 10);
    const totalMinutes = Math.round(event.valueNumeric);
    const isImported = event.source === "health_connect";
    const target = isImported ? importedByDate : inferredByDate;

    if (startKey === endKey) {
      if (target[startKey] !== undefined) {
        target[startKey] += totalMinutes;
      }
      continue;
    }

    const startMs = new Date(event.timestampStart).getTime();
    const endMs = new Date(event.timestampEnd).getTime();
    const spanMs = endMs - startMs;

    if (spanMs <= 0) {
      if (target[startKey] !== undefined) {
        target[startKey] += totalMinutes;
      }
      continue;
    }

    for (const date of dates) {
      if (date < startKey || date > endKey) {
        continue;
      }
      if (target[date] === undefined) {
        continue;
      }
      const dayStartMs = new Date(`${date}T00:00:00`).getTime();
      const dayEndMs = dayStartMs + 86_400_000;
      const overlapStart = Math.max(startMs, dayStartMs);
      const overlapEnd = Math.min(endMs, dayEndMs);
      if (overlapEnd > overlapStart) {
        target[date] += Math.round(
          totalMinutes * ((overlapEnd - overlapStart) / spanMs),
        );
      }
    }
  }

  return {
    importedSleepValues: dates.map((date) => importedByDate[date] ?? 0),
    importedSleepSourceLabel,
    inferredSleepValues: dates.map((date) => inferredByDate[date] ?? 0),
  };
}

export function buildLiveTrendSeries(
  aggregates: DailyAggregateRecord[],
  rangeSelection: { start: string; end: string },
  events: ZentraEventRecord[] = [],
): TrendSeries[] {
  const dates = enumerateISODateRange(rangeSelection.start, rangeSelection.end);
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
  const ambientByDate = dates.reduce<Record<string, number[]>>(
    (result, date) => {
      result[date] = [];
      return result;
    },
    {},
  );
  const heartRateByDate = dates.reduce<Record<string, number[]>>(
    (result, date) => {
      result[date] = [];
      return result;
    },
    {},
  );
  const exerciseByDate = dates.reduce<Record<string, number>>(
    (result, date) => {
      result[date] = 0;
      return result;
    },
    {},
  );

  events.forEach((event) => {
    const dateKey = event.timestampStart.slice(0, 10);

    if (
      event.dataType === "ambient_light" &&
      typeof event.valueNumeric === "number"
    ) {
      if (!ambientByDate[dateKey]) {
        ambientByDate[dateKey] = [];
      }
      ambientByDate[dateKey].push(event.valueNumeric);
    }

    if (
      event.dataType === "heart_rate" &&
      typeof event.valueNumeric === "number"
    ) {
      if (!heartRateByDate[dateKey]) {
        heartRateByDate[dateKey] = [];
      }
      heartRateByDate[dateKey].push(event.valueNumeric);
    }

    if (event.dataType === "exercise_session") {
      if (exerciseByDate[dateKey] === undefined) {
        exerciseByDate[dateKey] = 0;
      }
      exerciseByDate[dateKey] +=
        typeof event.valueNumeric === "number"
          ? Math.round(event.valueNumeric)
          : 1;
    }
  });

  const ambientValues = dates.map((date) => {
    const values = ambientByDate[date] ?? [];
    if (!values.length) {
      return 0;
    }

    return Math.round(
      values.reduce((total, value) => total + value, 0) / values.length,
    );
  });

  const heartRateValues = dates.map((date) => {
    const values = heartRateByDate[date] ?? [];
    if (!values.length) {
      return 0;
    }

    return Math.round(
      values.reduce((total, value) => total + value, 0) / values.length,
    );
  });

  const exerciseValues = dates.map((date) => exerciseByDate[date] ?? 0);
  const {
    averageSpeedCoveredDays,
    averageSpeedValues,
    elevationCoveredDays,
    elevationGainValues,
  } = buildDailyLocationTrendData(dates, events);
  const { intensityValues, restValues } = buildDailyCompositeValues(
    dates,
    events,
  );
  const { importedSleepValues, importedSleepSourceLabel, inferredSleepValues } =
    buildDailySleepValues(dates, events);
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
      "Phone sensor",
    ),
    createTrendSeries(
      "activeMinutes",
      "Active Minutes",
      "min",
      "physical",
      normalizedAggregates.map((record) => record.activeMinutes),
      dates,
      "body",
      completenessLabel,
      "Activity recognition",
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
      "Inferred Sleep",
      "min",
      "human",
      inferredSleepValues,
      dates,
      "health",
      buildDaysWithDataLabel(inferredSleepValues, dates, "with inferred sleep"),
      "Local inference",
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
      "Data Completeness",
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
      "Repository aggregate",
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

  return series.filter((entry): entry is TrendSeries => entry !== null);
}

export function buildLiveTrendSurfaces(
  events: ZentraEventRecord[] = [],
): TrendSurface[] {
  return [
    buildSleepStartHeatmap(events),
    buildHeartRateDaypartSurface(events),
    buildExerciseMixSurface(events),
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

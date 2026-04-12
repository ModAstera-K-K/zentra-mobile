import type {
  DailyAggregateRecord,
  HeatmapCell,
  TrendSeries,
  TrendSeriesGroup,
  TrendSeriesGroupKey,
  ZentraEventRecord,
} from "@/types/zentra";
import { enumerateISODateRange, parseISODate } from "@/utils/dates";

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
): TrendSeries | null {
  if (!values.some((value) => value > 0)) {
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
      "distanceMeters",
      "Distance",
      "km",
      "human",
      normalizedAggregates.map((record) =>
        Math.round(((record.distanceMeters ?? 0) / 1000) * 10) / 10,
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
      "sleepEstimate",
      "Sleep Estimate",
      "min",
      "human",
      normalizedAggregates.map((record) =>
        Math.round(record.sleepEstimateMinutes ?? 0),
      ),
      dates,
      "body",
      completenessLabel,
      "Local inference",
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

const GROUP_ORDER: TrendSeriesGroupKey[] = [
  "body",
  "device",
  "health",
  "environment",
  "quality",
];
const GROUP_LABELS: Record<TrendSeriesGroupKey, string> = {
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

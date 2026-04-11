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
    group,
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

  events.forEach((event) => {
    if (
      event.dataType !== "ambient_light" ||
      typeof event.valueNumeric !== "number"
    ) {
      return;
    }

    const dateKey = event.timestampStart.slice(0, 10);
    if (!ambientByDate[dateKey]) {
      ambientByDate[dateKey] = [];
    }
    ambientByDate[dateKey].push(event.valueNumeric);
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

  const series = [
    createTrendSeries(
      "steps",
      "Steps",
      "count",
      "hero",
      normalizedAggregates.map((record) => record.stepsTotal),
      dates,
      "body",
    ),
    createTrendSeries(
      "activeMinutes",
      "Active Minutes",
      "min",
      "physical",
      normalizedAggregates.map((record) => record.activeMinutes),
      dates,
      "body",
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
    ),
    createTrendSeries(
      "unlockCount",
      "Unlocks",
      "count",
      "cool",
      normalizedAggregates.map((record) => record.unlockCount),
      dates,
      "device",
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
    ),
    createTrendSeries(
      "ambientLight",
      "Ambient Light",
      "lux",
      "cool",
      ambientValues,
      dates,
      "environment",
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
    ),
  ];

  return series.filter((entry): entry is TrendSeries => entry !== null);
}

const GROUP_ORDER: TrendSeriesGroupKey[] = [
  "body",
  "device",
  "environment",
  "quality",
];
const GROUP_LABELS: Record<TrendSeriesGroupKey, string> = {
  body: "Body & Movement",
  device: "Device Behavior",
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

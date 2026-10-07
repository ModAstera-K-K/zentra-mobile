import type { EventDataType, ZentraEventRecord } from "@/types/zentra";
import { parseISODate, shiftISODate } from "@/utils/dates";
import { buildDailyLocationTrendData } from "@/utils/location-trends";
import { selectResolvedStepEvents } from "@/utils/source-resolution";

/** [sum, count] of readings: enough to average a day, or a range of days. */
export type ReadingTotal = [sum: number, count: number];

export const TREND_DAYPARTS = [
  "Night",
  "Morning",
  "Afternoon",
  "Evening",
] as const;

/**
 * What Trends needs from one local day's records beyond the daily aggregate.
 * A range of these replaces reading every raw record in the range: a month is
 * a few kilobytes instead of a few hundred thousand rows.
 *
 * "Current" records are those source resolution keeps: not marked stale, and
 * for steps only the source chosen for the day. Sleep is not summarized here;
 * a night is resolved across days from the sleep records themselves.
 */
export interface TrendDaySummary {
  /** Types with a current record starting that day, other than sleep. */
  observedTypes: EventDataType[];
  ambientLight: ReadingTotal;
  heartRate: ReadingTotal;
  /** Every stored reading by part of day (TREND_DAYPARTS), as the dayparts card counts them. */
  heartRateDayparts: ReadingTotal[];
  /** Platform named by the day's first stored heart-rate reading that has one. */
  heartRatePlatform: string | null;
  /** Platform named by the day's first current imported record that has one. */
  healthPlatform: string | null;
  averageSpeedKmh: number | null;
  elevationGainMeters: number | null;
  /** Which kinds of step source the day resolved to. */
  steps: { platform: boolean; phone: boolean; any: boolean };
}

export function emptyTrendDaySummary(): TrendDaySummary {
  return {
    observedTypes: [],
    ambientLight: [0, 0],
    heartRate: [0, 0],
    heartRateDayparts: TREND_DAYPARTS.map((): ReadingTotal => [0, 0]),
    heartRatePlatform: null,
    healthPlatform: null,
    averageSpeedKmh: null,
    elevationGainMeters: null,
    steps: { platform: false, phone: false, any: false },
  };
}

export function trendDaypartIndex(date: Date): number {
  const hour = date.getHours();
  return hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3;
}

function add(total: ReadingTotal, value: number): void {
  total[0] += value;
  total[1] += 1;
}

/**
 * Summarize the records that start on `date`. `events` may hold more than the
 * day (the stored-day read also returns records carried over midnight and the
 * surrounding nights' sleep); anything starting outside the day is ignored.
 */
export function buildTrendDaySummary(
  date: string,
  events: ZentraEventRecord[],
): TrendDaySummary {
  const dayStartMs = parseISODate(date).getTime();
  const dayEndMs = parseISODate(shiftISODate(date, 1)).getTime();
  const starts = new Map<ZentraEventRecord, Date>();
  const dayEvents: ZentraEventRecord[] = [];
  for (const event of events) {
    const start = new Date(event.timestampStart);
    const startMs = start.getTime();
    if (startMs >= dayStartMs && startMs < dayEndMs) {
      dayEvents.push(event);
      starts.set(event, start);
    }
  }

  const summary = emptyTrendDaySummary();
  const steps = selectResolvedStepEvents(dayEvents);
  const selectedSteps = new Set(steps.map((event) => event.id));
  summary.steps = {
    platform: steps.some((event) => event.metadata.platform_aggregate === true),
    phone: steps.some((event) => event.source === "sensor"),
    any: steps.length > 0,
  };

  const observed = new Set<EventDataType>();
  const current: ZentraEventRecord[] = [];
  for (const event of dayEvents) {
    const reading =
      typeof event.valueNumeric === "number" ? event.valueNumeric : null;
    const platform =
      typeof event.metadata.health_platform === "string"
        ? event.metadata.health_platform
        : null;

    if (event.dataType === "heart_rate" && reading !== null) {
      add(
        summary.heartRateDayparts[trendDaypartIndex(starts.get(event) as Date)],
        reading,
      );
      summary.heartRatePlatform ??= platform;
    }

    if (
      event.metadata.stale_import === true ||
      event.dataType === "sleep_inferred" ||
      (event.dataType === "steps" && !selectedSteps.has(event.id))
    )
      continue;
    current.push(event);
    observed.add(event.dataType);
    if (event.source === "health_connect") summary.healthPlatform ??= platform;
    if (reading === null) continue;
    if (event.dataType === "ambient_light") add(summary.ambientLight, reading);
    if (event.dataType === "heart_rate") add(summary.heartRate, reading);
  }
  summary.observedTypes = [...observed];

  const location = buildDailyLocationTrendData([date], current);
  if (location.averageSpeedCoveredDays)
    summary.averageSpeedKmh = location.averageSpeedValues[0];
  if (location.elevationCoveredDays)
    summary.elevationGainMeters = location.elevationGainValues[0];
  return summary;
}

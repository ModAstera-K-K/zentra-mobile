import type { DateRangeSelection, ExportPreset, TrendRange } from '@/types/zentra';

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Order stored UTC timestamps. For these strings a plain comparison gives the
 * same order as localeCompare and as SQLite's ORDER BY, without the collator
 * call that makes localeCompare many times slower on Hermes.
 */
export function compareTimestamps(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

// Two fixed instants, one in each half of the year. Their UTC offsets change
// whenever the device moves to a time zone with a different clock, and reading
// them is two Date calls.
const TIME_ZONE_PROBES = [
  new Date(Date.UTC(2026, 0, 1)),
  new Date(Date.UTC(2026, 6, 1)),
];
let formatterClock = "";
const localFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * A shared `en-US` formatter for local dates and times. Constructing one is
 * costly on Hermes, so callers that format in a loop share it by `name`.
 *
 * A formatter keeps the time zone it was constructed in, so the shared ones
 * are dropped when the device's clock changes: otherwise a label would keep
 * showing the old zone's time, or the old zone's date for a local midnight.
 */
export function localDateFormatter(
  name: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const clock = `${TIME_ZONE_PROBES[0].getTimezoneOffset()}:${TIME_ZONE_PROBES[1].getTimezoneOffset()}`;
  if (clock !== formatterClock) {
    localFormatters.clear();
    formatterClock = clock;
  }
  let formatter = localFormatters.get(name);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", options);
    localFormatters.set(name, formatter);
  }
  return formatter;
}

export function parseISODate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function shiftISODate(value: string, days: number): string {
  const date = parseISODate(value);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function formatScreenDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatDateRangeLabel(start: string, end: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `${formatter.format(parseISODate(start))} - ${formatter.format(parseISODate(end))}`;
}

export function getExportRangeForPreset(preset: ExportPreset): DateRangeSelection {
  const today = new Date();
  const end = toISODate(today);
  const startByPreset: Record<Exclude<ExportPreset, 'custom'>, string> = {
    today: end,
    week: shiftISODate(end, -6),
    month: shiftISODate(end, -29),
    all: shiftISODate(end, -89),
  };

  if (preset === 'custom') {
    return {
      preset,
      start: shiftISODate(end, -13),
      end,
    };
  }

  return {
    preset,
    start: startByPreset[preset],
    end,
  };
}

export function getTrendRangeDays(range: '7d' | '30d' | '90d' | 'custom'): number {
  switch (range) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
    default:
      return 14;
  }
}

export function getDateRangeForTrendRange(range: TrendRange): { start: string; end: string } {
  const end = toISODate(new Date());
  const days = getTrendRangeDays(range);

  return {
    start: shiftISODate(end, -(days - 1)),
    end,
  };
}

export function enumerateISODateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let current = start;

  while (current <= end) {
    dates.push(current);
    current = shiftISODate(current, 1);
  }

  return dates;
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = parseISODate(value);
  return !Number.isNaN(date.getTime()) && toISODate(date) === value;
}

export function isSunriseThemeLight(date: Date): boolean {
  const hour = date.getHours();
  return hour >= 6 && hour < 18;
}

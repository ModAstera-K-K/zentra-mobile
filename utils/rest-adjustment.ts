import type { ZentraEventRecord } from "@/types/zentra";
import { isValidISODate, parseISODate, shiftISODate, toISODate } from "@/utils/dates";
import { overnightRestWindow, REST_MINUTE } from "@/utils/rest-window";

export function localRestDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  return `${toISODate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function parseRestDateTime(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(value.trim());
  if (!match || !isValidISODate(match[1]) || +match[2] > 23 || +match[3] > 59) return null;
  const date = parseISODate(match[1]);
  date.setHours(+match[2], +match[3]);
  // Reject nonexistent local clock times during a DST jump.
  return localRestDateTime(date.toISOString()) === value.trim() ? date : null;
}

export function createRestAdjustment(wakeDate: string, startText: string, endText: string, now = new Date()): ZentraEventRecord {
  const start = parseRestDateTime(startText), end = parseRestDateTime(endText);
  if (!start || !end) throw new Error("Use a valid local date and time: YYYY-MM-DD HH:mm.");
  const window = overnightRestWindow(wakeDate, now);
  if (start.getTime() < window.start || end.getTime() > window.end || toISODate(end) !== wakeDate)
    throw new Error("Choose times between yesterday at 18:00 and today at 12:00, with an end time that has already passed.");
  const minutes = (end.getTime() - start.getTime()) / REST_MINUTE;
  if (minutes <= 0 || minutes > 720) throw new Error("End must follow start, within a 12-hour window.");
  return { id: `rest-adjusted-${wakeDate}`, timestampStart: start.toISOString(), timestampEnd: end.toISOString(),
    dataType: "sleep_inferred", source: "inferred", unit: "minutes", valueNumeric: minutes, confidence: 0, schemaVersion: 1, createdAt: now.toISOString(),
    metadata: { rest_user_adjusted: true, rest_wake_date: wakeDate, rest_algorithm_version: 2, sleep_estimated: true,
      rest_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, rest_timezone_offset: end.getTimezoneOffset(),
      rest_intervals: JSON.stringify([[start.toISOString(), end.toISOString()]]), rest_original_event: `rest-inferred-v2-${wakeDate}` } };
}

export function adjustmentDates(date: string): string[] {
  return [shiftISODate(date, -1), date];
}

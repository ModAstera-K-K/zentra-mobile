import { parseISODate, shiftISODate } from "@/utils/dates";
import type { RestWindow } from "@/types/rest-inference";

export const REST_ALGORITHM_VERSION = 2;
export const REST_MINUTE = 60_000;

/** Calendar dates, not UTC clock strings or fixed 24-hour subtraction. */
export function overnightRestWindow(wakeDate: string, now = new Date()): RestWindow {
  const start = parseISODate(shiftISODate(wakeDate, -1));
  const end = parseISODate(wakeDate);
  start.setHours(18);
  end.setHours(12);
  return { start: start.getTime(), end: Math.min(end.getTime(), now.getTime()), wakeDate };
}

export function restWakeDates(endDate: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => shiftISODate(endDate, -offset));
}

import type { ZentraEventRecord } from "@/types/zentra";

/** Keep the original session identity; use only explicit asleep stages when available. */
export function sleepIntervals(
  events: ZentraEventRecord[],
): ZentraEventRecord[] {
  return events.flatMap((event) => {
    if (typeof event.metadata.rest_intervals === "string") {
      try {
        const intervals: unknown = JSON.parse(event.metadata.rest_intervals);
        if (!Array.isArray(intervals)) return [];
        return intervals.flatMap((pair) => {
          if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((v) => typeof v === "string")) return [];
          const start = Date.parse(pair[0]), end = Date.parse(pair[1]);
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
          return [{ ...event, timestampStart: pair[0], timestampEnd: pair[1], valueNumeric: (end - start) / 60000 }];
        });
      } catch { return []; }
    }
    if (
      typeof event.metadata.sleep_intervals !== "string" ||
      event.metadata.sleep_estimated === true
    )
      return [event];
    try {
      const intervals: unknown = JSON.parse(event.metadata.sleep_intervals);
      if (!Array.isArray(intervals)) return [];
      return intervals
        .filter(
          (pair): pair is [string, string] =>
            Array.isArray(pair) &&
            pair.length === 2 &&
            pair.every((value) => typeof value === "string"),
        )
        .map(([start, end]) => ({
          ...event,
          timestampStart: start,
          timestampEnd: end,
        }));
    } catch {
      return [];
    }
  });
}

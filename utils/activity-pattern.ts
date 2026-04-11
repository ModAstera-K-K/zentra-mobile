import type {
  ActivityPatternCell,
  UnifiedTimelineBucket,
  UnifiedTimelineResolution,
  ZentraEventRecord,
} from "@/types/zentra";
import {
  buildMonthlyActivityPattern,
  buildUnifiedDailyTimeline,
  buildYearlyActivityPattern,
} from "@/utils/unified-timeline";

function formatHourLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
  }).format(date);
}

function formatHourDetail(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${formatter.format(start)} to ${formatter.format(end)}`;
}

function getBucketIntensity(bucket: UnifiedTimelineBucket): number {
  return Math.max(bucket.movementScore, bucket.restScore, bucket.screenScore);
}

function getNormalizedIntensity(
  value: number,
  maxValue: number,
  hasAnyData: boolean,
): number {
  if (!hasAnyData || maxValue <= 0) {
    return 0;
  }

  return Math.max(8, Math.min(100, Math.round((value / maxValue) * 100)));
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

export function buildDayActivityPattern(
  events: ZentraEventRecord[],
  anchorDate: string,
  resolution: UnifiedTimelineResolution = "hour",
): ActivityPatternCell[] {
  const timeline = buildUnifiedDailyTimeline(events, anchorDate, resolution);
  const maxValue = Math.max(0, ...timeline.map(getBucketIntensity));

  return timeline.map((bucket) => {
    const start = new Date(bucket.timestampStart);
    const end = new Date(bucket.timestampEnd);

    return {
      detailLabel: formatHourDetail(start, end),
      dominantKind: getDominantKind(bucket),
      endTimestamp: bucket.timestampEnd,
      granularity: "day",
      hasAnyData: bucket.hasAnyData,
      id: `day-${bucket.timestampStart}`,
      intensity: getNormalizedIntensity(
        getBucketIntensity(bucket),
        maxValue,
        bucket.hasAnyData,
      ),
      label: formatHourLabel(start),
      movementScore: bucket.movementScore,
      restScore: bucket.restScore,
      screenScore: bucket.screenScore,
      startTimestamp: bucket.timestampStart,
    };
  });
}

export function buildActivityPatternViews(
  events: ZentraEventRecord[],
  anchorDate: string,
  activeGranularity?: "day" | "month" | "year",
): {
  dayCells: ActivityPatternCell[];
  monthCells: ActivityPatternCell[];
  yearCells: ActivityPatternCell[];
} {
  return {
    dayCells:
      !activeGranularity || activeGranularity === "day"
        ? buildDayActivityPattern(events, anchorDate, "hour")
        : [],
    monthCells:
      !activeGranularity || activeGranularity === "month"
        ? buildMonthlyActivityPattern(events, anchorDate, "hour")
        : [],
    yearCells:
      !activeGranularity || activeGranularity === "year"
        ? buildYearlyActivityPattern(events, anchorDate, "hour")
        : [],
  };
}

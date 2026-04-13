import type {
  ActivityNormalizationWindow,
  ActivityScoreMaxima,
  UnifiedTimelineBucket,
} from "@/types/zentra";
import { shiftISODate } from "@/utils/dates";

export function getActivityNormalizationRange(
  anchorDate: string,
  window: ActivityNormalizationWindow,
  oldestAvailableDate?: string | null,
): { end: string; start: string } {
  switch (window) {
    case "month":
      return {
        end: anchorDate,
        start: shiftISODate(anchorDate, -29),
      };
    case "all":
      return {
        end: anchorDate,
        start: oldestAvailableDate ?? anchorDate,
      };
    default:
      return {
        end: anchorDate,
        start: shiftISODate(anchorDate, -364),
      };
  }
}

function clampNormalizedValue(value: number, maxValue: number): number {
  if (maxValue <= 0 || value <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, value / maxValue));
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function buildActivityScoreMaxima(
  buckets: UnifiedTimelineBucket[],
): ActivityScoreMaxima {
  return buckets.reduce<ActivityScoreMaxima>(
    (result, bucket) => ({
      exerciseSeconds: Math.max(result.exerciseSeconds, bucket.exerciseSeconds),
      heartRateLoad: Math.max(result.heartRateLoad, bucket.heartRateLoad),
      idleSignals: Math.max(result.idleSignals, bucket.idleSignals),
      movementSignals: Math.max(result.movementSignals, bucket.movementSignals),
      nonSedentaryActivityCount: Math.max(
        result.nonSedentaryActivityCount,
        bucket.nonSedentaryActivityCount,
      ),
      sleepMinutes: Math.max(result.sleepMinutes, bucket.sleepMinutes),
      steps: Math.max(result.steps, bucket.steps),
      unlockCount: Math.max(result.unlockCount, bucket.unlockCount),
    }),
    {
      exerciseSeconds: 0,
      heartRateLoad: 0,
      idleSignals: 0,
      movementSignals: 0,
      nonSedentaryActivityCount: 0,
      sleepMinutes: 0,
      steps: 0,
      unlockCount: 0,
    },
  );
}

export function buildBucketCompositeScores(
  bucket: UnifiedTimelineBucket,
  maxima: ActivityScoreMaxima,
): { intensityScore: number; restCompositeScore: number } {
  const intensityValues = [
    maxima.steps > 0 ? clampNormalizedValue(bucket.steps, maxima.steps) : null,
    maxima.movementSignals > 0
      ? clampNormalizedValue(bucket.movementSignals, maxima.movementSignals)
      : null,
    maxima.nonSedentaryActivityCount > 0
      ? clampNormalizedValue(
          bucket.nonSedentaryActivityCount,
          maxima.nonSedentaryActivityCount,
        )
      : null,
    maxima.heartRateLoad > 0
      ? clampNormalizedValue(bucket.heartRateLoad, maxima.heartRateLoad)
      : null,
    maxima.exerciseSeconds > 0
      ? clampNormalizedValue(bucket.exerciseSeconds, maxima.exerciseSeconds)
      : null,
  ].filter((value): value is number => value !== null);

  const restValues = [
    maxima.sleepMinutes > 0
      ? clampNormalizedValue(bucket.sleepMinutes, maxima.sleepMinutes)
      : null,
    maxima.idleSignals > 0
      ? clampNormalizedValue(bucket.idleSignals, maxima.idleSignals)
      : null,
    maxima.unlockCount > 0
      ? 1 - clampNormalizedValue(bucket.unlockCount, maxima.unlockCount)
      : null,
  ].filter((value): value is number => value !== null);

  return {
    intensityScore: average(intensityValues),
    restCompositeScore: average(restValues),
  };
}

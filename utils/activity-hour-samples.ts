import type { ActivityScoreInput } from "@/utils/activity-intensity";

// Positional encoding keeps a cached day to a few hundred bytes. Hours with no
// observations are null, which scoring treats as a gap rather than rest.
const FIELDS = [
  "steps",
  "movementSignals",
  "nonSedentaryActivityCount",
  "heartRateLoad",
  "exerciseSeconds",
  "sleepMinutes",
  "idleSignals",
  "unlockCount",
] as const;

export function encodeActivityHourSamples(
  buckets: ActivityScoreInput[],
): string {
  return JSON.stringify(
    buckets.map((bucket) =>
      bucket.hasAnyData ? FIELDS.map((field) => bucket[field]) : null,
    ),
  );
}

export function decodeActivityHourSamples(
  payload: string,
): ActivityScoreInput[] {
  return (JSON.parse(payload) as (number[] | null)[]).map((values) => {
    const sample = { hasAnyData: values !== null } as ActivityScoreInput;
    FIELDS.forEach((field, index) => {
      sample[field] = values?.[index] ?? 0;
    });
    return sample;
  });
}

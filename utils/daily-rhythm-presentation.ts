import type { AppPalette } from "@/constants/theme";
import type { UnifiedTimelineBucket } from "@/types/zentra";

export type RhythmMode = "movement" | "screen" | "rest";
export const RHYTHM_MODES: { key: RhythmMode; label: string }[] = [
  { key: "movement", label: "Movement" },
  { key: "screen", label: "Screen" },
  { key: "rest", label: "Rest" },
];

export function rhythmColor(mode: RhythmMode, palette: AppPalette): string {
  return mode === "movement" ? palette.signalPhysical : mode === "screen" ? palette.signalCool : palette.signalHuman;
}

export function rhythmValue(bucket: UnifiedTimelineBucket, mode: RhythmMode): number | null {
  if (!bucket.hasAnyData) return null;
  return mode === "movement" ? bucket.dailyRhythmMovementScore : mode === "screen" ? bucket.normalizedScreenScore : bucket.restCompositeScore;
}

export function rhythmSeries(buckets: UnifiedTimelineBucket[], mode: RhythmMode) {
  return buckets.map(bucket => ({ label: bucket.label, value: rhythmValue(bucket, mode) }));
}

export function initialRhythmIndex(buckets: UnifiedTimelineBucket[], now = Date.now()): number {
  const current = buckets.findIndex(bucket => now >= Date.parse(bucket.timestampStart) && now < Date.parse(bucket.timestampEnd));
  if (current >= 0) return current;
  return Math.max(0, buckets.findLastIndex(bucket => Date.parse(bucket.timestampStart) <= now));
}

export function rhythmIndexAtPosition(x: number, width: number, count: number): number {
  if (count <= 1 || width <= 0) return 0;
  return Math.round(Math.max(0, Math.min(x / width, 1)) * (count - 1));
}

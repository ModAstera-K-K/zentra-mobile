import type { ActiveMinutesSummary, WalkingBout } from "@/types/active-minutes";
import { shiftISODate } from "@/utils/dates";
function percentile(sorted: number[], p: number): number {
  const index = (sorted.length - 1) * p,
    lo = Math.floor(index),
    fraction = index - lo;
  return sorted[lo] + (sorted[Math.ceil(index)] - sorted[lo]) * fraction;
}
export function walkingEquivalent(
  date: string,
  steps: number,
  history: { walkingBouts: WalkingBout[] }[],
): ActiveMinutesSummary["walkingEquivalent"] {
  const start = shiftISODate(date, -30);
  const bouts = history
    .flatMap((s) => s.walkingBouts)
    .filter(
      (b) => b.date >= start && b.date < date && b.minutes >= 5 && b.steps > 0,
    );
  const days = new Set(bouts.map((b) => b.date)).size;
  if (
    bouts.length < 10 ||
    days < 3 ||
    bouts.reduce((n, b) => n + b.minutes, 0) < 60 ||
    steps <= 0
  )
    return null;
  const rates = bouts.map((b) => b.steps / b.minutes).sort((a, b) => a - b);
  return {
    lowerMinutes: Math.floor(steps / percentile(rates, 0.9)),
    upperMinutes: Math.ceil(steps / percentile(rates, 0.1)),
    bouts: bouts.length,
    days,
  };
}

import type { ZentraEventRecord } from "@/types/zentra";
import { RELEASE_FLAGS } from "@/constants/release-flags";
import { sleepEventsForWakeDate } from "@/utils/sleep-wake-date";

export function selectSleepForWakeDate(events: ZentraEventRecord[], date: string): ZentraEventRecord[] {
  const candidates = sleepEventsForWakeDate(events, date);
  const imported = candidates.filter((e) => e.source === "health_connect");
  if (imported.length) {
    const origin = (e: ZentraEventRecord) => `${e.metadata.health_platform ?? ""}:${e.metadata.source_app ?? "unknown"}`;
    const selected = imported.map(origin).sort()[0];
    return imported.filter((e) => origin(e) === selected);
  }
  if (!RELEASE_FLAGS.restInference) return [];
  const inferred = candidates.filter((e) => e.source === "inferred");
  const adjustments = inferred.filter((e) => e.metadata.rest_user_adjusted === true);
  if (adjustments.length) return [adjustments.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]];
  const current = inferred.filter((e) => e.metadata.rest_algorithm_version === 2);
  return current.length ? current : inferred;
}

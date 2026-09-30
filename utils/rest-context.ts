import type { ZentraEventRecord } from "@/types/zentra";
import type { RestCandidate, RestInterval } from "@/types/rest-inference";
import { REST_MINUTE } from "@/utils/rest-window";

interface RestLocation { time: number; latitude: number; longitude: number; speed: number; id: string }
export function restLocations(events: ZentraEventRecord[]): RestLocation[] {
  return events.flatMap((e) => {
    if (e.dataType !== "location" || !e.valueJson) return [];
    try {
      const p = JSON.parse(e.valueJson);
      return Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
        ? [{ time: Date.parse(e.timestampStart), latitude: p.latitude, longitude: p.longitude, speed: p.speed_mps ?? 0, id: e.id }] : [];
    } catch { return []; }
  });
}

function distanceMeters(a: RestLocation, b: RestLocation): number {
  const radians = Math.PI / 180;
  const x = (a.longitude - b.longitude) * radians * Math.cos((a.latitude + b.latitude) / 2 * radians);
  return 6_371_000 * Math.hypot(x, (a.latitude - b.latitude) * radians);
}

export function restTravelEvidence(events: ZentraEventRecord[]): RestInterval[] {
  const locations = restLocations(events), result: RestInterval[] = [];
  for (const [index, point] of locations.entries()) {
    const previous = locations[index - 1];
    if (point.speed > 2) result.push({ start: point.time, end: point.time + REST_MINUTE, kind: "active", signals: ["Observed travel"], recordIds: [point.id] });
    if (previous && point.time > previous.time && point.time - previous.time <= 30 * REST_MINUTE && distanceMeters(previous, point) > 1000)
      result.push({ start: previous.time, end: point.time, kind: "active", signals: ["Observed travel"], recordIds: [previous.id, point.id] });
  }
  return result;
}

export function restContext(candidate: RestCandidate, events: ZentraEventRecord[]): string[] {
  const labels: string[] = [];
  if (events.some((e) => e.dataType === "charging_state" && ["charging", "full"].includes((e.valueText ?? "").toLowerCase())
    && Math.abs(Date.parse(e.timestampStart) - candidate.start) <= 90 * REST_MINUTE)) labels.push("Charging observed near start");
  const locations = restLocations(events).filter((p) => p.time >= candidate.start && p.time <= candidate.end);
  if (locations.length >= 2 && locations.at(-1)!.time - locations[0].time >= 60 * REST_MINUTE
    && locations.every((p) => distanceMeters(locations[0], p) <= 200)) labels.push("Available location samples stayed nearby");
  return labels;
}

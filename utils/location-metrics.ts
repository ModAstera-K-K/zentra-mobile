import type { LocationSample } from "@/types/zentra";

export interface ElevationSummary {
  gainMeters: number;
  maxMeters: number;
  minMeters: number;
}

type LocationMetricSample = Pick<
  LocationSample,
  "latitude" | "longitude" | "timestamp" | "altitudeMeters"
>;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMeters(a: LocationMetricSample, b: LocationMetricSample): number {
  const earthRadius = 6371000;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const latA = toRadians(a.latitude);
  const latB = toRadians(b.latitude);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

export function calculateAverageSpeedKmh(
  samples: LocationMetricSample[],
): number | null {
  if (samples.length < 2) {
    return null;
  }

  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;

  const sorted = samples
    .slice()
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const durationSeconds =
      (new Date(current.timestamp).getTime() -
        new Date(previous.timestamp).getTime()) /
      1000;

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      continue;
    }

    const segmentDistance = distanceMeters(previous, current);
    if (!Number.isFinite(segmentDistance) || segmentDistance <= 0) {
      continue;
    }

    // Guard against GPS jumps that produce unrealistic speed spikes.
    const segmentSpeedMps = segmentDistance / durationSeconds;
    if (segmentSpeedMps > 55) {
      continue;
    }

    totalDistanceMeters += segmentDistance;
    totalDurationSeconds += durationSeconds;
  }

  if (totalDistanceMeters <= 0 || totalDurationSeconds <= 0) {
    return null;
  }

  return Number(((totalDistanceMeters / totalDurationSeconds) * 3.6).toFixed(1));
}

export function calculateElevationSummary(
  samples: LocationMetricSample[],
): ElevationSummary | null {
  const altitudeSamples = samples
    .map((sample) => sample.altitudeMeters)
    .filter((value): value is number =>
      typeof value === "number" && Number.isFinite(value),
    );

  if (altitudeSamples.length < 2) {
    return null;
  }

  let gainMeters = 0;
  for (let index = 1; index < altitudeSamples.length; index += 1) {
    const rise = altitudeSamples[index] - altitudeSamples[index - 1];
    if (rise > 0) {
      gainMeters += rise;
    }
  }

  return {
    gainMeters: Math.round(gainMeters),
    maxMeters: Math.round(Math.max(...altitudeSamples)),
    minMeters: Math.round(Math.min(...altitudeSamples)),
  };
}

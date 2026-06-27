import type { LocationSample, ZentraEventRecord } from "@/types/zentra";
import { toISODate } from "@/utils/dates";
import {
  calculateAverageSpeedKmh,
  calculateElevationSummary,
} from "@/utils/location-metrics";

interface LocationPayload {
  latitude: number;
  longitude: number;
  altitude?: number;
}

export interface DailyLocationTrendData {
  averageSpeedValues: number[];
  averageSpeedCoveredDays: number;
  elevationGainValues: number[];
  elevationCoveredDays: number;
}

export function parseLocationPayload(valueJson?: string): LocationPayload | null {
  if (!valueJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(valueJson) as Partial<LocationPayload>;
    if (
      typeof parsed.latitude !== "number" ||
      !Number.isFinite(parsed.latitude) ||
      typeof parsed.longitude !== "number" ||
      !Number.isFinite(parsed.longitude)
    ) {
      return null;
    }

    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      altitude:
        typeof parsed.altitude === "number" && Number.isFinite(parsed.altitude)
          ? parsed.altitude
          : undefined,
    };
  } catch {
    return null;
  }
}

function getLocalDate(timestamp: string): string {
  return toISODate(new Date(timestamp));
}

function buildLocationSamplesByDate(
  dates: string[],
  events: ZentraEventRecord[],
): Record<string, LocationSample[]> {
  const samplesByDate = dates.reduce<Record<string, LocationSample[]>>(
    (result, date) => {
      result[date] = [];
      return result;
    },
    {},
  );

  events
    .filter((event) => event.dataType === "location")
    .forEach((event) => {
      const payload = parseLocationPayload(event.valueJson);
      if (!payload) {
        return;
      }

      const dateKey = getLocalDate(event.timestampStart);
      if (!samplesByDate[dateKey]) {
        return;
      }

      samplesByDate[dateKey].push({
        latitude: payload.latitude,
        longitude: payload.longitude,
        timestamp: event.timestampStart,
        altitudeMeters: payload.altitude,
      });
    });

  return samplesByDate;
}

export function buildDailyLocationTrendData(
  dates: string[],
  events: ZentraEventRecord[],
): DailyLocationTrendData {
  const samplesByDate = buildLocationSamplesByDate(dates, events);
  let averageSpeedCoveredDays = 0;
  let elevationCoveredDays = 0;

  const averageSpeedValues = dates.map((date) => {
    const averageSpeed = calculateAverageSpeedKmh(samplesByDate[date] ?? []);
    if (averageSpeed === null) {
      return 0;
    }

    averageSpeedCoveredDays += 1;
    return averageSpeed;
  });

  const elevationGainValues = dates.map((date) => {
    const elevationSummary = calculateElevationSummary(samplesByDate[date] ?? []);
    if (!elevationSummary) {
      return 0;
    }

    elevationCoveredDays += 1;
    return elevationSummary.gainMeters;
  });

  return {
    averageSpeedValues,
    averageSpeedCoveredDays,
    elevationGainValues,
    elevationCoveredDays,
  };
}
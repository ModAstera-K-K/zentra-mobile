import { Platform } from "react-native";

import type {
  CollectorState,
  DashboardMetric,
  DailyAggregateRecord,
  EventDataType,
  HeatmapCell,
  MetricTone,
  TodayLiveSnapshot,
  ZentraEventRecord,
} from "@/types/zentra";
import {
  countActivityTypes,
  formatActivityLabel,
  getCurrentActivityLabel,
  getLatestActivityEvent,
} from "@/utils/activity-summary";
import { formatMinutes, formatNumber, formatPercent } from "@/utils/format";
import {
  getActivitySourceLabel,
  getHealthPlatformName,
} from "@/utils/platform-capabilities";

const CORE_SIGNAL_TYPES: EventDataType[] = [
  "steps",
  "activity",
  "app_usage",
  "charging_state",
  "location",
  "sleep_inferred",
];

const RECENT_SIGNAL_LIMIT = 8;
const SCREEN_TIME_TOP_APP_COUNT = 10;

export interface TodaySummaryMetric {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: MetricTone;
  available: boolean;
}

export interface TodayDetailFact {
  label: string;
  value: string;
}

export interface TodayDetailChartPoint {
  label: string;
  value: number;
  valueLabel: string;
  /** Optional 0–1 position on the x-axis. When set, the chart uses this
   *  instead of distributing points evenly by index. */
  normalizedX?: number;
}

export interface TodayDetailBar {
  label: string;
  value: number;
  valueLabel: string;
}

export type TodayDetailVisual =
  | {
      type: "line";
      annotation: string;
      points: TodayDetailChartPoint[];
    }
  | {
      type: "distribution";
      annotation: string;
      bars: TodayDetailBar[];
    }
  | {
      type: "heatmap";
      annotation: string;
      cells: HeatmapCell[];
    };

export interface TodayDetailPayload {
  key: string;
  eyebrow: string;
  title: string;
  value: string;
  summary: string;
  tone: MetricTone;
  meta: string;
  visual: TodayDetailVisual | null;
  facts: TodayDetailFact[];
  rows: TodayDetailFact[];
}

export interface TodayRecentSignalRow {
  id: string;
  title: string;
  value: string;
  detail: string;
  timestampLabel: string;
  sourceLabel: string;
  tone: MetricTone;
  event: ZentraEventRecord;
}

export interface TodaySignalHealthSummary {
  coverageLabel: string;
  detail: string;
  valueLabel: string;
}

interface TodayVisualizationContext {
  todayAggregate: DailyAggregateRecord | null;
  todayEvents: ZentraEventRecord[];
  todaySnapshot: TodayLiveSnapshot;
}

interface LocationPayload {
  latitude: number;
  longitude: number;
}

type MetricLike = DashboardMetric | TodaySummaryMetric;

function formatTimestampLabel(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatDateTimeLabel(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMetersBetween(a: LocationPayload, b: LocationPayload): number {
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

function clampPositive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatDistance(value: number): string {
  if (value < 1000) {
    return `${Math.round(value)} m`;
  }

  return `${(value / 1000).toFixed(1)} km`;
}

function formatBatteryPercent(value: number): string {
  return formatPercent(value * 100);
}

function formatAppLabel(rawValue: string): string {
  const normalized = rawValue.trim();
  if (!normalized) {
    return "Unknown";
  }

  const packageTail = normalized.split(".").at(-1) ?? normalized;
  return titleCase(packageTail);
}

function getMetricEventTypes(key: string): EventDataType[] {
  switch (key) {
    case "steps":
      return ["steps"];
    case "activeMinutes":
    case "topActivity":
      return ["activity", "motion_context"];
    case "screenTime":
      return ["app_usage", "screen_state", "unlock_event"];
    case "mobilityRadius":
    case "distanceMeters":
      return ["location"];
    case "unlockCount":
      return ["unlock_event"];
    case "dataCompleteness":
      return CORE_SIGNAL_TYPES;
    case "deviceContext":
      return ["charging_state"];
    case "motionContext":
      return ["motion_context"];
    case "connectivity":
      return ["connectivity_state"];
    case "heartRate":
      return ["heart_rate"];
    case "exerciseSessions":
      return ["exercise_session"];
    default:
      return [];
  }
}

function getMetricSourceLabel(key: string): string {
  switch (key) {
    case "steps":
      return "Phone sensor";
    case "activeMinutes":
    case "topActivity":
      return getActivitySourceLabel();
    case "screenTime":
    case "unlockCount":
      return Platform.OS === "ios"
        ? "Unsupported on iOS"
        : "Android Usage Access";
    case "mobilityRadius":
    case "distanceMeters":
      return "Foreground location";
    case "dataCompleteness":
      return "Repository aggregate";
    case "deviceContext":
      return "Battery monitoring";
    case "motionContext":
      return "Accelerometer + gyroscope";
    case "connectivity":
      return "Network reachability";
    case "heartRate":
    case "exerciseSessions":
      return getHealthPlatformName();
    default:
      return "On-device repository";
  }
}

function getEventTone(event: ZentraEventRecord): MetricTone {
  switch (event.dataType) {
    case "steps":
      return "hero";
    case "activity":
    case "motion_context":
      return "physical";
    case "location":
    case "sleep_inferred":
    case "exercise_session":
      return "human";
    default:
      return "cool";
  }
}

function getSourceLabel(event: ZentraEventRecord): string {
  switch (event.source) {
    case "sensor":
      return "Phone sensor";
    case "activity_recognition":
      return getActivitySourceLabel();
    case "usage_stats":
      return "Android Usage Access";
    case "system_broadcast":
      return "System state";
    case "health_connect":
      return getHealthPlatformName();
    case "inferred":
      return "Local inference";
    default:
      return "On-device repository";
  }
}

function getEventProvenanceLabel(event: ZentraEventRecord): string {
  switch (event.dataType) {
    case "steps":
      return "Pedometer reading";
    case "activity":
      return getActivitySourceLabel();
    case "app_usage":
      return "Foreground session history";
    case "unlock_event":
    case "screen_state":
      return "Android usage history";
    case "charging_state":
      return "Battery monitoring";
    case "ambient_light":
      return "Light sensor";
    case "motion_context":
      return "Accelerometer + gyroscope";
    case "connectivity_state":
      return "Network reachability";
    case "sleep_inferred":
      if (typeof event.metadata.health_platform === "string") {
        return `Imported via ${event.metadata.health_platform}`;
      }
      return typeof event.metadata.heuristic === "string"
        ? titleCase(event.metadata.heuristic)
        : "Local sleep inference";
    case "heart_rate":
    case "exercise_session":
      return typeof event.metadata.health_platform === "string"
        ? `Imported via ${event.metadata.health_platform}`
        : `Imported via ${getHealthPlatformName()}`;
    default:
      return getSourceLabel(event);
  }
}

function parseLocationPayload(valueJson?: string): LocationPayload | null {
  if (!valueJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(valueJson) as Partial<LocationPayload>;
    if (
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number"
    ) {
      return null;
    }

    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
    };
  } catch {
    return null;
  }
}

function parseLocationLabel(valueJson?: string): string {
  const location = parseLocationPayload(valueJson);
  if (!location) {
    return "Foreground sample";
  }

  return `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`;
}

function formatEventValue(event: ZentraEventRecord): string {
  switch (event.dataType) {
    case "steps":
      return typeof event.valueNumeric === "number"
        ? formatNumber(Math.round(event.valueNumeric))
        : "Step reading";
    case "activity":
      return event.valueText ? titleCase(event.valueText) : "Activity";
    case "location":
      return parseLocationLabel(event.valueJson);
    case "app_usage":
      return typeof event.valueNumeric === "number"
        ? formatMinutes(Math.max(1, Math.round(event.valueNumeric / 60)))
        : "App session";
    case "unlock_event":
      return "Unlocked";
    case "charging_state":
      if (typeof event.valueNumeric === "number") {
        const batteryLabel = formatBatteryPercent(event.valueNumeric);
        return event.valueText
          ? `${batteryLabel} · ${event.valueText}`
          : batteryLabel;
      }

      return event.valueText ?? "Battery state";
    case "sleep_inferred":
      return typeof event.valueNumeric === "number"
        ? formatMinutes(Math.round(event.valueNumeric))
        : "Sleep window";
    case "heart_rate":
      return typeof event.valueNumeric === "number"
        ? `${Math.round(event.valueNumeric)} bpm`
        : "Heart rate";
    case "exercise_session":
      return formatExerciseLabel(event.valueText);
    case "ambient_light":
      return typeof event.valueNumeric === "number"
        ? `${Math.round(event.valueNumeric)} lux`
        : "Ambient light";
    case "screen_state":
      return event.valueText ? titleCase(event.valueText) : "Screen state";
    case "motion_context":
      return event.valueText ? titleCase(event.valueText) : "Motion sample";
    case "connectivity_state":
      return event.valueText ? titleCase(event.valueText) : "Connectivity";
    default:
      return event.valueText ?? "Reading";
  }
}

function formatEventTitle(event: ZentraEventRecord): string {
  switch (event.dataType) {
    case "steps":
      return "Step reading";
    case "activity":
      return event.valueText
        ? `${titleCase(event.valueText)} transition`
        : "Activity transition";
    case "location":
      return "Location sample";
    case "app_usage":
      return "App session";
    case "unlock_event":
      return "Unlock event";
    case "charging_state":
      return "Battery state";
    case "sleep_inferred":
      return "Sleep window";
    case "heart_rate":
      return "Heart rate";
    case "exercise_session":
      return "Exercise session";
    case "ambient_light":
      return "Ambient light";
    case "screen_state":
      return "Screen state";
    case "motion_context":
      return "Motion context";
    case "connectivity_state":
      return "Connectivity state";
    default:
      return titleCase(event.dataType);
  }
}

function formatEventDetail(event: ZentraEventRecord): string {
  switch (event.dataType) {
    case "activity":
      return event.valueText === "still"
        ? "Stillness transition captured from motion activity."
        : "Movement transition captured from motion activity.";
    case "app_usage":
      return event.valueText
        ? `Foreground session for ${event.valueText}.`
        : "Foreground app session recorded from usage history.";
    case "unlock_event":
      return "Unlock event stored from usage history.";
    case "charging_state":
      return "Battery and charging snapshot stored from system state.";
    case "location":
      return "Foreground location sample stored while the app was active.";
    case "sleep_inferred":
      return event.source === "health_connect"
        ? `Imported from ${getHealthPlatformName()}.`
        : "Inferred from local screen, unlock, and charging patterns.";
    case "screen_state":
      return "Interactive state stored from usage history.";
    case "motion_context":
      return event.valueText
        ? `Motion classified as ${event.valueText.replace(/_/g, " ")} from accelerometer and gyroscope.`
        : "Motion summary from device sensors.";
    case "connectivity_state":
      return "Network connectivity state captured from system broadcasts.";
    default:
      return `${getSourceLabel(event)} reading stored locally.`;
  }
}

function sortEventsDescending(
  events: ZentraEventRecord[],
): ZentraEventRecord[] {
  return events
    .slice()
    .sort((left, right) =>
      right.timestampStart.localeCompare(left.timestampStart),
    );
}

function sortEventsAscending(events: ZentraEventRecord[]): ZentraEventRecord[] {
  return events
    .slice()
    .sort((left, right) =>
      left.timestampStart.localeCompare(right.timestampStart),
    );
}

function getRelatedEvents(
  events: ZentraEventRecord[],
  metricKey: string,
): ZentraEventRecord[] {
  const eventTypes = new Set(getMetricEventTypes(metricKey));
  return sortEventsDescending(
    events.filter((event) => eventTypes.has(event.dataType)),
  );
}

function buildRecentRows(events: ZentraEventRecord[]): TodayDetailFact[] {
  return events.slice(0, 4).map((event) => ({
    label: formatDateTimeLabel(event.timestampStart),
    value: `${formatEventTitle(event)} · ${formatEventValue(event)}`,
  }));
}

function getCoverageCount(events: ZentraEventRecord[]): number {
  const presentTypes = new Set(events.map((event) => event.dataType));
  return CORE_SIGNAL_TYPES.filter((type) => presentTypes.has(type)).length;
}

function buildDeviceContextValue(todaySnapshot: TodayLiveSnapshot): string {
  if (typeof todaySnapshot.batteryLevel === "number") {
    const levelLabel = formatBatteryPercent(todaySnapshot.batteryLevel);
    return todaySnapshot.batteryStateLabel
      ? `${levelLabel} · ${todaySnapshot.batteryStateLabel}`
      : levelLabel;
  }

  if (todaySnapshot.batteryStateLabel) {
    return todaySnapshot.batteryStateLabel;
  }

  return "Waiting";
}

function buildStepsVisual(
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  const points = sortEventsAscending(events)
    .filter((event) => typeof event.valueNumeric === "number")
    .map((event) => ({
      label: formatTimestampLabel(event.timestampStart),
      value: clampPositive(Math.round(event.valueNumeric ?? 0)),
      valueLabel: formatNumber(Math.round(event.valueNumeric ?? 0)),
    }));

  if (!points.length) {
    return null;
  }

  return {
    type: "line",
    annotation: "Step readings across the current day.",
    points,
  };
}

function buildActiveMinutesVisual(
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  const bars = countActivityTypes(events).map((entry) => ({
    label: entry.label,
    value: entry.count,
    valueLabel: formatNumber(entry.count),
  }));

  if (!bars.length) {
    return null;
  }

  return {
    type: "distribution",
    annotation: "Top recorded activities so far today.",
    bars,
  };
}

function buildUnlockVisual(
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  let unlockCount = 0;
  const points = sortEventsAscending(events)
    .filter((event) => event.dataType === "unlock_event")
    .map((event) => {
      unlockCount += 1;

      return {
        label: formatTimestampLabel(event.timestampStart),
        value: unlockCount,
        valueLabel: formatNumber(unlockCount),
      };
    });

  if (!points.length) {
    return null;
  }

  return {
    type: "line",
    annotation: "Unlock count accumulated through the day.",
    points,
  };
}

function buildBatteryVisual(
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  const points = sortEventsAscending(events)
    .filter(
      (event) =>
        event.dataType === "charging_state" &&
        typeof event.valueNumeric === "number",
    )
    .map((event) => ({
      label: formatTimestampLabel(event.timestampStart),
      value: clampPositive(Math.round((event.valueNumeric ?? 0) * 100)),
      valueLabel: formatBatteryPercent(event.valueNumeric ?? 0),
    }));

  if (!points.length) {
    return null;
  }

  return {
    type: "line",
    annotation:
      "Battery level snapshots captured by the device-state collector.",
    points,
  };
}

function buildLocationRadiusVisual(
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  const locationEvents = sortEventsAscending(events).filter(
    (event) => event.dataType === "location",
  );
  const firstLocation = parseLocationPayload(locationEvents[0]?.valueJson);

  if (!locationEvents.length || !firstLocation) {
    return null;
  }

  const points = locationEvents
    .map((event) => {
      const location = parseLocationPayload(event.valueJson);
      if (!location) {
        return null;
      }

      const value = distanceMetersBetween(firstLocation, location);
      return {
        label: formatTimestampLabel(event.timestampStart),
        value: Math.round(value),
        valueLabel: formatDistance(value),
      };
    })
    .filter((point): point is TodayDetailChartPoint => point !== null);

  if (!points.length) {
    return null;
  }

  return {
    type: "line",
    annotation: "Distance from the first recorded location sample.",
    points,
  };
}

function buildTopActivityVisual(
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  const counts = countActivityTypes(events).map((entry) => ({
    label: entry.label,
    value: entry.count,
    valueLabel: formatNumber(entry.count),
  }));

  if (!counts.length) {
    return null;
  }

  return {
    type: "distribution",
    annotation: "Most common movement patterns captured today.",
    bars: counts,
  };
}

function buildCompletenessVisual(
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  const eventCounts = CORE_SIGNAL_TYPES.map((type) => ({
    label: titleCase(type),
    value: events.filter((event) => event.dataType === type).length,
  }));

  if (!eventCounts.some((entry) => entry.value > 0)) {
    return null;
  }

  return {
    type: "distribution",
    annotation: "Coverage across the core signal families tracked today.",
    bars: eventCounts.map((entry) => ({
      label: entry.label,
      value: entry.value,
      valueLabel: formatNumber(entry.value),
    })),
  };
}

function buildScreenTimeVisual(
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  const durationsByApp = events.reduce<Map<string, number>>((result, event) => {
    if (
      event.dataType !== "app_usage" ||
      typeof event.valueNumeric !== "number"
    ) {
      return result;
    }

    const rawLabel =
      typeof event.valueText === "string" && event.valueText
        ? event.valueText
        : typeof event.metadata.topPackage === "string"
          ? event.metadata.topPackage
          : "unknown";
    const label = formatAppLabel(rawLabel);
    result.set(label, (result.get(label) ?? 0) + event.valueNumeric);
    return result;
  }, new Map<string, number>());

  const rankedApps = Array.from(durationsByApp.entries()).sort(
    (left, right) => right[1] - left[1],
  );

  if (!rankedApps.length) {
    return null;
  }

  const topApps = rankedApps
    .slice(0, SCREEN_TIME_TOP_APP_COUNT)
    .map(([label, value]) => ({
      label,
      value,
      valueLabel: formatMinutes(Math.max(1, Math.round(value / 60))),
    }));
  const otherValue = rankedApps
    .slice(SCREEN_TIME_TOP_APP_COUNT)
    .reduce((total, [, value]) => total + value, 0);

  if (otherValue > 0) {
    topApps.push({
      label: "Other",
      value: otherValue,
      valueLabel: formatMinutes(Math.max(1, Math.round(otherValue / 60))),
    });
  }

  return {
    type: "distribution",
    annotation: "Foreground app usage ranked from highest duration to lowest.",
    bars: topApps,
  };
}

function buildSleepVisual(
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  const points = sortEventsAscending(events)
    .filter((event) => typeof event.valueNumeric === "number")
    .map((event) => ({
      label: formatDateTimeLabel(event.timestampStart),
      value: Math.round(event.valueNumeric ?? 0),
      valueLabel: formatMinutes(Math.round(event.valueNumeric ?? 0)),
    }));

  if (!points.length) {
    return null;
  }

  return {
    type: "line",
    annotation: "Sleep duration records available in local history.",
    points,
  };
}

function buildHeartRateVisual(
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  const hrEvents = sortEventsAscending(events).filter(
    (event) =>
      event.dataType === "heart_rate" && typeof event.valueNumeric === "number",
  );

  if (!hrEvents.length) {
    return null;
  }

  // Determine the day start (midnight) for the first event
  const firstDate = new Date(hrEvents[0].timestampStart);
  const dayStart = new Date(
    firstDate.getFullYear(),
    firstDate.getMonth(),
    firstDate.getDate(),
  ).getTime();
  const DAY_MS = 24 * 60 * 60_000;

  const points: TodayDetailChartPoint[] = hrEvents.map((event) => {
    const ts = new Date(event.timestampStart).getTime();
    const normalizedX = Math.max(0, Math.min((ts - dayStart) / DAY_MS, 1));
    return {
      label: formatTimestampLabel(event.timestampStart),
      value: Math.round(event.valueNumeric ?? 0),
      valueLabel: `${Math.round(event.valueNumeric ?? 0)} bpm`,
      normalizedX,
    };
  });

  return {
    type: "line",
    annotation:
      "Heart-rate readings placed on a 24-hour axis. Gaps indicate periods without data.",
    points,
  };
}

const EXERCISE_TYPE_NAMES: Record<string, string> = {
  "2": "badminton",
  "4": "baseball",
  "5": "basketball",
  "8": "biking",
  "9": "stationary_biking",
  "10": "boot_camp",
  "11": "boxing",
  "13": "calisthenics",
  "14": "cricket",
  "16": "dancing",
  "25": "elliptical",
  "26": "exercise_class",
  "27": "fencing",
  "28": "american_football",
  "29": "australian_football",
  "31": "golf",
  "33": "guided_breathing",
  "34": "gymnastics",
  "35": "handball",
  "36": "hiit",
  "37": "hiking",
  "38": "ice_hockey",
  "39": "ice_skating",
  "44": "martial_arts",
  "46": "paddling",
  "47": "paragliding",
  "48": "pilates",
  "50": "racquetball",
  "51": "rock_climbing",
  "52": "roller_hockey",
  "53": "rowing",
  "54": "rowing_machine",
  "55": "rugby",
  "56": "running",
  "57": "treadmill_running",
  "58": "sailing",
  "59": "scuba_diving",
  "61": "skiing",
  "62": "snowboarding",
  "63": "snowshoeing",
  "64": "soccer",
  "65": "softball",
  "66": "squash",
  "68": "stair_climbing",
  "69": "stair_machine",
  "70": "strength_training",
  "71": "stretching",
  "72": "surfing",
  "73": "open_water_swimming",
  "74": "pool_swimming",
  "75": "table_tennis",
  "76": "tennis",
  "78": "volleyball",
  "79": "walking",
  "80": "water_polo",
  "81": "weightlifting",
  "82": "wheelchair",
  "83": "yoga",
  "0": "other_workout",
};

function formatExerciseLabel(value: string | undefined | null): string {
  if (!value) {
    return "Exercise";
  }
  // Map numeric exercise type IDs from old Health Connect records
  const mapped = EXERCISE_TYPE_NAMES[value];
  if (mapped) {
    return titleCase(mapped);
  }
  return titleCase(value);
}

function getExerciseDurationMinutes(event: ZentraEventRecord): number {
  if (typeof event.valueNumeric !== "number") {
    return 0;
  }
  // Old records stored seconds with unit "seconds"; new records store minutes
  if (event.unit === "seconds") {
    return Math.round(event.valueNumeric / 60);
  }
  return Math.round(event.valueNumeric);
}

function buildExerciseVisual(
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  const bars = sortEventsDescending(events)
    .filter((event) => event.dataType === "exercise_session")
    .map((event) => {
      const durationMinutes = getExerciseDurationMinutes(event);
      return {
        label: formatExerciseLabel(event.valueText),
        value: clampPositive(durationMinutes),
        valueLabel:
          durationMinutes > 0
            ? formatMinutes(durationMinutes)
            : formatDateTimeLabel(event.timestampStart),
      };
    });

  if (!bars.length) {
    return null;
  }

  return {
    type: "distribution",
    annotation:
      "Imported exercise sessions currently available in local history.",
    bars,
  };
}

function buildMotionContextVisual(
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  const motionEvents = events.filter(
    (event) =>
      event.dataType === "motion_context" &&
      typeof event.valueText === "string",
  );
  if (!motionEvents.length) {
    return null;
  }

  const labelCounts = new Map<string, number>();
  motionEvents.forEach((event) => {
    const label = titleCase(event.valueText ?? "unknown");
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  });

  const bars = Array.from(labelCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      value: count,
      valueLabel: `${count} window${count === 1 ? "" : "s"}`,
    }));

  return {
    type: "distribution",
    annotation:
      "Movement quality windows classified from accelerometer and gyroscope.",
    bars,
  };
}

function buildConnectivityVisual(
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  const connectivityEvents = events.filter(
    (event) =>
      event.dataType === "connectivity_state" &&
      typeof event.valueText === "string",
  );
  if (!connectivityEvents.length) {
    return null;
  }

  const counts = new Map<string, number>();
  connectivityEvents.forEach((event) => {
    const label = titleCase(event.valueText ?? "unknown");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  return {
    type: "distribution",
    annotation: "Connectivity changes captured from the active network path.",
    bars: Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([label, count]) => ({
        label,
        value: count,
        valueLabel: `${count} change${count === 1 ? "" : "s"}`,
      })),
  };
}

interface MotionContextSummary {
  averageBurstRatio: number;
  averageSedentaryRatio: number;
  averageStability: number;
  dominantLabel: string;
  eventCount: number;
  latestTimestamp: string;
}

function buildMotionContextSummary(
  events: ZentraEventRecord[],
): MotionContextSummary | null {
  const motionEvents = sortEventsDescending(
    events.filter((event) => event.dataType === "motion_context"),
  );
  if (!motionEvents.length) {
    return null;
  }

  const labelCounts = new Map<string, number>();
  let totalSedentaryRatio = 0;
  let totalBurstRatio = 0;
  let totalStability = 0;

  motionEvents.forEach((event) => {
    const label = titleCase(event.valueText ?? "unknown");
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    totalSedentaryRatio += Number(event.metadata.sedentary_ratio ?? 0);
    totalBurstRatio += Number(event.metadata.burst_ratio ?? 0);
    totalStability += Number(event.metadata.stability ?? event.confidence ?? 0);
  });

  const dominantLabel =
    Array.from(labelCounts.entries()).sort(
      (left, right) => right[1] - left[1],
    )[0]?.[0] ?? "Unknown";

  return {
    averageBurstRatio: totalBurstRatio / motionEvents.length,
    averageSedentaryRatio: totalSedentaryRatio / motionEvents.length,
    averageStability: totalStability / motionEvents.length,
    dominantLabel,
    eventCount: motionEvents.length,
    latestTimestamp: motionEvents[0].timestampStart,
  };
}

interface ConnectivitySummary {
  eventCount: number;
  latestState: string;
  latestTimestamp: string;
  uniqueStateCount: number;
}

function buildConnectivitySummary(
  events: ZentraEventRecord[],
): ConnectivitySummary | null {
  const connectivityEvents = sortEventsDescending(
    events.filter(
      (event) =>
        event.dataType === "connectivity_state" &&
        typeof event.valueText === "string",
    ),
  );
  if (!connectivityEvents.length) {
    return null;
  }

  return {
    eventCount: connectivityEvents.length,
    latestState: titleCase(connectivityEvents[0].valueText ?? "online"),
    latestTimestamp: connectivityEvents[0].timestampStart,
    uniqueStateCount: new Set(
      connectivityEvents.map((event) => event.valueText ?? "unknown"),
    ).size,
  };
}

function buildVisualForMetric(
  metricKey: string,
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  switch (metricKey) {
    case "steps":
      return buildStepsVisual(events);
    case "activeMinutes":
      return buildActiveMinutesVisual(events);
    case "screenTime":
      return buildScreenTimeVisual(events);
    case "unlockCount":
      return buildUnlockVisual(events);
    case "mobilityRadius":
    case "distanceMeters":
      return buildLocationRadiusVisual(events);
    case "topActivity":
      return buildTopActivityVisual(events);
    case "dataCompleteness":
      return buildCompletenessVisual(events);
    case "deviceContext":
      return buildBatteryVisual(events);
    case "motionContext":
      return buildMotionContextVisual(events);
    case "connectivity":
      return buildConnectivityVisual(events);
    case "heartRate":
      return buildHeartRateVisual(events);
    case "exerciseSessions":
      return buildExerciseVisual(events);
    default:
      return null;
  }
}

function buildVisualForEventType(
  eventType: EventDataType,
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  switch (eventType) {
    case "steps":
      return buildStepsVisual(events);
    case "activity":
      return buildTopActivityVisual(events);
    case "app_usage":
      return buildScreenTimeVisual(events);
    case "unlock_event":
      return buildUnlockVisual(events);
    case "charging_state":
      return buildBatteryVisual(events);
    case "location":
      return buildLocationRadiusVisual(events);
    case "sleep_inferred":
      return buildSleepVisual(events);
    case "heart_rate":
      return buildHeartRateVisual(events);
    case "exercise_session":
      return buildExerciseVisual(events);
    case "motion_context":
      return buildMotionContextVisual(events);
    case "connectivity_state":
      return buildConnectivityVisual(events);
    default:
      return null;
  }
}

function buildMetricFacts(
  metric: MetricLike,
  context: TodayVisualizationContext,
): TodayDetailFact[] {
  const relatedEvents = getRelatedEvents(context.todayEvents, metric.key);
  const latestEvent = relatedEvents[0];
  const currentActivityLabel = getCurrentActivityLabel(context.todayEvents);
  const latestActivityEvent = getLatestActivityEvent(context.todayEvents);
  const motionSummary = buildMotionContextSummary(context.todayEvents);
  const connectivitySummary = buildConnectivitySummary(context.todayEvents);

  switch (metric.key) {
    case "steps":
      return [
        { label: "Source", value: getMetricSourceLabel(metric.key) },
        {
          label: "Last update",
          value: context.todaySnapshot.stepLastUpdatedAt
            ? formatDateTimeLabel(context.todaySnapshot.stepLastUpdatedAt)
            : "Waiting for first reading",
        },
        { label: "Samples", value: formatNumber(relatedEvents.length) },
      ];
    case "activeMinutes":
      return [
        { label: "Source", value: getMetricSourceLabel(metric.key) },
        {
          label: "Current activity",
          value: currentActivityLabel ?? "Waiting for first transition",
        },
        {
          label: "Top activity",
          value: context.todayAggregate?.topActivity
            ? formatActivityLabel(context.todayAggregate.topActivity)
            : "No dominant pattern yet",
        },
        { label: "Transitions", value: formatNumber(relatedEvents.length) },
      ];
    case "screenTime":
      return [
        { label: "Source", value: getMetricSourceLabel(metric.key) },
        {
          label: "Unlocks",
          value: formatNumber(
            context.todayAggregate?.unlockCount ??
              context.todayEvents.filter(
                (event) => event.dataType === "unlock_event",
              ).length,
          ),
        },
        {
          label: "App rows",
          value: formatNumber(
            relatedEvents.filter((event) => event.dataType === "app_usage")
              .length,
          ),
        },
      ];
    case "mobilityRadius":
      return [
        { label: "Source", value: getMetricSourceLabel(metric.key) },
        {
          label: "Location samples",
          value: formatNumber(relatedEvents.length),
        },
        {
          label: "Last sample",
          value: context.todaySnapshot.locationLastUpdatedAt
            ? formatDateTimeLabel(context.todaySnapshot.locationLastUpdatedAt)
            : "No sample yet",
        },
      ];
    case "unlockCount":
      return [
        { label: "Source", value: getMetricSourceLabel(metric.key) },
        {
          label: "Latest unlock",
          value: latestEvent
            ? formatDateTimeLabel(latestEvent.timestampStart)
            : "No unlock events today",
        },
        { label: "Events stored", value: formatNumber(relatedEvents.length) },
      ];
    case "topActivity":
      return [
        { label: "Source", value: getMetricSourceLabel(metric.key) },
        {
          label: "Activity samples",
          value: formatNumber(relatedEvents.length),
        },
        {
          label: "Latest sample",
          value: latestActivityEvent
            ? formatDateTimeLabel(latestActivityEvent.timestampStart)
            : relatedEvents[0]
              ? formatDateTimeLabel(relatedEvents[0].timestampStart)
              : "No data captured",
        },
      ];
    case "dataCompleteness":
      return [
        { label: "Source", value: getMetricSourceLabel(metric.key) },
        {
          label: "Coverage",
          value: `${getCoverageCount(context.todayEvents)} of ${CORE_SIGNAL_TYPES.length} core signals`,
        },
        {
          label: "Aggregate",
          value: context.todayAggregate
            ? formatDateTimeLabel(context.todayAggregate.computedAt)
            : "Waiting for aggregate",
        },
      ];
    case "deviceContext":
      return [
        { label: "Source", value: getMetricSourceLabel(metric.key) },
        {
          label: "Battery",
          value: buildDeviceContextValue(context.todaySnapshot),
        },
        {
          label: "Low power",
          value: context.todaySnapshot.lowPowerMode ? "On" : "Off",
        },
      ];
    case "motionContext":
      return [
        { label: "Source", value: getMetricSourceLabel(metric.key) },
        {
          label: "Dominant pattern",
          value: motionSummary?.dominantLabel ?? "Waiting for motion windows",
        },
        {
          label: "Stability",
          value: motionSummary
            ? formatPercent(motionSummary.averageStability * 100)
            : "--",
        },
        {
          label: "Burst share",
          value: motionSummary
            ? formatPercent(motionSummary.averageBurstRatio * 100)
            : "--",
        },
      ];
    case "connectivity":
      return [
        { label: "Source", value: getMetricSourceLabel(metric.key) },
        {
          label: "Latest state",
          value:
            connectivitySummary?.latestState ?? "Waiting for network state",
        },
        {
          label: "Captured",
          value: connectivitySummary
            ? formatNumber(connectivitySummary.eventCount)
            : "0",
        },
        {
          label: "State variety",
          value: connectivitySummary
            ? formatNumber(connectivitySummary.uniqueStateCount)
            : "0",
        },
      ];
    case "heartRate":
      return [
        { label: "Source", value: getMetricSourceLabel(metric.key) },
        { label: "Readings", value: formatNumber(relatedEvents.length) },
        {
          label: "Latest",
          value: latestEvent
            ? formatDateTimeLabel(latestEvent.timestampStart)
            : "No readings yet",
        },
      ];
    case "exerciseSessions":
      return [
        { label: "Source", value: getMetricSourceLabel(metric.key) },
        { label: "Sessions", value: formatNumber(relatedEvents.length) },
        {
          label: "Latest",
          value: latestEvent
            ? formatDateTimeLabel(latestEvent.timestampStart)
            : "No sessions yet",
        },
      ];
    default:
      return [
        { label: "Source", value: getMetricSourceLabel(metric.key) },
        {
          label: "Latest reading",
          value: latestEvent
            ? formatDateTimeLabel(latestEvent.timestampStart)
            : "No reading yet",
        },
      ];
  }
}

function buildMetricMeta(
  metric: MetricLike,
  context: TodayVisualizationContext,
): string {
  const relatedEvents = getRelatedEvents(context.todayEvents, metric.key);
  const currentActivityLabel = getCurrentActivityLabel(context.todayEvents);
  if (relatedEvents.length) {
    if (metric.key === "activeMinutes" && currentActivityLabel) {
      return `${relatedEvents.length} activity sample${relatedEvents.length === 1 ? "" : "s"} stored today · current ${currentActivityLabel}`;
    }

    return `${relatedEvents.length} related reading${relatedEvents.length === 1 ? "" : "s"} stored today`;
  }

  if (metric.key === "activeMinutes" && currentActivityLabel) {
    return `Current activity is ${currentActivityLabel}, but no activity history has landed yet`;
  }

  return metric.available
    ? "No raw rows surfaced for this metric yet"
    : "This metric is still waiting for usable data";
}

export function buildTodaySecondaryMetrics(
  todayAggregate: DailyAggregateRecord | null,
  todaySnapshot: TodayLiveSnapshot,
  todayEvents: ZentraEventRecord[],
): TodaySummaryMetric[] {
  const unlockCount =
    todayAggregate?.unlockCount ??
    todayEvents.filter((event) => event.dataType === "unlock_event").length;
  const topActivity = todayAggregate?.topActivity
    ? formatActivityLabel(todayAggregate.topActivity)
    : "Waiting";
  const completenessValue =
    todayAggregate?.dataCompleteness ??
    (todayEvents.length
      ? getCoverageCount(todayEvents) / CORE_SIGNAL_TYPES.length
      : 0);

  const heartRateEvents = todayEvents.filter(
    (event) =>
      event.dataType === "heart_rate" && typeof event.valueNumeric === "number",
  );
  const exerciseEvents = todayEvents.filter(
    (event) => event.dataType === "exercise_session",
  );
  const latestHeartRate = heartRateEvents.length
    ? Math.round(heartRateEvents[heartRateEvents.length - 1]!.valueNumeric ?? 0)
    : null;
  const exerciseCount = exerciseEvents.length;
  const motionSummary = buildMotionContextSummary(todayEvents);
  const connectivitySummary = buildConnectivitySummary(todayEvents);

  const metrics: TodaySummaryMetric[] = [
    {
      key: "unlockCount",
      label: "Unlock Count",
      value: formatNumber(unlockCount),
      detail:
        Platform.OS === "ios"
          ? "Unlock history stays unavailable on iOS."
          : "Usage Access rows captured from Android unlock history.",
      tone: "cool",
      available: Platform.OS !== "ios" && unlockCount > 0,
    },
    {
      key: "topActivity",
      label: "Top Activity",
      value: topActivity,
      detail: todayAggregate?.topActivity
        ? "Most frequent movement pattern captured so far today."
        : "No dominant movement pattern has surfaced yet.",
      tone: "physical",
      available: Boolean(todayAggregate?.topActivity),
    },
    {
      key: "dataCompleteness",
      label: "Completeness",
      value: formatPercent(completenessValue * 100),
      detail: `${getCoverageCount(todayEvents)} of ${CORE_SIGNAL_TYPES.length} core signals have surfaced today.`,
      tone: "hero",
      available: completenessValue > 0,
    },
    {
      key: "deviceContext",
      label: "Device Context",
      value: buildDeviceContextValue(todaySnapshot),
      detail: todaySnapshot.lowPowerMode
        ? "Battery snapshot includes low-power mode."
        : "Battery state stays visible even when other collectors are quiet.",
      tone: "human",
      available:
        Boolean(todaySnapshot.batteryStateLabel) ||
        typeof todaySnapshot.batteryLevel === "number",
    },
  ];

  if (latestHeartRate !== null) {
    metrics.push({
      key: "heartRate",
      label: "Heart Rate",
      value: `${latestHeartRate} bpm`,
      detail: `${heartRateEvents.length} reading${heartRateEvents.length === 1 ? "" : "s"} imported from ${getHealthPlatformName()}.`,
      tone: "human",
      available: true,
    });
  }

  if (exerciseCount > 0) {
    metrics.push({
      key: "exerciseSessions",
      label: "Exercise",
      value: `${exerciseCount} session${exerciseCount === 1 ? "" : "s"}`,
      detail: `Imported from ${getHealthPlatformName()}.`,
      tone: "physical",
      available: true,
    });
  }

  if (motionSummary) {
    metrics.push({
      key: "motionContext",
      label: "Movement Quality",
      value: motionSummary.dominantLabel,
      detail: `${motionSummary.eventCount} motion window${motionSummary.eventCount === 1 ? "" : "s"} today · ${formatPercent(motionSummary.averageSedentaryRatio * 100)} sedentary · ${formatPercent(motionSummary.averageBurstRatio * 100)} bursts.`,
      tone: "physical",
      available: true,
    });
  }

  if (connectivitySummary) {
    metrics.push({
      key: "connectivity",
      label: "Connectivity",
      value: connectivitySummary.latestState,
      detail: `${connectivitySummary.eventCount} network change${connectivitySummary.eventCount === 1 ? "" : "s"} captured today from system reachability.`,
      tone: "cool",
      available: true,
    });
  }

  return metrics;
}

export function buildTodayMetricDetailPayload(
  metric: MetricLike,
  context: TodayVisualizationContext,
): TodayDetailPayload {
  const relatedEvents = getRelatedEvents(context.todayEvents, metric.key);

  return {
    key: metric.key,
    eyebrow: "Today detail",
    title: metric.label,
    value: metric.value,
    summary: metric.detail,
    tone: metric.tone,
    meta: buildMetricMeta(metric, context),
    visual: buildVisualForMetric(metric.key, relatedEvents),
    facts: buildMetricFacts(metric, context),
    rows: buildRecentRows(relatedEvents),
  };
}

export function buildRecentSignalRows(
  todayEvents: ZentraEventRecord[],
): TodayRecentSignalRow[] {
  return sortEventsDescending(todayEvents)
    .slice(0, RECENT_SIGNAL_LIMIT)
    .map((event) => ({
      id: event.id,
      title: formatEventTitle(event),
      value: formatEventValue(event),
      detail: formatEventDetail(event),
      timestampLabel: formatTimestampLabel(event.timestampStart),
      sourceLabel: getEventProvenanceLabel(event),
      tone: getEventTone(event),
      event,
    }));
}

function buildEventSpecificFacts(event: ZentraEventRecord): TodayDetailFact[] {
  switch (event.dataType) {
    case "sleep_inferred":
      return [
        ...(typeof event.metadata.health_platform === "string"
          ? [
              {
                label: "Platform",
                value: String(event.metadata.health_platform),
              },
            ]
          : []),
        ...(typeof event.metadata.heuristic === "string"
          ? [
              {
                label: "Heuristic",
                value: titleCase(String(event.metadata.heuristic)),
              },
            ]
          : []),
      ];
    case "motion_context":
      return [
        ...(typeof event.metadata.stability === "number"
          ? [
              {
                label: "Stability",
                value: formatPercent(Number(event.metadata.stability) * 100),
              },
            ]
          : []),
        ...(typeof event.metadata.sedentary_ratio === "number"
          ? [
              {
                label: "Sedentary share",
                value: formatPercent(
                  Number(event.metadata.sedentary_ratio) * 100,
                ),
              },
            ]
          : []),
        ...(typeof event.metadata.burst_ratio === "number"
          ? [
              {
                label: "Burst share",
                value: formatPercent(Number(event.metadata.burst_ratio) * 100),
              },
            ]
          : []),
      ];
    case "heart_rate":
    case "exercise_session":
      return typeof event.metadata.health_platform === "string"
        ? [{ label: "Platform", value: String(event.metadata.health_platform) }]
        : [];
    default:
      return [];
  }
}

export function buildRecentSignalDetailPayload(
  event: ZentraEventRecord,
  todayEvents: ZentraEventRecord[],
): TodayDetailPayload {
  const relatedEvents = sortEventsDescending(
    todayEvents.filter((candidate) => candidate.dataType === event.dataType),
  );
  const metadataFacts = Object.entries(event.metadata)
    .slice(0, 2)
    .map(([label, value]) => ({
      label: titleCase(label),
      value: String(value),
    }));

  return {
    key: event.id,
    eyebrow: "Recent signal",
    title: formatEventTitle(event),
    value: formatEventValue(event),
    summary: formatEventDetail(event),
    tone: getEventTone(event),
    meta: `Stored from ${getEventProvenanceLabel(event)} at ${formatDateTimeLabel(event.timestampStart)}`,
    visual: buildVisualForEventType(event.dataType, relatedEvents),
    facts: [
      { label: "Source", value: getSourceLabel(event) },
      { label: "Provenance", value: getEventProvenanceLabel(event) },
      { label: "Captured", value: formatDateTimeLabel(event.timestampStart) },
      { label: "Confidence", value: formatPercent(event.confidence * 100) },
      ...buildEventSpecificFacts(event),
      ...metadataFacts,
    ],
    rows: buildRecentRows(
      relatedEvents.filter((candidate) => candidate.id !== event.id),
    ),
  };
}

export function buildSignalHealthSummary(
  todayAggregate: DailyAggregateRecord | null,
  collectors: CollectorState[],
  todayEvents: ZentraEventRecord[],
): TodaySignalHealthSummary {
  const coverageCount = getCoverageCount(todayEvents);
  const completeness =
    todayAggregate?.dataCompleteness ??
    (todayEvents.length ? coverageCount / CORE_SIGNAL_TYPES.length : 0);
  const healthyCount = collectors.filter(
    (collector) => collector.health === "healthy",
  ).length;
  const degradedCount = collectors.filter(
    (collector) => collector.health === "degraded",
  ).length;

  return {
    valueLabel: formatPercent(completeness * 100),
    coverageLabel: `${coverageCount} of ${CORE_SIGNAL_TYPES.length} core signals seen today`,
    detail: collectors.length
      ? `${healthyCount} healthy · ${degradedCount} degraded · ${collectors.length} active collectors`
      : "No active collectors yet",
  };
}

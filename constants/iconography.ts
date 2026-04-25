import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

import type {
  CollectorHealth,
  CollectorKey,
  DataMode,
  EventDataType,
  EventSource,
  MetricTone,
  PermissionStatus,
  ThemePreference,
} from "@/types/zentra";
import type { AppPalette } from "@/constants/theme";

export type AppIconName = NonNullable<ComponentProps<typeof Ionicons>["name"]>;

export type MetricIconKey =
  | "steps"
  | "activeMinutes"
  | "screenTime"
  | "mobilityRadius"
  | "distanceMeters"
  | "unlockCount"
  | "topActivity"
  | "activitySummary"
  | "dataCompleteness"
  | "deviceContext"
  | "sleepEstimate"
  | "ambientLight"
  | "heartRate"
  | "exerciseSession"
  | "exerciseSessions"
  | "motionContext"
  | "connectivity"
  | "avgSpeed";

export type ActionIconKey =
  | "openSettings"
  | "grantAccess"
  | "retry"
  | "delete"
  | "share"
  | "export"
  | "range"
  | "format"
  | "selectedSignals"
  | "bundle"
  | "close"
  | "details";

// Keep charts, dense chip rows, and long-form body copy mostly icon-free.
// Icons should only help with recognition, status, provenance, or action affordance.
const METRIC_ICONS: Record<MetricIconKey, AppIconName> = {
  steps: "walk-outline",
  activeMinutes: "pulse-outline",
  screenTime: "phone-portrait-outline",
  mobilityRadius: "locate-outline",
  distanceMeters: "map-outline",
  unlockCount: "lock-open-outline",
  topActivity: "body-outline",
  activitySummary: "body-outline",
  dataCompleteness: "shield-checkmark-outline",
  deviceContext: "battery-half-outline",
  sleepEstimate: "moon-outline",
  ambientLight: "sunny-outline",
  heartRate: "heart-outline",
  exerciseSession: "barbell-outline",
  exerciseSessions: "barbell-outline",
  motionContext: "speedometer-outline",
  connectivity: "wifi-outline",
  avgSpeed: "speedometer-outline",
};

const COLLECTOR_ICONS: Record<CollectorKey, AppIconName> = {
  steps: "walk-outline",
  activity: "body-outline",
  appUsage: "phone-portrait-outline",
  deviceState: "battery-half-outline",
  connectivity: "wifi-outline",
  healthConnect: "fitness-outline",
  location: "locate-outline",
  sleep: "moon-outline",
  ambientLight: "sunny-outline",
  motionContext: "speedometer-outline",
};

const EVENT_TYPE_ICONS: Record<EventDataType, AppIconName> = {
  steps: "walk-outline",
  distance: "map-outline",
  activity: "body-outline",
  location: "locate-outline",
  screen_state: "phone-portrait-outline",
  app_usage: "apps-outline",
  unlock_event: "lock-open-outline",
  charging_state: "battery-half-outline",
  sleep_inferred: "moon-outline",
  heart_rate: "heart-outline",
  exercise_session: "barbell-outline",
  ambient_light: "sunny-outline",
  motion_context: "speedometer-outline",
  connectivity_state: "wifi-outline",
};

const EVENT_SOURCE_ICONS: Record<EventSource, AppIconName> = {
  sensor: "hardware-chip-outline",
  health_connect: "fitness-outline",
  activity_recognition: "body-outline",
  native_buffered: "download-outline",
  usage_stats: "phone-portrait-outline",
  system_broadcast: "settings-outline",
  inferred: "sparkles-outline",
};

const COLLECTOR_HEALTH_ICONS: Record<CollectorHealth, AppIconName> = {
  healthy: "checkmark-circle-outline",
  degraded: "alert-circle-outline",
  idle: "pause-circle-outline",
};

const PERMISSION_STATUS_ICONS: Record<PermissionStatus, AppIconName> = {
  granted: "checkmark-circle-outline",
  not_requested: "key-outline",
  blocked: "close-circle-outline",
  derived: "sparkles-outline",
  unsupported: "remove-circle-outline",
};

const THEME_ICONS: Record<ThemePreference, AppIconName> = {
  system: "phone-portrait-outline",
  light: "sunny-outline",
  dark: "moon-outline",
  sunrise: "partly-sunny-outline",
};

const DATA_MODE_ICONS: Record<DataMode, AppIconName> = {
  live: "radio-outline",
  demo: "flask-outline",
};

const ACTION_ICONS: Record<ActionIconKey, AppIconName> = {
  openSettings: "settings-outline",
  grantAccess: "key-outline",
  retry: "refresh-outline",
  delete: "trash-outline",
  share: "share-outline",
  export: "download-outline",
  range: "calendar-outline",
  format: "document-text-outline",
  selectedSignals: "layers-outline",
  bundle: "archive-outline",
  close: "close-outline",
  details: "chevron-forward-outline",
};

const EVENT_TYPE_KEYS = new Set<EventDataType>([
  "steps",
  "distance",
  "activity",
  "location",
  "screen_state",
  "app_usage",
  "unlock_event",
  "charging_state",
  "sleep_inferred",
  "heart_rate",
  "exercise_session",
  "ambient_light",
  "motion_context",
  "connectivity_state",
]);

const METRIC_ICON_KEYS = new Set<MetricIconKey>([
  "steps",
  "activeMinutes",
  "screenTime",
  "mobilityRadius",
  "distanceMeters",
  "unlockCount",
  "topActivity",
  "activitySummary",
  "dataCompleteness",
  "deviceContext",
  "sleepEstimate",
  "ambientLight",
  "heartRate",
  "exerciseSession",
  "exerciseSessions",
  "motionContext",
  "connectivity",
  "avgSpeed",
]);

export function isMetricIconKey(value: string): value is MetricIconKey {
  return METRIC_ICON_KEYS.has(value as MetricIconKey);
}

export function getMetricIcon(key: MetricIconKey): AppIconName {
  return METRIC_ICONS[key];
}

export function getCollectorIcon(key: CollectorKey): AppIconName {
  return COLLECTOR_ICONS[key];
}

export function getEventTypeIcon(type: EventDataType): AppIconName {
  return EVENT_TYPE_ICONS[type];
}

export function isEventDataType(value: string): value is EventDataType {
  return EVENT_TYPE_KEYS.has(value as EventDataType);
}

export function getEventSourceIcon(source: EventSource): AppIconName {
  return EVENT_SOURCE_ICONS[source];
}

export function getCollectorHealthIcon(health: CollectorHealth): AppIconName {
  return COLLECTOR_HEALTH_ICONS[health];
}

export function getPermissionStatusIcon(status: PermissionStatus): AppIconName {
  return PERMISSION_STATUS_ICONS[status];
}

export function getThemePreferenceIcon(
  preference: ThemePreference,
): AppIconName {
  return THEME_ICONS[preference];
}

export function getDataModeIcon(mode: DataMode): AppIconName {
  return DATA_MODE_ICONS[mode];
}

export function getActionIcon(action: ActionIconKey): AppIconName {
  return ACTION_ICONS[action];
}

export function getDetailFactIcon(label: string): AppIconName {
  const normalizedLabel = label.trim().toLowerCase();

  if (normalizedLabel.includes("source")) {
    return "hardware-chip-outline";
  }

  if (
    normalizedLabel.includes("last") ||
    normalizedLabel.includes("latest") ||
    normalizedLabel.includes("update") ||
    normalizedLabel.includes("aggregate")
  ) {
    return "time-outline";
  }

  if (
    normalizedLabel.includes("sample") ||
    normalizedLabel.includes("row") ||
    normalizedLabel.includes("event") ||
    normalizedLabel.includes("transition") ||
    normalizedLabel.includes("count")
  ) {
    return "layers-outline";
  }

  if (
    normalizedLabel.includes("activity") ||
    normalizedLabel.includes("movement")
  ) {
    return "body-outline";
  }

  if (
    normalizedLabel.includes("coverage") ||
    normalizedLabel.includes("completeness")
  ) {
    return "shield-checkmark-outline";
  }

  if (
    normalizedLabel.includes("battery") ||
    normalizedLabel.includes("power")
  ) {
    return "battery-half-outline";
  }

  if (normalizedLabel.includes("confidence")) {
    return "pulse-outline";
  }

  return "information-circle-outline";
}

export function getMetricIconColor(
  tone: MetricTone,
  palette: AppPalette,
): string {
  switch (tone) {
    case "physical":
      return palette.signalPhysical;
    case "human":
      return palette.signalHuman;
    case "cool":
      return palette.signalCool;
    default:
      return palette.primary;
  }
}

export function getCollectorHealthIconColor(
  health: CollectorHealth,
  palette: AppPalette,
): string {
  switch (health) {
    case "healthy":
      return palette.success;
    case "degraded":
      return palette.primary;
    default:
      return palette.mutedForeground;
  }
}

export function getPermissionStatusIconColor(
  status: PermissionStatus,
  palette: AppPalette,
): string {
  switch (status) {
    case "granted":
      return palette.success;
    case "derived":
      return palette.primary;
    case "blocked":
      return palette.destructive;
    case "unsupported":
      return palette.mutedForeground;
    default:
      return palette.textSecondary;
  }
}

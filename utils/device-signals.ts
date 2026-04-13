import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { Platform } from "react-native";

import type {
  CollectorDiagnosticRecord,
  CollectorKey,
  CollectorState,
  DailyAggregateRecord,
  DashboardMetric,
  EventDataType,
  EventSource,
  LocationSample,
  PermissionStatus,
  SignalStoreState,
  SleepEstimate,
  TodayLiveSnapshot,
  ZentraEventRecord,
} from "@/types/zentra";
import { getCurrentActivityLabel } from "@/utils/activity-summary";
import { getCollectorTelemetryState } from "@/utils/collector-telemetry";
import { deriveDiagnosticPermissionStatus } from "@/utils/collector-permission-status";
import { formatBytes, formatMinutes, formatNumber } from "@/utils/format";
import { computeCumulativeSteps } from "@/utils/repository-aggregates";
import {
  getCollectorPlatformOverrides,
  getHealthPlatformName,
} from "@/utils/platform-capabilities";

type CollectorStateMap = Record<CollectorKey, CollectorState>;

interface CollectorStatusOverrides {
  hasLatestSleepEstimate?: boolean;
  permissionStatusByCollector?: Partial<Record<CollectorKey, PermissionStatus>>;
}

function mapPermissionStatus(status: string): PermissionStatus {
  if (status === "granted") {
    return "granted";
  }

  if (status === "denied") {
    return "blocked";
  }

  return "not_requested";
}

function formatTimestampLabel(timestamp: string | null): string {
  if (!timestamp) {
    return "Waiting for the first signal…";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMeters(a: LocationSample, b: LocationSample): number {
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

export function calculateMobilityRadius(
  samples: LocationSample[],
): number | null {
  if (samples.length < 2) {
    return null;
  }

  const origin = samples[0];
  return Math.max(...samples.map((sample) => distanceMeters(origin, sample)));
}

function formatRadius(radiusMeters: number | null): string {
  if (radiusMeters === null) {
    return "Waiting";
  }

  if (radiusMeters < 1000) {
    return `${Math.round(radiusMeters)} m`;
  }

  return `${(radiusMeters / 1000).toFixed(1)} km`;
}

function formatBatteryValue(level: number | null): string {
  if (level === null || level < 0) {
    return "Unavailable";
  }

  return `${Math.round(level * 100)}%`;
}

function formatLux(value: number | null): string {
  if (value === null) {
    return "Waiting";
  }

  return `${Math.round(value)} lux`;
}

function metric(
  key: string,
  label: string,
  value: string,
  detail: string,
  tone: DashboardMetric["tone"],
  available: boolean,
): DashboardMetric {
  return { key, label, value, detail, tone, available };
}

export function buildLiveDashboardMetrics(
  collectors: CollectorStateMap,
  signals: SignalStoreState,
  todaySnapshot: TodayLiveSnapshot,
  todayAggregate: DailyAggregateRecord | null,
  todayEvents: ZentraEventRecord[],
): DashboardMetric[] {
  const mobilityRadius =
    todayAggregate?.mobilityRadiusMeters ??
    calculateMobilityRadius(todaySnapshot.locationSamples);
  const currentActivity = getCurrentActivityLabel(todayEvents);
  const cumulativeSteps = computeCumulativeSteps(todayEvents);
  const hasSteps = cumulativeSteps > 0 || todaySnapshot.stepCount !== null;
  const displaySteps = hasSteps
    ? formatNumber(
        cumulativeSteps > 0 ? cumulativeSteps : (todaySnapshot.stepCount ?? 0),
      )
    : "Waiting";

  return [
    metric(
      "steps",
      "Steps",
      displaySteps,
      collectors.steps.enabled
        ? signals.stepPermissionStatus === "granted"
          ? "Cumulative steps recorded today."
          : "Allow motion access so Zentra can count your steps."
        : "Turn on Steps in Settings to start counting.",
      "hero",
      hasSteps,
    ),
    metric(
      "activeMinutes",
      "Active Minutes",
      todayAggregate
        ? formatNumber(todayAggregate.activeMinutes)
        : collectors.activity.enabled || collectors.steps.enabled
          ? "0"
          : "Waiting",
      collectors.activity.enabled || collectors.steps.enabled
        ? currentActivity
          ? todayAggregate && todayAggregate.activeMinutes > 0
            ? `Current activity: ${currentActivity}. Total time spent in non-idle activities today.`
            : `Current activity: ${currentActivity}. Zentra is waiting for more activity data to build the day.`
          : todayAggregate && todayAggregate.activeMinutes > 0
            ? "Total time spent walking, running, or in other non-idle activities today."
            : "Active minutes appear once movement is detected from sensors or steps."
        : "Turn on Activity or Steps in Settings to start.",
      "physical",
      Boolean(currentActivity) ||
        Boolean(todayAggregate && todayAggregate.activeMinutes > 0),
    ),
    metric(
      "screenTime",
      "Screen Time",
      todayAggregate
        ? formatMinutes(Math.round(todayAggregate.screenTimeSeconds / 60))
        : "Waiting",
      Platform.OS === "ios"
        ? "iOS doesn't share screen time with apps — this one stays quiet."
        : collectors.appUsage.enabled
          ? todayAggregate && todayAggregate.screenTimeSeconds > 0
            ? "Calculated from your app session history via Android Usage Access."
            : "Allow Usage Access so Zentra can see your screen time."
          : "Turn on Screen Time in Settings.",
      "cool",
      Platform.OS === "ios"
        ? false
        : Boolean(todayAggregate && todayAggregate.screenTimeSeconds > 0),
    ),
    metric(
      "mobilityRadius",
      "Mobility Radius",
      formatRadius(mobilityRadius),
      collectors.location.enabled
        ? signals.locationPermissionStatus === "granted"
          ? "Estimated from location points captured while Zentra is open."
          : "Allow location access to estimate how far you've ranged today."
        : "Turn on Location in Settings.",
      "human",
      mobilityRadius !== null,
    ),
  ];
}

export function buildLiveSleepEstimate(
  sleepEvent: ZentraEventRecord | null,
): SleepEstimate {
  if (!sleepEvent || typeof sleepEvent.valueNumeric !== "number") {
    return {
      startLabel: "--:--",
      endLabel: "--:--",
      durationLabel: "Not available",
      confidence: 0,
      available: false,
      detail:
        "Sleep patterns show up once Zentra has screen-state history or health records to work with.",
      sourceLabel: "Waiting",
      isImported: false,
    };
  }

  const startDate = new Date(sleepEvent.timestampStart);
  const endDate = new Date(sleepEvent.timestampEnd);
  const isImported = sleepEvent.source === "health_connect";
  const sourceLabel = isImported
    ? typeof sleepEvent.metadata.health_platform === "string"
      ? sleepEvent.metadata.health_platform
      : getHealthPlatformName()
    : "Local inference";

  return {
    startLabel: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(startDate),
    endLabel: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(endDate),
    durationLabel: formatMinutes(Math.round(sleepEvent.valueNumeric)),
    confidence: sleepEvent.confidence,
    available: true,
    detail: isImported
      ? `Pulled in from your ${sourceLabel} history.`
      : "Inferred from screen, unlock, and charging patterns on your device.",
    sourceLabel,
    isImported,
  };
}

function buildCollectorClone(
  collector: CollectorState,
  overrides: Partial<CollectorState>,
): CollectorState {
  return {
    ...collector,
    ...getCollectorPlatformOverrides(collector.key),
    ...overrides,
  };
}

export function buildCollectorStatuses(
  collectors: CollectorStateMap,
  signals: SignalStoreState,
  diagnostics: CollectorDiagnosticRecord[],
  overrides: CollectorStatusOverrides = {},
): CollectorState[] {
  const diagnosticsByCollector = diagnostics.reduce<
    Record<string, CollectorDiagnosticRecord>
  >((result, diagnostic) => {
    result[diagnostic.collectorKey] = diagnostic;
    return result;
  }, {});
  const items: CollectorState[] = [];
  const permissionStatusByCollector =
    overrides.permissionStatusByCollector ?? {};

  items.push(
    buildCollectorClone(collectors.steps, {
      ...getCollectorTelemetryState(diagnosticsByCollector.steps),
      permissionStatus: collectors.steps.enabled
        ? signals.stepPermissionStatus
        : "not_requested",
      health: !collectors.steps.enabled
        ? "idle"
        : diagnosticsByCollector.steps?.status === "success" ||
            signals.stepCount !== null
          ? "healthy"
          : "degraded",
      lastRunLabel: collectors.steps.enabled
        ? diagnosticsByCollector.steps
          ? `${diagnosticsByCollector.steps.message ?? "Recorded"} · ${formatTimestampLabel(diagnosticsByCollector.steps.recordedAt)}`
          : formatTimestampLabel(signals.stepLastUpdatedAt)
        : "Off",
    }),
  );

  items.push(
    buildCollectorClone(collectors.deviceState, {
      ...getCollectorTelemetryState(diagnosticsByCollector.deviceState),
      permissionStatus: "granted",
      health: collectors.deviceState.enabled
        ? diagnosticsByCollector.deviceState?.status === "success" ||
          signals.batterySupported
          ? "healthy"
          : "degraded"
        : "idle",
      lastRunLabel: collectors.deviceState.enabled
        ? diagnosticsByCollector.deviceState
          ? `${diagnosticsByCollector.deviceState.message ?? "Recorded"} · ${formatTimestampLabel(diagnosticsByCollector.deviceState.recordedAt)}`
          : signals.batteryLastUpdatedAt
            ? `Battery ${formatBatteryValue(signals.batteryLevel)}`
            : "Waiting for battery…"
        : "Off",
    }),
  );

  items.push(
    buildCollectorClone(collectors.connectivity, {
      ...getCollectorTelemetryState(diagnosticsByCollector.connectivity),
      permissionStatus: "granted",
      health: collectors.connectivity.enabled
        ? diagnosticsByCollector.connectivity?.status === "success"
          ? "healthy"
          : "idle"
        : "idle",
      lastRunLabel: collectors.connectivity.enabled
        ? diagnosticsByCollector.connectivity
          ? `${diagnosticsByCollector.connectivity.message ?? "Recorded"} · ${formatTimestampLabel(diagnosticsByCollector.connectivity.recordedAt)}`
          : "Waiting for network changes…"
        : "Off",
    }),
  );

  items.push(
    buildCollectorClone(collectors.location, {
      ...getCollectorTelemetryState(diagnosticsByCollector.location),
      permissionStatus: collectors.location.enabled
        ? signals.locationPermissionStatus
        : "not_requested",
      health: !collectors.location.enabled
        ? "idle"
        : diagnosticsByCollector.location?.status === "success" ||
            signals.locationSamples.length > 0
          ? "healthy"
          : "degraded",
      lastRunLabel: collectors.location.enabled
        ? diagnosticsByCollector.location
          ? `${diagnosticsByCollector.location.message ?? "Recorded"} · ${formatTimestampLabel(diagnosticsByCollector.location.recordedAt)}`
          : signals.locationLastUpdatedAt
            ? `${signals.locationSamples.length} sample(s)`
            : "Waiting for a location fix…"
        : "Off",
    }),
  );

  items.push(
    buildCollectorClone(collectors.ambientLight, {
      ...getCollectorTelemetryState(diagnosticsByCollector.ambientLight),
      permissionStatus: Platform.OS === "ios" ? "unsupported" : "granted",
      health: !collectors.ambientLight.enabled
        ? "idle"
        : diagnosticsByCollector.ambientLight?.status === "success" ||
            signals.ambientLightLux !== null
          ? "healthy"
          : "degraded",
      lastRunLabel: collectors.ambientLight.enabled
        ? diagnosticsByCollector.ambientLight
          ? `${diagnosticsByCollector.ambientLight.message ?? "Recorded"} · ${formatTimestampLabel(diagnosticsByCollector.ambientLight.recordedAt)}`
          : Platform.OS === "ios"
            ? "Unsupported on iOS"
            : signals.ambientLightLastUpdatedAt
              ? formatLux(signals.ambientLightLux)
              : "Waiting for light data…"
        : Platform.OS === "ios"
          ? "Unsupported on iOS"
          : "Off",
    }),
  );

  items.push(
    buildCollectorClone(collectors.activity, {
      ...getCollectorTelemetryState(diagnosticsByCollector.activity),
      permissionStatus: collectors.activity.enabled
        ? (permissionStatusByCollector.activity ??
          deriveDiagnosticPermissionStatus(
            diagnosticsByCollector.activity,
            "not_requested",
          ))
        : "not_requested",
      health: collectors.activity.enabled
        ? diagnosticsByCollector.activity?.status === "success"
          ? "healthy"
          : permissionStatusByCollector.activity === "granted"
            ? "idle"
            : "degraded"
        : "idle",
      lastRunLabel: collectors.activity.enabled
        ? permissionStatusByCollector.activity === "granted" &&
          diagnosticsByCollector.activity?.status !== "success"
          ? "Waiting for activity…"
          : diagnosticsByCollector.activity
            ? `${diagnosticsByCollector.activity.message ?? "Waiting"} · ${formatTimestampLabel(diagnosticsByCollector.activity.recordedAt)}`
            : "Waiting for activity…"
        : "Off",
    }),
  );

  items.push(
    buildCollectorClone(collectors.appUsage, {
      ...getCollectorTelemetryState(diagnosticsByCollector.appUsage),
      permissionStatus:
        Platform.OS === "ios"
          ? "unsupported"
          : collectors.appUsage.enabled
            ? deriveDiagnosticPermissionStatus(
                diagnosticsByCollector.appUsage,
                "not_requested",
              )
            : "not_requested",
      health: collectors.appUsage.enabled
        ? diagnosticsByCollector.appUsage?.status === "success"
          ? "healthy"
          : "degraded"
        : "idle",
      lastRunLabel: collectors.appUsage.enabled
        ? diagnosticsByCollector.appUsage
          ? `${diagnosticsByCollector.appUsage.message ?? "Waiting"} · ${formatTimestampLabel(diagnosticsByCollector.appUsage.recordedAt)}`
          : Platform.OS === "ios"
            ? "Unsupported on iOS"
            : "Waiting for usage data…"
        : Platform.OS === "ios"
          ? "Unsupported on iOS"
          : "Off",
    }),
  );

  items.push(
    buildCollectorClone(collectors.healthConnect, {
      ...getCollectorTelemetryState(diagnosticsByCollector.healthConnect),
      permissionStatus: collectors.healthConnect.enabled
        ? (permissionStatusByCollector.healthConnect ??
          deriveDiagnosticPermissionStatus(
            diagnosticsByCollector.healthConnect,
            "not_requested",
          ))
        : "not_requested",
      health: collectors.healthConnect.enabled
        ? diagnosticsByCollector.healthConnect?.status === "success"
          ? "healthy"
          : permissionStatusByCollector.healthConnect === "granted"
            ? "idle"
            : "degraded"
        : "idle",
      lastRunLabel: collectors.healthConnect.enabled
        ? permissionStatusByCollector.healthConnect === "granted" &&
          diagnosticsByCollector.healthConnect?.status !== "success"
          ? `Waiting for ${getHealthPlatformName()}…`
          : diagnosticsByCollector.healthConnect
            ? `${diagnosticsByCollector.healthConnect.message ?? "Waiting"} · ${formatTimestampLabel(diagnosticsByCollector.healthConnect.recordedAt)}`
            : `Waiting for ${getHealthPlatformName()}…`
        : "Off",
    }),
  );

  items.push(
    buildCollectorClone(collectors.sleep, {
      ...getCollectorTelemetryState(diagnosticsByCollector.sleep),
      permissionStatus: collectors.sleep.enabled
        ? deriveDiagnosticPermissionStatus(
            diagnosticsByCollector.sleep,
            "derived",
          )
        : "not_requested",
      health: collectors.sleep.enabled
        ? diagnosticsByCollector.sleep?.status === "success" ||
          overrides.hasLatestSleepEstimate
          ? "healthy"
          : "idle"
        : "idle",
      lastRunLabel: collectors.sleep.enabled
        ? diagnosticsByCollector.sleep?.status === "success" ||
          overrides.hasLatestSleepEstimate
          ? diagnosticsByCollector.sleep
            ? `${diagnosticsByCollector.sleep.message ?? "Waiting"} · ${formatTimestampLabel(diagnosticsByCollector.sleep.recordedAt)}`
            : "Sleep estimate available"
          : "Waiting for sleep data…"
        : "Off",
    }),
  );

  items.push(
    buildCollectorClone(collectors.motionContext, {
      ...getCollectorTelemetryState(diagnosticsByCollector.motionContext),
      permissionStatus: "granted",
      health: !collectors.motionContext.enabled
        ? "idle"
        : diagnosticsByCollector.motionContext?.status === "success"
          ? "healthy"
          : "degraded",
      lastRunLabel: collectors.motionContext.enabled
        ? diagnosticsByCollector.motionContext
          ? `${diagnosticsByCollector.motionContext.message ?? "Recorded"} · ${formatTimestampLabel(diagnosticsByCollector.motionContext.recordedAt)}`
          : "Waiting for motion data…"
        : "Off",
    }),
  );

  return items;
}

export function formatBatteryStateLabel(
  state: Battery.BatteryState | null,
): string | null {
  switch (state) {
    case Battery.BatteryState.CHARGING:
      return "Charging";
    case Battery.BatteryState.FULL:
      return "Full";
    case Battery.BatteryState.UNPLUGGED:
      return "Unplugged";
    case Battery.BatteryState.UNKNOWN:
      return "Unknown";
    default:
      return null;
  }
}

function baseEvent(
  id: string,
  dataType: EventDataType,
  source: EventSource,
): ZentraEventRecord {
  const now = new Date().toISOString();
  return {
    id,
    timestampStart: now,
    timestampEnd: now,
    dataType,
    source,
    unit: "count",
    confidence: 1,
    metadata: {},
    schemaVersion: 1,
    createdAt: now,
  };
}

export function buildRealExportEvents(
  signals: SignalStoreState,
): Record<string, ZentraEventRecord[]> {
  const events: Record<string, ZentraEventRecord[]> = {};

  if (signals.stepCount !== null) {
    events.steps = [
      {
        ...baseEvent("steps-current", "steps", "sensor"),
        valueNumeric: signals.stepCount,
        unit: "count",
        metadata: { session_based: true },
      },
    ];
  }

  if (signals.locationSamples.length) {
    events.location = signals.locationSamples.map((sample, index) => ({
      ...baseEvent(`location-${index}`, "location", "sensor"),
      timestampStart: sample.timestamp,
      timestampEnd: sample.timestamp,
      valueJson: JSON.stringify({
        latitude: sample.latitude,
        longitude: sample.longitude,
      }),
      unit: "coordinate",
    }));
  }

  if (signals.batteryLevel !== null || signals.batteryStateLabel) {
    events.charging_state = [
      {
        ...baseEvent(
          "device-state-current",
          "charging_state",
          "system_broadcast",
        ),
        valueNumeric: signals.batteryLevel ?? undefined,
        valueText: signals.batteryStateLabel ?? undefined,
        unit: "fraction",
        metadata: {
          low_power_mode: Boolean(signals.lowPowerMode),
        },
      },
    ];
  }

  if (signals.ambientLightLux !== null) {
    events.ambient_light = [
      {
        ...baseEvent("ambient-light-current", "ambient_light", "sensor"),
        valueNumeric: signals.ambientLightLux,
        unit: "lux",
      },
    ];
  }

  return events;
}

export function estimateRealExportBytes(signals: SignalStoreState): number {
  const events = buildRealExportEvents(signals);
  const eventBytes = Object.values(events)
    .flat()
    .reduce((total, record) => total + JSON.stringify(record).length, 0);

  return Math.max(eventBytes, 0);
}

export function getAvailableExportTypes(signals: SignalStoreState): string[] {
  return Object.keys(buildRealExportEvents(signals));
}

export function mapExpoPermissionStatus(status: string): PermissionStatus {
  return mapPermissionStatus(status);
}

export function describeExportSize(signals: SignalStoreState): string {
  return formatBytes(estimateRealExportBytes(signals));
}

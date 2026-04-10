import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

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
} from '@/types/zentra';
import { deriveDiagnosticPermissionStatus } from '@/utils/collector-permission-status';
import { formatBytes, formatMinutes, formatNumber } from '@/utils/format';
import {
  getCollectorPlatformOverrides,
  getHealthPlatformName,
} from '@/utils/platform-capabilities';

type CollectorStateMap = Record<CollectorKey, CollectorState>;

interface CollectorStatusOverrides {
  hasLatestSleepEstimate?: boolean;
  permissionStatusByCollector?: Partial<Record<CollectorKey, PermissionStatus>>;
}

function mapPermissionStatus(status: string): PermissionStatus {
  if (status === 'granted') {
    return 'granted';
  }

  if (status === 'denied') {
    return 'blocked';
  }

  return 'not_requested';
}

function formatTimestampLabel(timestamp: string | null): string {
  if (!timestamp) {
    return 'Waiting for first reading';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
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
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

export function calculateMobilityRadius(samples: LocationSample[]): number | null {
  if (samples.length < 2) {
    return null;
  }

  const origin = samples[0];
  return Math.max(...samples.map((sample) => distanceMeters(origin, sample)));
}

function formatRadius(radiusMeters: number | null): string {
  if (radiusMeters === null) {
    return 'Waiting';
  }

  if (radiusMeters < 1000) {
    return `${Math.round(radiusMeters)} m`;
  }

  return `${(radiusMeters / 1000).toFixed(1)} km`;
}

function formatBatteryValue(level: number | null): string {
  if (level === null || level < 0) {
    return 'Unavailable';
  }

  return `${Math.round(level * 100)}%`;
}

function formatLux(value: number | null): string {
  if (value === null) {
    return 'Waiting';
  }

  return `${Math.round(value)} lux`;
}

function metric(
  key: string,
  label: string,
  value: string,
  detail: string,
  tone: DashboardMetric['tone'],
  available: boolean,
): DashboardMetric {
  return { key, label, value, detail, tone, available };
}

export function buildLiveDashboardMetrics(
  collectors: CollectorStateMap,
  signals: SignalStoreState,
  todaySnapshot: TodayLiveSnapshot,
  todayAggregate: DailyAggregateRecord | null,
): DashboardMetric[] {
  const mobilityRadius = todayAggregate?.mobilityRadiusMeters ?? calculateMobilityRadius(todaySnapshot.locationSamples);

  return [
    metric(
      'steps',
      'Steps',
      todaySnapshot.stepCount !== null ? formatNumber(todaySnapshot.stepCount) : 'Waiting',
      collectors.steps.enabled
        ? (signals.stepPermissionStatus === 'granted'
          ? 'Live pedometer reading captured during this session.'
          : 'Enable motion permission to read the device pedometer.')
        : 'Turn on the Steps collector in Settings.',
      'hero',
      todaySnapshot.stepCount !== null,
    ),
    metric(
      'activeMinutes',
      'Active Minutes',
      todayAggregate ? formatNumber(todayAggregate.activeMinutes) : 'Waiting',
      collectors.activity.enabled
        ? (todayAggregate && todayAggregate.activeMinutes > 0
          ? 'Derived from stored activity transitions captured on this device.'
          : 'Activity history will appear once transitions are captured.')
        : 'Turn on the Activity collector in Settings.',
      'physical',
      Boolean(todayAggregate && todayAggregate.activeMinutes > 0),
    ),
    metric(
      'screenTime',
      'Screen Time',
      todayAggregate ? formatMinutes(Math.round(todayAggregate.screenTimeSeconds / 60)) : 'Waiting',
      Platform.OS === 'ios'
        ? 'Screen time and unlock history are not available to normal iOS apps.'
        : collectors.appUsage.enabled
          ? (todayAggregate && todayAggregate.screenTimeSeconds > 0
            ? 'Derived from Android Usage Access app session history.'
            : 'Grant Usage Access to begin collecting screen-time history.')
          : 'Turn on the Screen Time collector in Settings.',
      'cool',
      Platform.OS === 'ios'
        ? false
        : Boolean(todayAggregate && todayAggregate.screenTimeSeconds > 0),
    ),
    metric(
      'mobilityRadius',
      'Mobility Radius',
      formatRadius(mobilityRadius),
      collectors.location.enabled
        ? (signals.locationPermissionStatus === 'granted'
          ? 'Estimated from foreground location samples captured while the app is open.'
          : 'Enable foreground location to estimate mobility radius.')
        : 'Turn on the Location collector in Settings.',
      'human',
      mobilityRadius !== null,
    ),
  ];
}

export function buildLiveSleepEstimate(sleepEvent: ZentraEventRecord | null): SleepEstimate {
  if (!sleepEvent || typeof sleepEvent.valueNumeric !== 'number') {
    return {
      startLabel: '--:--',
      endLabel: '--:--',
      durationLabel: 'Not available',
      confidence: 0,
      available: false,
      detail: 'Sleep windows appear once screen-state and unlock history are available, or when health records are imported.',
    };
  }

  const startDate = new Date(sleepEvent.timestampStart);
  const endDate = new Date(sleepEvent.timestampEnd);

  return {
    startLabel: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(startDate),
    endLabel: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(endDate),
    durationLabel: formatMinutes(Math.round(sleepEvent.valueNumeric)),
    confidence: sleepEvent.confidence,
    available: true,
    detail: sleepEvent.source === 'health_connect'
      ? `Imported from ${
        typeof sleepEvent.metadata.health_platform === 'string'
          ? sleepEvent.metadata.health_platform
          : getHealthPlatformName()
      } history.`
      : 'Inferred from screen-state, unlock, and charging patterns captured locally.',
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
  const diagnosticsByCollector = diagnostics.reduce<Record<string, CollectorDiagnosticRecord>>((result, diagnostic) => {
    result[diagnostic.collectorKey] = diagnostic;
    return result;
  }, {});
  const items: CollectorState[] = [];
  const permissionStatusByCollector = overrides.permissionStatusByCollector ?? {};

  items.push(buildCollectorClone(collectors.steps, {
    permissionStatus: collectors.steps.enabled ? signals.stepPermissionStatus : 'not_requested',
    health: !collectors.steps.enabled
      ? 'idle'
      : diagnosticsByCollector.steps?.status === 'success' || signals.stepCount !== null ? 'healthy' : 'degraded',
    lastRunLabel: collectors.steps.enabled
      ? (diagnosticsByCollector.steps
        ? `${diagnosticsByCollector.steps.message ?? 'Recorded'} · ${formatTimestampLabel(diagnosticsByCollector.steps.recordedAt)}`
        : formatTimestampLabel(signals.stepLastUpdatedAt))
      : 'Off',
  }));

  items.push(buildCollectorClone(collectors.deviceState, {
    permissionStatus: 'granted',
    health: collectors.deviceState.enabled
      ? diagnosticsByCollector.deviceState?.status === 'success' || signals.batterySupported ? 'healthy' : 'degraded'
      : 'idle',
    lastRunLabel: collectors.deviceState.enabled
      ? (diagnosticsByCollector.deviceState
        ? `${diagnosticsByCollector.deviceState.message ?? 'Recorded'} · ${formatTimestampLabel(diagnosticsByCollector.deviceState.recordedAt)}`
        : signals.batteryLastUpdatedAt ? `Battery ${formatBatteryValue(signals.batteryLevel)}` : 'Waiting for battery state')
      : 'Off',
  }));

  items.push(buildCollectorClone(collectors.location, {
    permissionStatus: collectors.location.enabled ? signals.locationPermissionStatus : 'not_requested',
    health: !collectors.location.enabled
      ? 'idle'
      : diagnosticsByCollector.location?.status === 'success' || signals.locationSamples.length > 0 ? 'healthy' : 'degraded',
    lastRunLabel: collectors.location.enabled
      ? (diagnosticsByCollector.location
        ? `${diagnosticsByCollector.location.message ?? 'Recorded'} · ${formatTimestampLabel(diagnosticsByCollector.location.recordedAt)}`
        : signals.locationLastUpdatedAt ? `${signals.locationSamples.length} sample(s)` : 'Waiting for first fix')
      : 'Off',
  }));

  items.push(buildCollectorClone(collectors.ambientLight, {
    permissionStatus: Platform.OS === 'ios' ? 'unsupported' : 'granted',
    health: !collectors.ambientLight.enabled
      ? 'idle'
      : diagnosticsByCollector.ambientLight?.status === 'success' || signals.ambientLightLux !== null ? 'healthy' : 'degraded',
    lastRunLabel: collectors.ambientLight.enabled
      ? (diagnosticsByCollector.ambientLight
        ? `${diagnosticsByCollector.ambientLight.message ?? 'Recorded'} · ${formatTimestampLabel(diagnosticsByCollector.ambientLight.recordedAt)}`
        : Platform.OS === 'ios'
          ? 'Unsupported on iOS'
          : signals.ambientLightLastUpdatedAt ? formatLux(signals.ambientLightLux) : 'Waiting for first light reading')
      : Platform.OS === 'ios' ? 'Unsupported on iOS' : 'Off',
  }));

  items.push(buildCollectorClone(collectors.activity, {
    permissionStatus: collectors.activity.enabled
      ? (permissionStatusByCollector.activity
        ?? deriveDiagnosticPermissionStatus(diagnosticsByCollector.activity, 'not_requested'))
      : 'not_requested',
    health: collectors.activity.enabled
      ? (diagnosticsByCollector.activity?.status === 'success'
        ? 'healthy'
        : (permissionStatusByCollector.activity === 'granted' ? 'idle' : 'degraded'))
      : 'idle',
    lastRunLabel: collectors.activity.enabled
      ? (permissionStatusByCollector.activity === 'granted' && diagnosticsByCollector.activity?.status !== 'success'
        ? 'Waiting for activity updates'
        : diagnosticsByCollector.activity
        ? `${diagnosticsByCollector.activity.message ?? 'Waiting'} · ${formatTimestampLabel(diagnosticsByCollector.activity.recordedAt)}`
        : 'Waiting for activity updates')
      : 'Off',
  }));

  items.push(buildCollectorClone(collectors.appUsage, {
    permissionStatus: Platform.OS === 'ios'
      ? 'unsupported'
      : collectors.appUsage.enabled
        ? deriveDiagnosticPermissionStatus(diagnosticsByCollector.appUsage, 'not_requested')
        : 'not_requested',
    health: collectors.appUsage.enabled
      ? (diagnosticsByCollector.appUsage?.status === 'success' ? 'healthy' : 'degraded')
      : 'idle',
    lastRunLabel: collectors.appUsage.enabled
      ? (diagnosticsByCollector.appUsage
        ? `${diagnosticsByCollector.appUsage.message ?? 'Waiting'} · ${formatTimestampLabel(diagnosticsByCollector.appUsage.recordedAt)}`
        : Platform.OS === 'ios' ? 'Unsupported on iOS' : 'Waiting for usage stats')
      : Platform.OS === 'ios' ? 'Unsupported on iOS' : 'Off',
  }));

  items.push(buildCollectorClone(collectors.healthConnect, {
    permissionStatus: collectors.healthConnect.enabled
      ? (permissionStatusByCollector.healthConnect
        ?? deriveDiagnosticPermissionStatus(diagnosticsByCollector.healthConnect, 'not_requested'))
      : 'not_requested',
    health: collectors.healthConnect.enabled
      ? (diagnosticsByCollector.healthConnect?.status === 'success'
        ? 'healthy'
        : (permissionStatusByCollector.healthConnect === 'granted' ? 'idle' : 'degraded'))
      : 'idle',
    lastRunLabel: collectors.healthConnect.enabled
      ? (permissionStatusByCollector.healthConnect === 'granted' && diagnosticsByCollector.healthConnect?.status !== 'success'
        ? `Waiting for ${getHealthPlatformName()} sync`
        : diagnosticsByCollector.healthConnect
        ? `${diagnosticsByCollector.healthConnect.message ?? 'Waiting'} · ${formatTimestampLabel(diagnosticsByCollector.healthConnect.recordedAt)}`
        : `Waiting for ${getHealthPlatformName()} sync`)
      : 'Off',
  }));

  items.push(buildCollectorClone(collectors.sleep, {
    permissionStatus: collectors.sleep.enabled
      ? deriveDiagnosticPermissionStatus(diagnosticsByCollector.sleep, 'derived')
      : 'not_requested',
    health: collectors.sleep.enabled
      ? (diagnosticsByCollector.sleep?.status === 'success' || overrides.hasLatestSleepEstimate
        ? 'healthy'
        : 'idle')
      : 'idle',
    lastRunLabel: collectors.sleep.enabled
      ? (diagnosticsByCollector.sleep?.status === 'success' || overrides.hasLatestSleepEstimate
        ? (diagnosticsByCollector.sleep
        ? `${diagnosticsByCollector.sleep.message ?? 'Waiting'} · ${formatTimestampLabel(diagnosticsByCollector.sleep.recordedAt)}`
        : 'Sleep estimate available')
        : 'Waiting for sleep inference')
      : 'Off',
  }));

  return items;
}

export function formatBatteryStateLabel(state: Battery.BatteryState | null): string | null {
  switch (state) {
    case Battery.BatteryState.CHARGING:
      return 'Charging';
    case Battery.BatteryState.FULL:
      return 'Full';
    case Battery.BatteryState.UNPLUGGED:
      return 'Unplugged';
    case Battery.BatteryState.UNKNOWN:
      return 'Unknown';
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
    unit: 'count',
    confidence: 1,
    metadata: {},
    schemaVersion: 1,
    createdAt: now,
  };
}

export function buildRealExportEvents(signals: SignalStoreState): Record<string, ZentraEventRecord[]> {
  const events: Record<string, ZentraEventRecord[]> = {};

  if (signals.stepCount !== null) {
    events.steps = [
      {
        ...baseEvent('steps-current', 'steps', 'sensor'),
        valueNumeric: signals.stepCount,
        unit: 'count',
        metadata: { session_based: true },
      },
    ];
  }

  if (signals.locationSamples.length) {
    events.location = signals.locationSamples.map((sample, index) => ({
      ...baseEvent(`location-${index}`, 'location', 'sensor'),
      timestampStart: sample.timestamp,
      timestampEnd: sample.timestamp,
      valueJson: JSON.stringify({
        latitude: sample.latitude,
        longitude: sample.longitude,
      }),
      unit: 'coordinate',
    }));
  }

  if (signals.batteryLevel !== null || signals.batteryStateLabel) {
    events.charging_state = [
      {
        ...baseEvent('device-state-current', 'charging_state', 'system_broadcast'),
        valueNumeric: signals.batteryLevel ?? undefined,
        valueText: signals.batteryStateLabel ?? undefined,
        unit: 'fraction',
        metadata: {
          low_power_mode: Boolean(signals.lowPowerMode),
        },
      },
    ];
  }

  if (signals.ambientLightLux !== null) {
    events.ambient_light = [
      {
        ...baseEvent('ambient-light-current', 'ambient_light', 'sensor'),
        valueNumeric: signals.ambientLightLux,
        unit: 'lux',
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

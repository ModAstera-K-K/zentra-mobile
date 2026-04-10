import { Platform } from 'react-native';

import type {
  CollectorState,
  DashboardMetric,
  DailyAggregateRecord,
  EventDataType,
  HeatmapCell,
  MetricTone,
  TodayLiveSnapshot,
  ZentraEventRecord,
} from '@/types/zentra';
import { formatMinutes, formatNumber, formatPercent } from '@/utils/format';
import { getActivitySourceLabel, getHealthPlatformName } from '@/utils/platform-capabilities';

const CORE_SIGNAL_TYPES: EventDataType[] = [
  'steps',
  'activity',
  'app_usage',
  'charging_state',
  'location',
  'sleep_inferred',
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
}

export interface TodayDetailBar {
  label: string;
  value: number;
  valueLabel: string;
}

export type TodayDetailVisual =
  | {
    type: 'line';
    annotation: string;
    points: TodayDetailChartPoint[];
  }
  | {
    type: 'distribution';
    annotation: string;
    bars: TodayDetailBar[];
  }
  | {
    type: 'heatmap';
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
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatDateTimeLabel(timestamp: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]/g, ' ')
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
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;

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
    return 'Unknown';
  }

  const packageTail = normalized.split('.').at(-1) ?? normalized;
  return titleCase(packageTail);
}

function getMetricEventTypes(key: string): EventDataType[] {
  switch (key) {
    case 'steps':
      return ['steps'];
    case 'activeMinutes':
    case 'topActivity':
      return ['activity'];
    case 'screenTime':
      return ['app_usage', 'screen_state', 'unlock_event'];
    case 'mobilityRadius':
    case 'distanceMeters':
      return ['location'];
    case 'unlockCount':
      return ['unlock_event'];
    case 'dataCompleteness':
      return CORE_SIGNAL_TYPES;
    case 'deviceContext':
      return ['charging_state'];
    default:
      return [];
  }
}

function getMetricSourceLabel(key: string): string {
  switch (key) {
    case 'steps':
      return 'Phone sensor';
    case 'activeMinutes':
    case 'topActivity':
      return getActivitySourceLabel();
    case 'screenTime':
    case 'unlockCount':
      return Platform.OS === 'ios' ? 'Unsupported on iOS' : 'Android Usage Access';
    case 'mobilityRadius':
    case 'distanceMeters':
      return 'Foreground location';
    case 'dataCompleteness':
      return 'Repository aggregate';
    case 'deviceContext':
      return 'Battery monitoring';
    default:
      return 'On-device repository';
  }
}

function getEventTone(event: ZentraEventRecord): MetricTone {
  switch (event.dataType) {
    case 'steps':
      return 'hero';
    case 'activity':
      return 'physical';
    case 'location':
    case 'sleep_inferred':
    case 'exercise_session':
      return 'human';
    default:
      return 'cool';
  }
}

function getSourceLabel(event: ZentraEventRecord): string {
  switch (event.source) {
    case 'sensor':
      return 'Phone sensor';
    case 'activity_recognition':
      return getActivitySourceLabel();
    case 'usage_stats':
      return 'Android Usage Access';
    case 'system_broadcast':
      return 'System state';
    case 'health_connect':
      return getHealthPlatformName();
    case 'inferred':
      return 'Local inference';
    default:
      return 'On-device repository';
  }
}

function parseLocationPayload(valueJson?: string): LocationPayload | null {
  if (!valueJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(valueJson) as Partial<LocationPayload>;
    if (typeof parsed.latitude !== 'number' || typeof parsed.longitude !== 'number') {
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
    return 'Foreground sample';
  }

  return `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`;
}

function formatEventValue(event: ZentraEventRecord): string {
  switch (event.dataType) {
    case 'steps':
      return typeof event.valueNumeric === 'number' ? formatNumber(Math.round(event.valueNumeric)) : 'Step reading';
    case 'activity':
      return event.valueText ? titleCase(event.valueText) : 'Activity';
    case 'location':
      return parseLocationLabel(event.valueJson);
    case 'app_usage':
      return typeof event.valueNumeric === 'number'
        ? formatMinutes(Math.max(1, Math.round(event.valueNumeric / 60)))
        : 'App session';
    case 'unlock_event':
      return 'Unlocked';
    case 'charging_state':
      if (typeof event.valueNumeric === 'number') {
        const batteryLabel = formatBatteryPercent(event.valueNumeric);
        return event.valueText ? `${batteryLabel} · ${event.valueText}` : batteryLabel;
      }

      return event.valueText ?? 'Battery state';
    case 'sleep_inferred':
      return typeof event.valueNumeric === 'number'
        ? formatMinutes(Math.round(event.valueNumeric))
        : 'Sleep window';
    case 'heart_rate':
      return typeof event.valueNumeric === 'number' ? `${Math.round(event.valueNumeric)} bpm` : 'Heart rate';
    case 'exercise_session':
      return event.valueText ? titleCase(event.valueText) : 'Workout';
    case 'ambient_light':
      return typeof event.valueNumeric === 'number' ? `${Math.round(event.valueNumeric)} lux` : 'Ambient light';
    case 'screen_state':
      return event.valueText ? titleCase(event.valueText) : 'Screen state';
    default:
      return event.valueText ?? 'Reading';
  }
}

function formatEventTitle(event: ZentraEventRecord): string {
  switch (event.dataType) {
    case 'steps':
      return 'Step reading';
    case 'activity':
      return event.valueText ? `${titleCase(event.valueText)} transition` : 'Activity transition';
    case 'location':
      return 'Location sample';
    case 'app_usage':
      return 'App session';
    case 'unlock_event':
      return 'Unlock event';
    case 'charging_state':
      return 'Battery state';
    case 'sleep_inferred':
      return 'Sleep window';
    case 'heart_rate':
      return 'Heart rate';
    case 'exercise_session':
      return 'Exercise session';
    case 'ambient_light':
      return 'Ambient light';
    case 'screen_state':
      return 'Screen state';
    default:
      return titleCase(event.dataType);
  }
}

function formatEventDetail(event: ZentraEventRecord): string {
  switch (event.dataType) {
    case 'activity':
      return event.valueText === 'still'
        ? 'Stillness transition captured from motion activity.'
        : 'Movement transition captured from motion activity.';
    case 'app_usage':
      return event.valueText
        ? `Foreground session for ${event.valueText}.`
        : 'Foreground app session recorded from usage history.';
    case 'unlock_event':
      return 'Unlock event stored from usage history.';
    case 'charging_state':
      return 'Battery and charging snapshot stored from system state.';
    case 'location':
      return 'Foreground location sample stored while the app was active.';
    case 'sleep_inferred':
      return event.source === 'health_connect'
        ? `Imported from ${getHealthPlatformName()}.`
        : 'Inferred from local screen, unlock, and charging patterns.';
    case 'screen_state':
      return 'Interactive state stored from usage history.';
    default:
      return `${getSourceLabel(event)} reading stored locally.`;
  }
}

function sortEventsDescending(events: ZentraEventRecord[]): ZentraEventRecord[] {
  return events
    .slice()
    .sort((left, right) => right.timestampStart.localeCompare(left.timestampStart));
}

function sortEventsAscending(events: ZentraEventRecord[]): ZentraEventRecord[] {
  return events
    .slice()
    .sort((left, right) => left.timestampStart.localeCompare(right.timestampStart));
}

function getRelatedEvents(events: ZentraEventRecord[], metricKey: string): ZentraEventRecord[] {
  const eventTypes = new Set(getMetricEventTypes(metricKey));
  return sortEventsDescending(events.filter((event) => eventTypes.has(event.dataType)));
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
  if (typeof todaySnapshot.batteryLevel === 'number') {
    const levelLabel = formatBatteryPercent(todaySnapshot.batteryLevel);
    return todaySnapshot.batteryStateLabel ? `${levelLabel} · ${todaySnapshot.batteryStateLabel}` : levelLabel;
  }

  if (todaySnapshot.batteryStateLabel) {
    return todaySnapshot.batteryStateLabel;
  }

  return 'Waiting';
}

function countActivityTypes(events: ZentraEventRecord[]): Map<string, number> {
  return events.reduce<Map<string, number>>((result, event) => {
    if (event.dataType !== 'activity') {
      return result;
    }

    const label = event.valueText ? titleCase(event.valueText) : 'Unknown';
    result.set(label, (result.get(label) ?? 0) + 1);
    return result;
  }, new Map<string, number>());
}

function buildStepsVisual(events: ZentraEventRecord[]): TodayDetailVisual | null {
  const points = sortEventsAscending(events)
    .filter((event) => typeof event.valueNumeric === 'number')
    .map((event) => ({
      label: formatTimestampLabel(event.timestampStart),
      value: clampPositive(Math.round(event.valueNumeric ?? 0)),
      valueLabel: formatNumber(Math.round(event.valueNumeric ?? 0)),
    }));

  if (!points.length) {
    return null;
  }

  return {
    type: 'line',
    annotation: 'Step readings across the current day.',
    points,
  };
}

function buildActiveMinutesVisual(events: ZentraEventRecord[]): TodayDetailVisual | null {
  let activeCount = 0;
  const points = sortEventsAscending(events)
    .filter((event) => event.dataType === 'activity')
    .map((event) => {
      if (event.valueText !== 'still') {
        activeCount += 1;
      }

      return {
        label: formatTimestampLabel(event.timestampStart),
        value: activeCount,
        valueLabel: `${activeCount} min`,
      };
    });

  if (!points.length) {
    return null;
  }

  return {
    type: 'line',
    annotation: 'Running total of captured movement transitions.',
    points,
  };
}

function buildUnlockVisual(events: ZentraEventRecord[]): TodayDetailVisual | null {
  let unlockCount = 0;
  const points = sortEventsAscending(events)
    .filter((event) => event.dataType === 'unlock_event')
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
    type: 'line',
    annotation: 'Unlock count accumulated through the day.',
    points,
  };
}

function buildBatteryVisual(events: ZentraEventRecord[]): TodayDetailVisual | null {
  const points = sortEventsAscending(events)
    .filter((event) => event.dataType === 'charging_state' && typeof event.valueNumeric === 'number')
    .map((event) => ({
      label: formatTimestampLabel(event.timestampStart),
      value: clampPositive(Math.round((event.valueNumeric ?? 0) * 100)),
      valueLabel: formatBatteryPercent(event.valueNumeric ?? 0),
    }));

  if (!points.length) {
    return null;
  }

  return {
    type: 'line',
    annotation: 'Battery level snapshots captured by the device-state collector.',
    points,
  };
}

function buildLocationRadiusVisual(events: ZentraEventRecord[]): TodayDetailVisual | null {
  const locationEvents = sortEventsAscending(events)
    .filter((event) => event.dataType === 'location');
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
    type: 'line',
    annotation: 'Distance from the first recorded location sample.',
    points,
  };
}

function buildTopActivityVisual(events: ZentraEventRecord[]): TodayDetailVisual | null {
  const counts = Array.from(countActivityTypes(events).entries())
    .sort((left, right) => right[1] - left[1])
    .map(([label, value]) => ({
      label,
      value,
      valueLabel: formatNumber(value),
    }));

  if (!counts.length) {
    return null;
  }

  return {
    type: 'distribution',
    annotation: 'Most common activity transitions captured today.',
    bars: counts,
  };
}

function buildCompletenessVisual(events: ZentraEventRecord[]): TodayDetailVisual | null {
  const eventCounts = CORE_SIGNAL_TYPES.map((type) => ({
    label: titleCase(type),
    value: events.filter((event) => event.dataType === type).length,
  }));

  if (!eventCounts.some((entry) => entry.value > 0)) {
    return null;
  }

  return {
    type: 'distribution',
    annotation: 'Coverage across the core signal families tracked today.',
    bars: eventCounts.map((entry) => ({
      label: entry.label,
      value: entry.value,
      valueLabel: formatNumber(entry.value),
    })),
  };
}

function buildScreenTimeVisual(events: ZentraEventRecord[]): TodayDetailVisual | null {
  const durationsByApp = events.reduce<Map<string, number>>((result, event) => {
    if (event.dataType !== 'app_usage' || typeof event.valueNumeric !== 'number') {
      return result;
    }

    const rawLabel = typeof event.valueText === 'string' && event.valueText
      ? event.valueText
      : typeof event.metadata.topPackage === 'string'
        ? event.metadata.topPackage
        : 'unknown';
    const label = formatAppLabel(rawLabel);
    result.set(label, (result.get(label) ?? 0) + event.valueNumeric);
    return result;
  }, new Map<string, number>());

  const rankedApps = Array.from(durationsByApp.entries())
    .sort((left, right) => right[1] - left[1]);

  if (!rankedApps.length) {
    return null;
  }

  const topApps = rankedApps.slice(0, SCREEN_TIME_TOP_APP_COUNT)
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
      label: 'Other',
      value: otherValue,
      valueLabel: formatMinutes(Math.max(1, Math.round(otherValue / 60))),
    });
  }

  return {
    type: 'distribution',
    annotation: 'Foreground app usage ranked from highest duration to lowest.',
    bars: topApps,
  };
}

function buildSleepVisual(events: ZentraEventRecord[]): TodayDetailVisual | null {
  const points = sortEventsAscending(events)
    .filter((event) => typeof event.valueNumeric === 'number')
    .map((event) => ({
      label: formatDateTimeLabel(event.timestampStart),
      value: Math.round(event.valueNumeric ?? 0),
      valueLabel: formatMinutes(Math.round(event.valueNumeric ?? 0)),
    }));

  if (!points.length) {
    return null;
  }

  return {
    type: 'line',
    annotation: 'Sleep duration records available in local history.',
    points,
  };
}

function buildHeartRateVisual(events: ZentraEventRecord[]): TodayDetailVisual | null {
  const points = sortEventsAscending(events)
    .filter((event) => event.dataType === 'heart_rate' && typeof event.valueNumeric === 'number')
    .map((event) => ({
      label: formatTimestampLabel(event.timestampStart),
      value: Math.round(event.valueNumeric ?? 0),
      valueLabel: `${Math.round(event.valueNumeric ?? 0)} bpm`,
    }));

  if (!points.length) {
    return null;
  }

  return {
    type: 'line',
    annotation: 'Heart-rate history rendered from imported health records.',
    points,
  };
}

function buildExerciseVisual(events: ZentraEventRecord[]): TodayDetailVisual | null {
  const bars = sortEventsDescending(events)
    .filter((event) => event.dataType === 'exercise_session')
    .map((event) => ({
      label: event.valueText ? titleCase(event.valueText) : 'Exercise',
      value: clampPositive(Math.round(event.valueNumeric ?? 0)),
      valueLabel: typeof event.valueNumeric === 'number'
        ? formatMinutes(Math.round(event.valueNumeric))
        : formatDateTimeLabel(event.timestampStart),
    }));

  if (!bars.length) {
    return null;
  }

  return {
    type: 'distribution',
    annotation: 'Imported exercise sessions currently available in local history.',
    bars,
  };
}

function buildVisualForMetric(metricKey: string, events: ZentraEventRecord[]): TodayDetailVisual | null {
  switch (metricKey) {
    case 'steps':
      return buildStepsVisual(events);
    case 'activeMinutes':
      return buildActiveMinutesVisual(events);
    case 'screenTime':
      return buildScreenTimeVisual(events);
    case 'unlockCount':
      return buildUnlockVisual(events);
    case 'mobilityRadius':
    case 'distanceMeters':
      return buildLocationRadiusVisual(events);
    case 'topActivity':
      return buildTopActivityVisual(events);
    case 'dataCompleteness':
      return buildCompletenessVisual(events);
    case 'deviceContext':
      return buildBatteryVisual(events);
    default:
      return null;
  }
}

function buildVisualForEventType(eventType: EventDataType, events: ZentraEventRecord[]): TodayDetailVisual | null {
  switch (eventType) {
    case 'steps':
      return buildStepsVisual(events);
    case 'activity':
      return buildTopActivityVisual(events);
    case 'app_usage':
      return buildScreenTimeVisual(events);
    case 'unlock_event':
      return buildUnlockVisual(events);
    case 'charging_state':
      return buildBatteryVisual(events);
    case 'location':
      return buildLocationRadiusVisual(events);
    case 'sleep_inferred':
      return buildSleepVisual(events);
    case 'heart_rate':
      return buildHeartRateVisual(events);
    case 'exercise_session':
      return buildExerciseVisual(events);
    default:
      return null;
  }
}

function buildMetricFacts(metric: MetricLike, context: TodayVisualizationContext): TodayDetailFact[] {
  const relatedEvents = getRelatedEvents(context.todayEvents, metric.key);
  const latestEvent = relatedEvents[0];

  switch (metric.key) {
    case 'steps':
      return [
        { label: 'Source', value: getMetricSourceLabel(metric.key) },
        { label: 'Last update', value: context.todaySnapshot.stepLastUpdatedAt ? formatDateTimeLabel(context.todaySnapshot.stepLastUpdatedAt) : 'Waiting for first reading' },
        { label: 'Samples', value: formatNumber(relatedEvents.length) },
      ];
    case 'activeMinutes':
      return [
        { label: 'Source', value: getMetricSourceLabel(metric.key) },
        { label: 'Top activity', value: context.todayAggregate?.topActivity ? titleCase(context.todayAggregate.topActivity) : 'No dominant pattern yet' },
        { label: 'Transitions', value: formatNumber(relatedEvents.length) },
      ];
    case 'screenTime':
      return [
        { label: 'Source', value: getMetricSourceLabel(metric.key) },
        { label: 'Unlocks', value: formatNumber(context.todayAggregate?.unlockCount ?? context.todayEvents.filter((event) => event.dataType === 'unlock_event').length) },
        { label: 'App rows', value: formatNumber(relatedEvents.filter((event) => event.dataType === 'app_usage').length) },
      ];
    case 'mobilityRadius':
      return [
        { label: 'Source', value: getMetricSourceLabel(metric.key) },
        { label: 'Location samples', value: formatNumber(relatedEvents.length) },
        { label: 'Last sample', value: context.todaySnapshot.locationLastUpdatedAt ? formatDateTimeLabel(context.todaySnapshot.locationLastUpdatedAt) : 'No sample yet' },
      ];
    case 'unlockCount':
      return [
        { label: 'Source', value: getMetricSourceLabel(metric.key) },
        { label: 'Latest unlock', value: latestEvent ? formatDateTimeLabel(latestEvent.timestampStart) : 'No unlock events today' },
        { label: 'Events stored', value: formatNumber(relatedEvents.length) },
      ];
    case 'topActivity':
      return [
        { label: 'Source', value: getMetricSourceLabel(metric.key) },
        { label: 'Captured transitions', value: formatNumber(relatedEvents.length) },
        { label: 'Latest transition', value: latestEvent ? formatDateTimeLabel(latestEvent.timestampStart) : 'No transitions captured' },
      ];
    case 'dataCompleteness':
      return [
        { label: 'Source', value: getMetricSourceLabel(metric.key) },
        { label: 'Coverage', value: `${getCoverageCount(context.todayEvents)} of ${CORE_SIGNAL_TYPES.length} core signals` },
        { label: 'Aggregate', value: context.todayAggregate ? formatDateTimeLabel(context.todayAggregate.computedAt) : 'Waiting for aggregate' },
      ];
    case 'deviceContext':
      return [
        { label: 'Source', value: getMetricSourceLabel(metric.key) },
        { label: 'Battery', value: buildDeviceContextValue(context.todaySnapshot) },
        { label: 'Low power', value: context.todaySnapshot.lowPowerMode ? 'On' : 'Off' },
      ];
    default:
      return [
        { label: 'Source', value: getMetricSourceLabel(metric.key) },
        { label: 'Latest reading', value: latestEvent ? formatDateTimeLabel(latestEvent.timestampStart) : 'No reading yet' },
      ];
  }
}

function buildMetricMeta(metric: MetricLike, context: TodayVisualizationContext): string {
  const relatedEvents = getRelatedEvents(context.todayEvents, metric.key);
  if (relatedEvents.length) {
    return `${relatedEvents.length} related reading${relatedEvents.length === 1 ? '' : 's'} stored today`;
  }

  return metric.available ? 'No raw rows surfaced for this metric yet' : 'This metric is still waiting for usable data';
}

export function buildTodaySecondaryMetrics(
  todayAggregate: DailyAggregateRecord | null,
  todaySnapshot: TodayLiveSnapshot,
  todayEvents: ZentraEventRecord[],
): TodaySummaryMetric[] {
  const unlockCount = todayAggregate?.unlockCount ?? todayEvents.filter((event) => event.dataType === 'unlock_event').length;
  const topActivity = todayAggregate?.topActivity ? titleCase(todayAggregate.topActivity) : 'Waiting';
  const completenessValue = todayAggregate?.dataCompleteness ?? (
    todayEvents.length ? getCoverageCount(todayEvents) / CORE_SIGNAL_TYPES.length : 0
  );

  return [
    {
      key: 'unlockCount',
      label: 'Unlock Count',
      value: formatNumber(unlockCount),
      detail: Platform.OS === 'ios'
        ? 'Unlock history stays unavailable on iOS.'
        : 'Usage Access rows captured from Android unlock history.',
      tone: 'cool',
      available: Platform.OS !== 'ios' && unlockCount > 0,
    },
    {
      key: 'topActivity',
      label: 'Top Activity',
      value: topActivity,
      detail: todayAggregate?.topActivity
        ? 'Most frequent motion transition captured so far today.'
        : 'No dominant movement pattern has surfaced yet.',
      tone: 'physical',
      available: Boolean(todayAggregate?.topActivity),
    },
    {
      key: 'dataCompleteness',
      label: 'Completeness',
      value: formatPercent(completenessValue * 100),
      detail: `${getCoverageCount(todayEvents)} of ${CORE_SIGNAL_TYPES.length} core signals have surfaced today.`,
      tone: 'hero',
      available: completenessValue > 0,
    },
    {
      key: 'deviceContext',
      label: 'Device Context',
      value: buildDeviceContextValue(todaySnapshot),
      detail: todaySnapshot.lowPowerMode
        ? 'Battery snapshot includes low-power mode.'
        : 'Battery state stays visible even when other collectors are quiet.',
      tone: 'human',
      available: Boolean(todaySnapshot.batteryStateLabel) || typeof todaySnapshot.batteryLevel === 'number',
    },
  ];
}

export function buildTodayMetricDetailPayload(
  metric: MetricLike,
  context: TodayVisualizationContext,
): TodayDetailPayload {
  const relatedEvents = getRelatedEvents(context.todayEvents, metric.key);

  return {
    key: metric.key,
    eyebrow: 'Today detail',
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

export function buildRecentSignalRows(todayEvents: ZentraEventRecord[]): TodayRecentSignalRow[] {
  return sortEventsDescending(todayEvents)
    .slice(0, RECENT_SIGNAL_LIMIT)
    .map((event) => ({
      id: event.id,
      title: formatEventTitle(event),
      value: formatEventValue(event),
      detail: formatEventDetail(event),
      timestampLabel: formatTimestampLabel(event.timestampStart),
      sourceLabel: getSourceLabel(event),
      tone: getEventTone(event),
      event,
    }));
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
    eyebrow: 'Recent signal',
    title: formatEventTitle(event),
    value: formatEventValue(event),
    summary: formatEventDetail(event),
    tone: getEventTone(event),
    meta: `Stored from ${getSourceLabel(event)} at ${formatDateTimeLabel(event.timestampStart)}`,
    visual: buildVisualForEventType(event.dataType, relatedEvents),
    facts: [
      { label: 'Source', value: getSourceLabel(event) },
      { label: 'Captured', value: formatDateTimeLabel(event.timestampStart) },
      { label: 'Confidence', value: formatPercent(event.confidence * 100) },
      ...metadataFacts,
    ],
    rows: buildRecentRows(relatedEvents.filter((candidate) => candidate.id !== event.id)),
  };
}

export function buildSignalHealthSummary(
  todayAggregate: DailyAggregateRecord | null,
  collectors: CollectorState[],
  todayEvents: ZentraEventRecord[],
): TodaySignalHealthSummary {
  const coverageCount = getCoverageCount(todayEvents);
  const completeness = todayAggregate?.dataCompleteness ?? (
    todayEvents.length ? coverageCount / CORE_SIGNAL_TYPES.length : 0
  );
  const healthyCount = collectors.filter((collector) => collector.health === 'healthy').length;
  const degradedCount = collectors.filter((collector) => collector.health === 'degraded').length;

  return {
    valueLabel: formatPercent(completeness * 100),
    coverageLabel: `${coverageCount} of ${CORE_SIGNAL_TYPES.length} core signals seen today`,
    detail: collectors.length
      ? `${healthyCount} healthy · ${degradedCount} degraded · ${collectors.length} active collectors`
      : 'No active collectors yet',
  };
}

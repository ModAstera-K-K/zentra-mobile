export type ThemePreference = "system" | "light" | "dark" | "sunrise";

export type CollectorKey =
  | "steps"
  | "activity"
  | "appUsage"
  | "deviceState"
  | "healthConnect"
  | "location"
  | "sleep"
  | "ambientLight";

export type PermissionStatus =
  | "granted"
  | "not_requested"
  | "blocked"
  | "derived"
  | "unsupported";
export type CollectorHealth = "healthy" | "degraded" | "idle";
export type MetricTone = "hero" | "physical" | "human" | "cool";
export type TrendRange = "7d" | "30d" | "90d" | "custom";
export type ExportFormat = "csv" | "json";
export type ExportPreset = "today" | "week" | "month" | "all" | "custom";
export type UnifiedTimelineResolution = "minute" | "15min" | "hour";
export type ActivityPatternGranularity = "day" | "month" | "year";
export type DataMode = "live" | "demo";
export type LocationRetentionPreference = "24h" | "30d";
export type EventDataType =
  | "steps"
  | "distance"
  | "activity"
  | "location"
  | "screen_state"
  | "app_usage"
  | "unlock_event"
  | "charging_state"
  | "sleep_inferred"
  | "heart_rate"
  | "exercise_session"
  | "ambient_light";
export type EventSource =
  | "sensor"
  | "health_connect"
  | "activity_recognition"
  | "usage_stats"
  | "system_broadcast"
  | "inferred";

export interface CollectorState {
  key: CollectorKey;
  label: string;
  description: string;
  permissionLabel: string;
  enabled: boolean;
  permissionStatus: PermissionStatus;
  health: CollectorHealth;
  lastRunLabel: string;
  sourceLabel: string;
}

export interface DashboardMetric {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: MetricTone;
  available: boolean;
}

export interface ActivityHour {
  hour: string;
  label: string;
  intensity: number;
  kind: "rest" | "movement" | "screen";
  movementIntensity: number;
  restIntensity: number;
  screenIntensity: number;
}

export interface SleepEstimate {
  startLabel: string;
  endLabel: string;
  durationLabel: string;
  confidence: number;
  available: boolean;
  detail: string;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface TrendSeries {
  key: string;
  label: string;
  unit: string;
  tone: MetricTone;
  points: TrendPoint[];
  change: number;
  variability: number;
}

export interface HeatmapCell {
  dayLabel: string;
  hourLabel: string;
  value: number;
}

export interface DateRangeSelection {
  preset: ExportPreset;
  start: string;
  end: string;
}

export interface UnifiedTimelineWindow {
  endTimestamp: string;
  resolution: UnifiedTimelineResolution;
  startTimestamp: string;
}

export interface UnifiedTimelineBucket {
  activityEvents: number;
  ambientLightAverageLux: number | null;
  batteryLevel: number | null;
  chargingStateLabel: string | null;
  dataCompleteness: number;
  dataTypeCoverage: Partial<Record<EventDataType, number>>;
  dominantKind: "rest" | "movement" | "screen";
  exerciseSeconds: number;
  hasAnyData: boolean;
  heartRateAverageBpm: number | null;
  label: string;
  locationSamples: number;
  movementScore: number;
  resolution: UnifiedTimelineResolution;
  restScore: number;
  screenScore: number;
  screenTimeSeconds: number;
  sleepMinutes: number;
  sourceCoverage: Partial<Record<EventSource, number>>;
  steps: number;
  timestampEnd: string;
  timestampStart: string;
  unlockCount: number;
}

export interface ActivityPatternCell {
  detailLabel: string;
  dominantKind: "rest" | "movement" | "screen";
  endTimestamp: string;
  granularity: ActivityPatternGranularity;
  hasAnyData: boolean;
  id: string;
  intensity: number;
  label: string;
  movementScore: number;
  placeholder?: boolean;
  restScore: number;
  screenScore: number;
  startTimestamp: string;
}

export interface ZentraEventRecord {
  id: string;
  timestampStart: string;
  timestampEnd: string;
  dataType: EventDataType;
  source: EventSource;
  valueNumeric?: number;
  valueText?: string;
  valueJson?: string;
  unit: string;
  confidence: number;
  metadata: Record<string, boolean | number | string>;
  schemaVersion: number;
  createdAt: string;
}

export interface DailyAggregateRecord {
  date: string;
  stepsTotal: number;
  activeMinutes: number;
  distanceMeters: number;
  screenTimeSeconds: number;
  unlockCount: number;
  sleepEstimateMinutes: number | null;
  mobilityRadiusMeters: number | null;
  topActivity: string | null;
  dataCompleteness: number;
  computedAt: string;
}

export interface LocationSample {
  latitude: number;
  longitude: number;
  timestamp: string;
}

export interface TodayLiveSnapshot {
  stepCount: number | null;
  stepLastUpdatedAt: string | null;
  batteryLevel: number | null;
  batteryStateLabel: string | null;
  lowPowerMode: boolean | null;
  batteryLastUpdatedAt: string | null;
  locationSamples: LocationSample[];
  locationLastUpdatedAt: string | null;
}

export interface CollectorDiagnosticRecord {
  id: string;
  collectorKey: CollectorKey;
  status: "success" | "failure";
  message: string | null;
  eventCount: number;
  consecutiveFailures: number;
  recordedAt: string;
}

export interface SignalStoreState {
  isHydrated: boolean;
  stepCount: number | null;
  stepSupported: boolean | null;
  stepPermissionStatus: PermissionStatus;
  stepLastUpdatedAt: string | null;
  batterySupported: boolean | null;
  batteryLevel: number | null;
  batteryStateLabel: string | null;
  lowPowerMode: boolean | null;
  batteryLastUpdatedAt: string | null;
  locationSupported: boolean | null;
  locationPermissionStatus: PermissionStatus;
  locationServicesEnabled: boolean | null;
  locationSamples: LocationSample[];
  locationLastUpdatedAt: string | null;
  ambientLightSupported: boolean | null;
  ambientLightLux: number | null;
  ambientLightLastUpdatedAt: string | null;
}

export interface LiveDashboardMetric extends DashboardMetric {
  supportingText?: string;
}

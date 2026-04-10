import type { EventDataType } from '@/types/zentra';

export type VisualizationSurface = 'today' | 'trends' | 'detail' | 'settings';
export type VisualizationGroup =
  | 'movement'
  | 'device_behavior'
  | 'rest'
  | 'health_imports'
  | 'signal_health'
  | 'device_context';
export type VisualizationInteraction =
  | 'tap_card'
  | 'tap_event_row'
  | 'tap_series'
  | 'scrub_series'
  | 'toggle_mode';
export type VisualizationPhaseOneVisibility = 'ship_now' | 'ship_now_with_guardrails' | 'defer';

export interface VisualizationFieldDefinition {
  key: string;
  label: string;
  kind: 'aggregate' | 'event' | 'snapshot' | 'diagnostic' | 'summary';
  sourceKeys: readonly string[];
  primaryGroup: VisualizationGroup;
  surfaces: readonly VisualizationSurface[];
  interactions: readonly VisualizationInteraction[];
  phaseOneVisibility: VisualizationPhaseOneVisibility;
  description: string;
  rationale: string;
}

function field(definition: VisualizationFieldDefinition): VisualizationFieldDefinition {
  return definition;
}

const EVENT_FIELD_KEYS: readonly EventDataType[] = [
  'steps',
  'distance',
  'activity',
  'location',
  'screen_state',
  'app_usage',
  'unlock_event',
  'charging_state',
  'sleep_inferred',
  'heart_rate',
  'exercise_session',
  'ambient_light',
];

const VISUALIZATION_INVENTORY: readonly VisualizationFieldDefinition[] = [
  field({
    key: 'steps',
    label: 'Steps',
    kind: 'aggregate',
    sourceKeys: ['TodayLiveSnapshot.stepCount', 'DailyAggregateRecord.stepsTotal', 'steps'],
    primaryGroup: 'movement',
    surfaces: ['today', 'trends', 'detail'],
    interactions: ['tap_card', 'tap_series'],
    phaseOneVisibility: 'ship_now',
    description: 'Core movement signal from pedometer snapshots and daily totals.',
    rationale: 'Already visible and reliable; should become a richer interactive detail surface.',
  }),
  field({
    key: 'activeMinutes',
    label: 'Active Minutes',
    kind: 'aggregate',
    sourceKeys: ['DailyAggregateRecord.activeMinutes', 'activity'],
    primaryGroup: 'movement',
    surfaces: ['today', 'trends', 'detail'],
    interactions: ['tap_card', 'tap_series', 'toggle_mode'],
    phaseOneVisibility: 'ship_now',
    description: 'Daily movement activity derived from stored activity transitions.',
    rationale: 'Already rendered and backed by repository aggregates; good candidate for drill-down.',
  }),
  field({
    key: 'screenTime',
    label: 'Screen Time',
    kind: 'aggregate',
    sourceKeys: ['DailyAggregateRecord.screenTimeSeconds', 'app_usage'],
    primaryGroup: 'device_behavior',
    surfaces: ['today', 'trends', 'detail'],
    interactions: ['tap_card', 'tap_series'],
    phaseOneVisibility: 'ship_now_with_guardrails',
    description: 'Device usage duration derived from app session history.',
    rationale: 'Renderable now, but platform support is limited and copy must stay honest on iOS.',
  }),
  field({
    key: 'unlockCount',
    label: 'Unlock Count',
    kind: 'aggregate',
    sourceKeys: ['DailyAggregateRecord.unlockCount', 'unlock_event'],
    primaryGroup: 'device_behavior',
    surfaces: ['today', 'trends', 'detail'],
    interactions: ['tap_card', 'tap_series'],
    phaseOneVisibility: 'ship_now',
    description: 'Count of unlock-adjacent device events already stored in aggregates.',
    rationale: 'Already computed but invisible; phase-one should expose it.',
  }),
  field({
    key: 'mobilityRadius',
    label: 'Mobility Radius',
    kind: 'aggregate',
    sourceKeys: ['DailyAggregateRecord.mobilityRadiusMeters', 'TodayLiveSnapshot.locationSamples', 'location'],
    primaryGroup: 'movement',
    surfaces: ['today', 'trends', 'detail'],
    interactions: ['tap_card', 'tap_series'],
    phaseOneVisibility: 'ship_now',
    description: 'Estimated daily movement range derived from location history.',
    rationale: 'Already rendered today and trended historically; detail view can show provenance.',
  }),
  field({
    key: 'topActivity',
    label: 'Top Activity',
    kind: 'aggregate',
    sourceKeys: ['DailyAggregateRecord.topActivity', 'activity'],
    primaryGroup: 'movement',
    surfaces: ['today', 'detail'],
    interactions: ['tap_card'],
    phaseOneVisibility: 'ship_now',
    description: 'Most common recorded activity label for the day.',
    rationale: 'Computed already and useful as a compact secondary metric.',
  }),
  field({
    key: 'dataCompleteness',
    label: 'Data Completeness',
    kind: 'aggregate',
    sourceKeys: ['DailyAggregateRecord.dataCompleteness', 'CollectorDiagnosticRecord'],
    primaryGroup: 'signal_health',
    surfaces: ['today', 'trends', 'settings', 'detail'],
    interactions: ['tap_card', 'tap_series'],
    phaseOneVisibility: 'ship_now',
    description: 'Coverage estimate for expected event families already present in aggregates.',
    rationale: 'Already computed and central to trust; should become a first-class visualization.',
  }),
  field({
    key: 'batteryContext',
    label: 'Battery Context',
    kind: 'snapshot',
    sourceKeys: [
      'TodayLiveSnapshot.batteryLevel',
      'TodayLiveSnapshot.batteryStateLabel',
      'TodayLiveSnapshot.lowPowerMode',
      'charging_state',
    ],
    primaryGroup: 'device_context',
    surfaces: ['today', 'detail'],
    interactions: ['tap_card', 'tap_event_row'],
    phaseOneVisibility: 'ship_now',
    description: 'Latest battery, charging, and low-power context from stored device-state events.',
    rationale: 'Already collected but mostly hidden in the UI.',
  }),
  field({
    key: 'sleepEstimate',
    label: 'Sleep Estimate',
    kind: 'aggregate',
    sourceKeys: ['DailyAggregateRecord.sleepEstimateMinutes', 'sleep_inferred'],
    primaryGroup: 'rest',
    surfaces: ['today', 'trends', 'detail'],
    interactions: ['tap_card', 'tap_series'],
    phaseOneVisibility: 'ship_now_with_guardrails',
    description: 'Sleep duration inferred locally or imported through health records.',
    rationale: 'Renderable now, but the UI must distinguish inferred versus imported sleep.',
  }),
  field({
    key: 'activityPattern',
    label: 'Activity Pattern',
    kind: 'event',
    sourceKeys: ['activity', 'steps', 'location'],
    primaryGroup: 'movement',
    surfaces: ['today', 'trends', 'detail'],
    interactions: ['toggle_mode', 'tap_series'],
    phaseOneVisibility: 'ship_now',
    description: 'Intra-day and weekly pattern view derived from movement-related events.',
    rationale: 'Current strip and heatmap already prove this is visualization-ready.',
  }),
  field({
    key: 'ambientLight',
    label: 'Ambient Light',
    kind: 'event',
    sourceKeys: ['ambient_light'],
    primaryGroup: 'device_behavior',
    surfaces: ['trends', 'detail'],
    interactions: ['tap_series'],
    phaseOneVisibility: 'ship_now_with_guardrails',
    description: 'Ambient light context from device sensors.',
    rationale: 'Available on supported Android devices, but should stay platform-aware and history-dependent.',
  }),
  field({
    key: 'screenStateTimeline',
    label: 'Screen State',
    kind: 'event',
    sourceKeys: ['screen_state'],
    primaryGroup: 'device_behavior',
    surfaces: ['detail', 'trends'],
    interactions: ['tap_event_row', 'toggle_mode'],
    phaseOneVisibility: 'ship_now_with_guardrails',
    description: 'Interactive/non-interactive device state events derived from usage history.',
    rationale: 'Stored today, but best introduced behind a detail surface or alternate pattern mode first.',
  }),
  field({
    key: 'recentSignals',
    label: 'Recent Signals',
    kind: 'summary',
    sourceKeys: EVENT_FIELD_KEYS,
    primaryGroup: 'device_context',
    surfaces: ['today', 'detail'],
    interactions: ['tap_event_row'],
    phaseOneVisibility: 'ship_now',
    description: 'Chronological feed of the latest stored events across supported signal families.',
    rationale: 'Makes collected data inspectable without changing schemas.',
  }),
  field({
    key: 'locationTimeline',
    label: 'Location Timeline',
    kind: 'event',
    sourceKeys: ['location'],
    primaryGroup: 'device_context',
    surfaces: ['detail'],
    interactions: ['tap_event_row'],
    phaseOneVisibility: 'ship_now_with_guardrails',
    description: 'Recent foreground location events and freshness metadata.',
    rationale: 'Renderable now, but should stay compact and privacy-aware.',
  }),
  field({
    key: 'healthImportSummary',
    label: 'Imported Health Records',
    kind: 'summary',
    sourceKeys: ['sleep_inferred', 'heart_rate', 'exercise_session'],
    primaryGroup: 'health_imports',
    surfaces: ['today', 'trends', 'detail'],
    interactions: ['tap_card', 'tap_event_row'],
    phaseOneVisibility: 'ship_now_with_guardrails',
    description: 'Summary of imported health-derived records and their provenance.',
    rationale: 'Events can already exist, but density varies by platform and permission state.',
  }),
  field({
    key: 'heartRate',
    label: 'Heart Rate',
    kind: 'event',
    sourceKeys: ['heart_rate'],
    primaryGroup: 'health_imports',
    surfaces: ['trends', 'detail'],
    interactions: ['tap_series', 'tap_event_row'],
    phaseOneVisibility: 'ship_now_with_guardrails',
    description: 'Imported heart-rate records from health data sources.',
    rationale: 'Schema exists and records may be present, but visibility should stay sparse-history aware.',
  }),
  field({
    key: 'exerciseSessions',
    label: 'Exercise Sessions',
    kind: 'event',
    sourceKeys: ['exercise_session'],
    primaryGroup: 'health_imports',
    surfaces: ['today', 'trends', 'detail'],
    interactions: ['tap_card', 'tap_event_row'],
    phaseOneVisibility: 'ship_now_with_guardrails',
    description: 'Imported workout or exercise session records from health data sources.',
    rationale: 'Better introduced as summaries or event rows before building full charts.',
  }),
  field({
    key: 'distanceMeters',
    label: 'Distance',
    kind: 'aggregate',
    sourceKeys: ['DailyAggregateRecord.distanceMeters', 'distance'],
    primaryGroup: 'movement',
    surfaces: ['today', 'trends', 'detail'],
    interactions: ['tap_card', 'tap_series'],
    phaseOneVisibility: 'defer',
    description: 'Travel distance metric declared in the schema.',
    rationale: 'Aggregate computation is not meaningful yet; keep hidden until the data becomes real.',
  }),
];

export function getCollectedDataVisualizationInventory(): readonly VisualizationFieldDefinition[] {
  return VISUALIZATION_INVENTORY;
}

export function getVisualizationFieldsForSurface(
  surface: VisualizationSurface,
): VisualizationFieldDefinition[] {
  return VISUALIZATION_INVENTORY.filter((field) => field.surfaces.includes(surface));
}

export function getPhaseOneVisualizationFields(): VisualizationFieldDefinition[] {
  return VISUALIZATION_INVENTORY.filter((field) => field.phaseOneVisibility !== 'defer');
}

export function getDeferredVisualizationFields(): VisualizationFieldDefinition[] {
  return VISUALIZATION_INVENTORY.filter((field) => field.phaseOneVisibility === 'defer');
}

export function getVisualizationFieldByKey(
  key: string,
): VisualizationFieldDefinition | undefined {
  return VISUALIZATION_INVENTORY.find((field) => field.key === key);
}

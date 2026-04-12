import type {
  ActivityHour,
  CollectorKey,
  CollectorState,
  DailyAggregateRecord,
  DashboardMetric,
  EventDataType,
  EventSource,
  HeatmapCell,
  SleepEstimate,
  TrendRange,
  TrendSeries,
  ZentraEventRecord,
} from "@/types/zentra";
import { formatMinutes, formatNumber } from "@/utils/format";
import { getTrendRangeDays, shiftISODate, toISODate } from "@/utils/dates";

type CollectorStateMap = Record<CollectorKey, CollectorState>;

const BASE_COLLECTORS: CollectorStateMap = {
  steps: {
    key: "steps",
    label: "Steps",
    description: "Phone step counter and historical step totals.",
    permissionLabel: "Motion access",
    enabled: true,
    permissionStatus: "not_requested",
    health: "idle",
    lastRunLabel: "Waiting for device access",
    sourceLabel: "Sensor + Health Connect",
  },
  activity: {
    key: "activity",
    label: "Activity",
    description: "Walking, stillness, running, and movement context.",
    permissionLabel: "Activity recognition",
    enabled: true,
    permissionStatus: "not_requested",
    health: "idle",
    lastRunLabel: "Not available in Expo prototype",
    sourceLabel: "Activity Recognition",
  },
  appUsage: {
    key: "appUsage",
    label: "Screen Time",
    description: "App usage and screen time behavior.",
    permissionLabel: "Usage access",
    enabled: true,
    permissionStatus: "not_requested",
    health: "idle",
    lastRunLabel: "Not available in Expo prototype",
    sourceLabel: "Usage Stats",
  },
  deviceState: {
    key: "deviceState",
    label: "Device State",
    description: "Charging, unlock, and screen on/off events.",
    permissionLabel: "System events",
    enabled: true,
    permissionStatus: "not_requested",
    health: "idle",
    lastRunLabel: "Waiting for device state",
    sourceLabel: "System Broadcasts",
  },
  healthConnect: {
    key: "healthConnect",
    label: "Health Connect",
    description: "Imported health records like sleep or exercise sessions.",
    permissionLabel: "Health Connect",
    enabled: false,
    permissionStatus: "not_requested",
    health: "idle",
    lastRunLabel: "Not connected",
    sourceLabel: "Health Connect SDK",
  },
  location: {
    key: "location",
    label: "Location",
    description: "Mobility radius and place-change patterns.",
    permissionLabel: "Location",
    enabled: false,
    permissionStatus: "not_requested",
    health: "idle",
    lastRunLabel: "Off",
    sourceLabel: "Fused Location",
  },
  sleep: {
    key: "sleep",
    label: "Sleep Estimate",
    description: "Inferred rest windows from device state and inactivity.",
    permissionLabel: "Derived locally",
    enabled: true,
    permissionStatus: "not_requested",
    health: "idle",
    lastRunLabel: "Requires native sleep inference",
    sourceLabel: "Inference",
  },
  ambientLight: {
    key: "ambientLight",
    label: "Ambient Light",
    description: "Indoor and outdoor light context from the device sensor.",
    permissionLabel: "Light sensor",
    enabled: false,
    permissionStatus: "not_requested",
    health: "idle",
    lastRunLabel: "Off",
    sourceLabel: "Light Sensor",
  },
  motionContext: {
    key: "motionContext",
    label: "Motion Context",
    description:
      "Sedentary blocks, burst activity, and device stability from accelerometer and gyroscope.",
    permissionLabel: "Motion sensors",
    enabled: false,
    permissionStatus: "not_requested",
    health: "idle",
    lastRunLabel: "Off",
    sourceLabel: "Accelerometer + Gyroscope",
  },
};

const HOURS = [
  "00",
  "02",
  "04",
  "06",
  "08",
  "10",
  "12",
  "14",
  "16",
  "18",
  "20",
  "22",
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isCollectorReady(
  collectors: CollectorStateMap,
  key: CollectorKey,
): boolean {
  const collector = collectors[key];
  return (
    collector.enabled &&
    (collector.permissionStatus === "granted" ||
      collector.permissionStatus === "derived")
  );
}

function buildWaveValue(
  index: number,
  min: number,
  max: number,
  phase: number,
): number {
  const midpoint = (min + max) / 2;
  const amplitude = (max - min) / 2;
  return Math.round(midpoint + Math.sin((index + phase) / 2.7) * amplitude);
}

function createMetric(
  available: boolean,
  label: string,
  value: string,
  detail: string,
  tone: DashboardMetric["tone"],
  key: string,
): DashboardMetric {
  return {
    key,
    label,
    value: available ? value : "Unavailable",
    detail,
    tone,
    available,
  };
}

function buildActivityKind(index: number): ActivityHour["kind"] {
  if (index < 3 || index > 9) {
    return "rest";
  }

  if (index === 5 || index === 6 || index === 7) {
    return "screen";
  }

  return "movement";
}

function buildEventTime(dayOffset: number, hour: number): string {
  const base = new Date();
  base.setHours(hour, 0, 0, 0);
  return `${shiftISODate(toISODate(base), dayOffset)}T${hour.toString().padStart(2, "0")}:00:00Z`;
}

function buildDailyAggregate(
  date: string,
  index: number,
): DailyAggregateRecord {
  return {
    date,
    stepsTotal: buildWaveValue(index, 6200, 11400, 1),
    activeMinutes: buildWaveValue(index, 38, 92, 2),
    distanceMeters: 0,
    screenTimeSeconds: buildWaveValue(index, 102, 238, 4) * 60,
    unlockCount: buildWaveValue(index, 18, 54, 5),
    sleepEstimateMinutes: buildWaveValue(index, 360, 540, 3),
    mobilityRadiusMeters: buildWaveValue(index, 1900, 7600, 2),
    topActivity: index % 2 === 0 ? "walking" : "still",
    dataCompleteness: 0.84,
    computedAt: new Date().toISOString(),
  };
}

export function createInitialCollectors(): CollectorStateMap {
  return JSON.parse(JSON.stringify(BASE_COLLECTORS)) as CollectorStateMap;
}

export function createDemoCollectors(
  collectors: CollectorStateMap,
): CollectorStateMap {
  return Object.fromEntries(
    Object.entries(collectors).map(([key, collector]) => [
      key,
      {
        ...collector,
        permissionStatus: collector.enabled
          ? collector.key === "sleep"
            ? "derived"
            : "granted"
          : "not_requested",
        health: collector.enabled
          ? collector.key === "appUsage"
            ? "degraded"
            : "healthy"
          : "idle",
        lastRunLabel: collector.enabled
          ? collector.key === "appUsage"
            ? "18m ago"
            : collector.key === "sleep"
              ? "This morning"
              : "Moments ago"
          : "Off",
      },
    ]),
  ) as CollectorStateMap;
}

export function hasAnyEnabledCollectors(
  collectors: CollectorStateMap,
): boolean {
  return Object.values(collectors).some((collector) => collector.enabled);
}

export function buildDashboardMetrics(
  collectors: CollectorStateMap,
  hasSeedData: boolean,
): DashboardMetric[] {
  const stepsReady = hasSeedData && isCollectorReady(collectors, "steps");
  const activityReady = hasSeedData && isCollectorReady(collectors, "activity");
  const usageReady = hasSeedData && isCollectorReady(collectors, "appUsage");
  const locationReady = hasSeedData && isCollectorReady(collectors, "location");

  return [
    createMetric(
      stepsReady,
      "Steps",
      formatNumber(8472),
      "Daily baseline from phone sensors.",
      "hero",
      "steps",
    ),
    createMetric(
      activityReady,
      "Active Minutes",
      "74",
      "Moderate movement across the day.",
      "physical",
      "activeMinutes",
    ),
    createMetric(
      usageReady,
      "Screen Time",
      formatMinutes(168),
      "Usage access is partially degraded.",
      "cool",
      "screenTime",
    ),
    createMetric(
      locationReady,
      "Mobility Radius",
      "6.4 km",
      "Derived from optional location history.",
      "human",
      "mobilityRadius",
    ),
  ];
}

export function buildActivityHours(
  collectors: CollectorStateMap,
  hasSeedData: boolean,
): ActivityHour[] {
  if (!hasSeedData || !isCollectorReady(collectors, "activity")) {
    return [];
  }

  return HOURS.map((hour, index) => ({
    movementIntensity: buildWaveValue(index, 12, 96, 1),
    hour,
    intensity: buildWaveValue(index, 8, 98, 1),
    kind: buildActivityKind(index),
    label: `${hour}:00`,
    restIntensity: buildWaveValue(
      index,
      index < 3 || index > 9 ? 28 : 6,
      index < 3 || index > 9 ? 92 : 32,
      3,
    ),
    screenIntensity: buildWaveValue(
      index,
      index >= 5 && index <= 7 ? 24 : 6,
      index >= 5 && index <= 7 ? 88 : 28,
      5,
    ),
  }));
}

export function buildSleepEstimate(
  collectors: CollectorStateMap,
  hasSeedData: boolean,
): SleepEstimate {
  const available = hasSeedData && isCollectorReady(collectors, "sleep");

  return {
    startLabel: available ? "22:41" : "--:--",
    endLabel: available ? "06:28" : "--:--",
    durationLabel: available ? "7h 47m" : "Waiting for signals",
    confidence: available ? 0.84 : 0,
    available,
    detail: available
      ? "Inferred from charging, stillness, and screen-off windows."
      : "Enable device-state derived sleep to estimate rest.",
    sourceLabel: available ? "Local inference" : "Waiting",
    isImported: false,
  };
}

export function buildTrendSeries(
  range: TrendRange,
  collectors: CollectorStateMap,
  hasSeedData: boolean,
): TrendSeries[] {
  if (!hasSeedData) {
    return [];
  }

  const days = getTrendRangeDays(range);
  const labels = Array.from({ length: days }, (_, index) => {
    if (days <= 14) {
      return DAYS[index % DAYS.length];
    }

    return `${index + 1}`;
  });

  const definitions = [
    {
      key: "steps",
      label: "Steps",
      unit: "count",
      tone: "hero" as const,
      group: "body" as const,
      min: 6200,
      max: 11800,
      phase: 1,
      ready: isCollectorReady(collectors, "steps"),
    },
    {
      key: "active",
      label: "Active Minutes",
      unit: "min",
      tone: "physical" as const,
      group: "body" as const,
      min: 36,
      max: 96,
      phase: 2,
      ready: isCollectorReady(collectors, "activity"),
    },
    {
      key: "distanceMeters",
      label: "Distance",
      unit: "km",
      tone: "human" as const,
      group: "body" as const,
      min: 1,
      max: 8,
      phase: 3,
      ready: isCollectorReady(collectors, "location"),
    },
    {
      key: "screen",
      label: "Screen Time",
      unit: "min",
      tone: "cool" as const,
      group: "device" as const,
      min: 104,
      max: 246,
      phase: 4,
      ready: isCollectorReady(collectors, "appUsage"),
    },
    {
      key: "unlockCount",
      label: "Unlocks",
      unit: "count",
      tone: "cool" as const,
      group: "device" as const,
      min: 30,
      max: 90,
      phase: 5,
      ready: isCollectorReady(collectors, "appUsage"),
    },
    {
      key: "sleepEstimate",
      label: "Sleep Estimate",
      unit: "min",
      tone: "human" as const,
      group: "body" as const,
      min: 360,
      max: 510,
      phase: 3,
      ready: isCollectorReady(collectors, "sleep"),
    },
    {
      key: "dataCompleteness",
      label: "Data Completeness",
      unit: "%",
      tone: "hero" as const,
      group: "quality" as const,
      min: 20,
      max: 85,
      phase: 6,
      ready: true,
    },
  ];

  return definitions
    .filter((definition) => definition.ready)
    .map((definition) => ({
      key: definition.key,
      label: definition.label,
      unit: definition.unit,
      tone: definition.tone,
      group: definition.group,
      coverageLabel: "Demo coverage",
      sourceLabel:
        definition.key === "distanceMeters"
          ? "Foreground location"
          : definition.group === "device"
            ? "Usage Access"
            : "Repository demo",
      points: labels.map((label, index) => ({
        label,
        value: buildWaveValue(
          index,
          definition.min,
          definition.max,
          definition.phase,
        ),
      })),
      change: buildWaveValue(days / 3, -9, 18, definition.phase),
      variability: buildWaveValue(days / 4, 8, 24, definition.phase),
    }));
}

export function buildHeatmap(
  range: TrendRange,
  collectors: CollectorStateMap,
  hasSeedData: boolean,
): HeatmapCell[] {
  if (!hasSeedData || !isCollectorReady(collectors, "activity")) {
    return [];
  }

  const rangeWeight = Math.max(1, Math.round(getTrendRangeDays(range) / 7));

  return DAYS.flatMap((dayLabel, dayIndex) =>
    HOURS.map((hourLabel, hourIndex) => ({
      dayLabel,
      hourLabel,
      value: buildWaveValue(
        dayIndex * rangeWeight + hourIndex,
        8,
        100,
        dayIndex + rangeWeight,
      ),
    })),
  );
}

export function buildDailyAggregates(
  range: TrendRange,
): DailyAggregateRecord[] {
  const totalDays = getTrendRangeDays(range);
  const end = toISODate(new Date());

  return Array.from({ length: totalDays }, (_, index) => {
    const date = shiftISODate(end, index - (totalDays - 1));
    return buildDailyAggregate(date, index);
  });
}

function createEventRecord(
  type: EventDataType,
  source: EventSource,
  index: number,
  overrides: Partial<ZentraEventRecord>,
): ZentraEventRecord {
  return {
    id: `${type}-${index}`,
    timestampStart: buildEventTime(-index, 8 + (index % 10)),
    timestampEnd: buildEventTime(-index, 9 + (index % 10)),
    dataType: type,
    source,
    unit: "count",
    confidence: 1,
    metadata: {},
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function buildExportEvents(
  collectors: CollectorStateMap,
  hasSeedData: boolean,
): Record<string, ZentraEventRecord[]> {
  if (!hasSeedData) {
    return {};
  }

  const exports: Record<string, ZentraEventRecord[]> = {};

  if (isCollectorReady(collectors, "steps")) {
    exports.steps = Array.from({ length: 6 }, (_, index) =>
      createEventRecord("steps", "sensor", index, {
        valueNumeric: buildWaveValue(index, 820, 1640, 1),
        unit: "count",
      }),
    );
  }

  if (isCollectorReady(collectors, "activity")) {
    const activityTypes = [
      "walking",
      "still",
      "running",
      "walking",
      "vehicle",
      "walking",
    ];
    exports.activity = Array.from({ length: 6 }, (_, index) =>
      createEventRecord("activity", "activity_recognition", index, {
        valueText: activityTypes[index],
        unit: "state",
        confidence: 0.92,
      }),
    );
  }

  if (isCollectorReady(collectors, "appUsage")) {
    exports.app_usage = Array.from({ length: 6 }, (_, index) =>
      createEventRecord("app_usage", "usage_stats", index, {
        valueNumeric: buildWaveValue(index, 12, 43, 4),
        unit: "minutes",
        metadata: { topPackage: index % 2 === 0 ? "messages" : "maps" },
      }),
    );
  }

  if (isCollectorReady(collectors, "deviceState")) {
    const deviceStates = [
      "charging_on",
      "charging_on",
      "charging_off",
      "charging_off",
      "charging_on",
      "charging_off",
    ];
    exports.charging_state = Array.from({ length: 6 }, (_, index) =>
      createEventRecord("charging_state", "system_broadcast", index, {
        valueText: deviceStates[index],
        unit: "state",
      }),
    );
  }

  if (isCollectorReady(collectors, "sleep")) {
    exports.sleep_inferred = [
      createEventRecord("sleep_inferred", "inferred", 0, {
        timestampStart: `${shiftISODate(toISODate(new Date()), -1)}T22:41:00Z`,
        timestampEnd: `${toISODate(new Date())}T06:28:00Z`,
        valueNumeric: 467,
        unit: "minutes",
        confidence: 0.84,
      }),
    ];
  }

  if (isCollectorReady(collectors, "ambientLight")) {
    exports.ambient_light = Array.from({ length: 6 }, (_, index) =>
      createEventRecord("ambient_light", "sensor", index, {
        valueNumeric: buildWaveValue(index, 45, 560, 6),
        unit: "lux",
      }),
    );
  }

  return exports;
}

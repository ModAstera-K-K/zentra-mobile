import { Platform } from "react-native";

import type {
  EventSource,
  LocationSample,
  SignalStoreState,
  ZentraEventRecord,
} from "@/types/zentra";
import type {
  NativeActivityTransition,
  NativeHealthConnectRecord,
  NativeUsageEvent,
} from "@/utils/native/zentra-native-signals";

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createBaseEvent(
  dataType: ZentraEventRecord["dataType"],
  source: EventSource,
  timestamp: string,
): ZentraEventRecord {
  return {
    id: createId(dataType),
    timestampStart: timestamp,
    timestampEnd: timestamp,
    dataType,
    source,
    unit: "count",
    confidence: 1,
    metadata: {},
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
  };
}

export function createStepEvent(stepCount: number): ZentraEventRecord {
  const timestamp = new Date().toISOString();
  return {
    ...createBaseEvent("steps", "sensor", timestamp),
    valueNumeric: stepCount,
    unit: "count",
  };
}

export function createBatteryEvent(snapshot: {
  batteryLevel?: number | null;
  batteryStateLabel?: string | null;
  lowPowerMode?: boolean | null;
}): ZentraEventRecord {
  const timestamp = new Date().toISOString();

  return {
    ...createBaseEvent("charging_state", "system_broadcast", timestamp),
    valueNumeric: snapshot.batteryLevel ?? undefined,
    valueText: snapshot.batteryStateLabel ?? undefined,
    unit: "fraction",
    metadata: {
      low_power_mode: Boolean(snapshot.lowPowerMode),
    },
  };
}

export function createLocationEvent(sample: LocationSample): ZentraEventRecord {
  return {
    ...createBaseEvent("location", "sensor", sample.timestamp),
    valueJson: JSON.stringify({
      latitude: sample.latitude,
      longitude: sample.longitude,
    }),
    unit: "wgs84",
  };
}

export function createAmbientLightEvent(
  lux: number,
  timestamp = new Date().toISOString(),
): ZentraEventRecord {
  return {
    ...createBaseEvent("ambient_light", "sensor", timestamp),
    valueNumeric: lux,
    unit: "lux",
  };
}

export function createActivityEvent(
  transition: NativeActivityTransition,
): ZentraEventRecord {
  return {
    ...createBaseEvent(
      "activity",
      "activity_recognition",
      transition.timestamp,
    ),
    valueText: transition.activityType,
    unit: "transition",
    metadata: {
      confidence: transition.confidence,
      transition: transition.transitionType,
    },
  };
}

function createHealthConnectEvent(
  record: NativeHealthConnectRecord,
): ZentraEventRecord {
  const dataType =
    record.recordType === "sleep" ? "sleep_inferred" : record.recordType;

  return {
    ...createBaseEvent(dataType, "health_connect", record.startTime),
    id: `health-connect-${record.recordType}-${record.id}`,
    timestampEnd: record.endTime,
    valueNumeric: record.valueNumeric ?? undefined,
    valueText: record.valueText ?? undefined,
    valueJson: record.valueJson ?? undefined,
    unit: record.unit,
    confidence: 1,
    metadata: {
      ...record.metadata,
      health_platform: Platform.OS === "ios" ? "HealthKit" : "Health Connect",
      record_id: record.id,
    },
  };
}

export function createHealthConnectEvents(
  records: NativeHealthConnectRecord[],
): ZentraEventRecord[] {
  return records.map(createHealthConnectEvent);
}

export function createMotionContextEvent(summary: {
  label: string;
  avgAccel: number;
  avgGyro: number;
  peakAccel: number;
  sedentaryRatio: number;
  burstRatio: number;
  stability: number;
}): ZentraEventRecord {
  const timestamp = new Date().toISOString();
  return {
    ...createBaseEvent("motion_context", "sensor", timestamp),
    valueText: summary.label,
    valueNumeric: summary.avgAccel,
    unit: "g",
    confidence: summary.stability,
    metadata: {
      avg_gyro: summary.avgGyro,
      peak_accel: summary.peakAccel,
      sedentary_ratio: summary.sedentaryRatio,
      burst_ratio: summary.burstRatio,
      stability: summary.stability,
    },
  };
}

export function createConnectivityStateEvent(
  state: "online" | "offline" | "wifi" | "cellular",
): ZentraEventRecord {
  const timestamp = new Date().toISOString();
  return {
    ...createBaseEvent("connectivity_state", "system_broadcast", timestamp),
    valueText: state,
    unit: "state",
  };
}

function createDeterministicEventId(
  parts: Array<string | null | undefined>,
): string {
  return parts.filter(Boolean).join("-");
}

function createAppUsageEvent(
  packageName: string,
  className: string | null | undefined,
  startTimestamp: string,
  endTimestamp: string,
): ZentraEventRecord {
  const durationSeconds = Math.max(
    1,
    Math.round(
      (new Date(endTimestamp).getTime() - new Date(startTimestamp).getTime()) /
        1000,
    ),
  );

  return {
    ...createBaseEvent("app_usage", "usage_stats", startTimestamp),
    id: createDeterministicEventId([
      "usage",
      packageName,
      className ?? "unknown",
      startTimestamp,
      endTimestamp,
    ]),
    timestampEnd: endTimestamp,
    valueNumeric: durationSeconds,
    valueText: packageName,
    unit: "seconds",
    metadata: {
      class_name: className ?? "unknown",
    },
  };
}

function getNextLocalMidnightTimestamp(timestamp: string): string {
  const nextBoundary = new Date(timestamp);
  nextBoundary.setHours(24, 0, 0, 0);
  return nextBoundary.toISOString();
}

function createAppUsageEvents(
  packageName: string,
  className: string | null | undefined,
  startTimestamp: string,
  endTimestamp: string,
): ZentraEventRecord[] {
  const startMs = new Date(startTimestamp).getTime();
  const endMs = new Date(endTimestamp).getTime();

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return [];
  }

  const events: ZentraEventRecord[] = [];
  let segmentStart = startTimestamp;

  while (new Date(segmentStart).getTime() < endMs) {
    const nextMidnight = getNextLocalMidnightTimestamp(segmentStart);
    const segmentEnd = Math.min(new Date(nextMidnight).getTime(), endMs);

    events.push(
      createAppUsageEvent(
        packageName,
        className,
        segmentStart,
        new Date(segmentEnd).toISOString(),
      ),
    );

    if (segmentEnd >= endMs) {
      break;
    }

    segmentStart = new Date(segmentEnd).toISOString();
  }

  return events;
}

function createScreenStateEvent(
  state: "interactive" | "non_interactive",
  timestamp: string,
): ZentraEventRecord {
  return {
    ...createBaseEvent("screen_state", "usage_stats", timestamp),
    id: createDeterministicEventId(["screen", state, timestamp]),
    valueText: state,
    unit: "state",
  };
}

function createUnlockEvent(timestamp: string): ZentraEventRecord {
  return {
    ...createBaseEvent("unlock_event", "usage_stats", timestamp),
    id: createDeterministicEventId(["unlock", timestamp]),
    valueNumeric: 1,
    unit: "count",
  };
}

export function createUsageDerivedEvents(usageEvents: NativeUsageEvent[]): {
  appUsageEvents: ZentraEventRecord[];
  deviceStateEvents: ZentraEventRecord[];
} {
  const appUsageEvents: ZentraEventRecord[] = [];
  const deviceStateEvents: ZentraEventRecord[] = [];
  const openSessions = new Map<string, NativeUsageEvent>();

  usageEvents
    .slice()
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .forEach((event) => {
      switch (event.eventType) {
        case "activity_resumed": {
          const key = `${event.packageName ?? "unknown"}:${event.className ?? "unknown"}`;
          openSessions.set(key, event);
          break;
        }
        case "activity_paused": {
          const key = `${event.packageName ?? "unknown"}:${event.className ?? "unknown"}`;
          const resumedEvent = openSessions.get(key);
          if (resumedEvent && event.packageName) {
            appUsageEvents.push(
              ...createAppUsageEvents(
                event.packageName,
                event.className,
                resumedEvent.timestamp,
                event.timestamp,
              ),
            );
            openSessions.delete(key);
          }
          break;
        }
        case "screen_interactive":
          deviceStateEvents.push(
            createScreenStateEvent("interactive", event.timestamp),
          );
          break;
        case "screen_non_interactive":
          deviceStateEvents.push(
            createScreenStateEvent("non_interactive", event.timestamp),
          );
          break;
        case "keyguard_hidden":
          deviceStateEvents.push(createUnlockEvent(event.timestamp));
          break;
      }
    });

  return { appUsageEvents, deviceStateEvents };
}

export function buildSeedEventsFromSignals(
  signals: SignalStoreState,
): ZentraEventRecord[] {
  const events: ZentraEventRecord[] = [];

  if (signals.stepCount !== null) {
    events.push(createStepEvent(signals.stepCount));
  }

  if (
    signals.batteryLevel !== null ||
    signals.batteryStateLabel ||
    signals.lowPowerMode !== null
  ) {
    events.push(
      createBatteryEvent({
        batteryLevel: signals.batteryLevel,
        batteryStateLabel: signals.batteryStateLabel,
        lowPowerMode: signals.lowPowerMode,
      }),
    );
  }

  signals.locationSamples.forEach((sample) => {
    events.push(createLocationEvent(sample));
  });

  if (signals.ambientLightLux !== null) {
    events.push(
      createAmbientLightEvent(
        signals.ambientLightLux,
        signals.ambientLightLastUpdatedAt ?? new Date().toISOString(),
      ),
    );
  }

  return events;
}

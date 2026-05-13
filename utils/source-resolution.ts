import type { EventSource, ZentraEventRecord } from "@/types/zentra";

export interface ResolvedMetricSource {
  confidence: number;
  reason: "health_authoritative" | "sensor_fallback" | "freshest_live";
  source: EventSource;
  timestamp: string;
  value: number;
}

export function isNumericStepEvent(event: ZentraEventRecord): boolean {
  return event.dataType === "steps" && typeof event.valueNumeric === "number";
}

export function roundStepValue(value: number | undefined): number {
  return Math.max(0, Math.round(value ?? 0));
}

function sortAscendingByStart(
  events: ZentraEventRecord[],
): ZentraEventRecord[] {
  return [...events].sort((left, right) =>
    left.timestampStart.localeCompare(right.timestampStart),
  );
}

function sortDescendingByStart(
  events: ZentraEventRecord[],
): ZentraEventRecord[] {
  return [...events].sort((left, right) =>
    right.timestampStart.localeCompare(left.timestampStart),
  );
}

export function computeSensorStepDeltas(
  events: ZentraEventRecord[],
): ResolvedMetricSource | null {
  const sensorSteps = sortAscendingByStart(
    events.filter(
      (event) => isNumericStepEvent(event) && event.source === "sensor",
    ),
  );

  if (!sensorSteps.length) {
    return null;
  }

  let total = roundStepValue(sensorSteps[0].valueNumeric);
  for (let i = 1; i < sensorSteps.length; i += 1) {
    const current = roundStepValue(sensorSteps[i].valueNumeric);
    const previous = roundStepValue(sensorSteps[i - 1].valueNumeric);
    total += Math.max(0, current - previous);
  }

  const latest = sensorSteps[sensorSteps.length - 1];

  return {
    confidence: latest.confidence,
    reason: "sensor_fallback",
    source: latest.source,
    timestamp: latest.timestampStart,
    value: total,
  };
}

export function hasHealthStepEvents(events: ZentraEventRecord[]): boolean {
  return events.some(
    (event) => isNumericStepEvent(event) && event.source === "health_connect",
  );
}

export function buildSensorStepDeltaMap(
  events: ZentraEventRecord[],
): Map<string, number> {
  const sensorSteps = sortAscendingByStart(
    events.filter(
      (event) => isNumericStepEvent(event) && event.source === "sensor",
    ),
  );
  const deltas = new Map<string, number>();
  let previousCount: number | null = null;

  sensorSteps.forEach((event) => {
    const currentCount = roundStepValue(event.valueNumeric);
    const delta =
      previousCount === null
        ? currentCount
        : Math.max(0, currentCount - previousCount);
    deltas.set(event.id, delta);
    previousCount = currentCount;
  });

  return deltas;
}

export function getResolvedStepEvents(
  events: ZentraEventRecord[],
): ZentraEventRecord[] {
  const stepEvents = events.filter(isNumericStepEvent);

  if (!hasHealthStepEvents(stepEvents)) {
    return stepEvents;
  }

  return stepEvents.filter((event) => event.source === "health_connect");
}

export function getStepEventResolvedValue(
  event: ZentraEventRecord,
  sensorStepDeltas: Map<string, number>,
): number {
  if (event.source === "sensor") {
    return sensorStepDeltas.get(event.id) ?? 0;
  }

  return roundStepValue(event.valueNumeric);
}

export function resolveDailySteps(
  events: ZentraEventRecord[],
): ResolvedMetricSource | null {
  const healthSteps = events.filter(
    (event) => isNumericStepEvent(event) && event.source === "health_connect",
  );

  if (healthSteps.length) {
    const latest = sortDescendingByStart(healthSteps)[0];
    return {
      confidence: latest.confidence,
      reason: "health_authoritative",
      source: latest.source,
      timestamp: latest.timestampStart,
      value: healthSteps.reduce(
        (total, event) => total + roundStepValue(event.valueNumeric),
        0,
      ),
    };
  }

  return computeSensorStepDeltas(events);
}

export function resolveTodayStepSnapshot(
  events: ZentraEventRecord[],
): ResolvedMetricSource | null {
  const dailySteps = resolveDailySteps(events);

  if (dailySteps?.reason === "health_authoritative") {
    return dailySteps;
  }

  const latestNumericStep = sortDescendingByStart(
    events.filter(isNumericStepEvent),
  )[0];

  if (!latestNumericStep) {
    return dailySteps;
  }

  if (dailySteps && latestNumericStep.timestampStart <= dailySteps.timestamp) {
    return dailySteps;
  }

  return {
    confidence: latestNumericStep.confidence,
    reason: "freshest_live",
    source: latestNumericStep.source,
    timestamp: latestNumericStep.timestampStart,
    value: roundStepValue(latestNumericStep.valueNumeric),
  };
}

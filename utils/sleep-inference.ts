import type { ZentraEventRecord } from '@/types/zentra';
import { shiftISODate } from '@/utils/dates';

interface SleepCandidate {
  startTimestamp: string;
  endTimestamp: string;
  confidence: number;
}

function createSleepEventId(date: string): string {
  return `sleep-inferred-${date}`;
}

function isWithinReasonableSleepWindow(startTimestamp: string, endTimestamp: string): boolean {
  const durationMinutes = (new Date(endTimestamp).getTime() - new Date(startTimestamp).getTime()) / 60_000;
  return durationMinutes >= 180 && durationMinutes <= 720;
}

function findScreenStateCandidates(events: ZentraEventRecord[]): SleepCandidate[] {
  const screenEvents = events
    .filter((event) => event.dataType === 'screen_state' && typeof event.valueText === 'string')
    .sort((left, right) => left.timestampStart.localeCompare(right.timestampStart));
  const candidates: SleepCandidate[] = [];

  screenEvents.forEach((event, index) => {
    if (event.valueText !== 'non_interactive') {
      return;
    }

    const nextInteractive = screenEvents.slice(index + 1).find((candidate) => candidate.valueText === 'interactive');

    if (!nextInteractive || !isWithinReasonableSleepWindow(event.timestampStart, nextInteractive.timestampStart)) {
      return;
    }

    candidates.push({
      startTimestamp: event.timestampStart,
      endTimestamp: nextInteractive.timestampStart,
      confidence: 0.55,
    });
  });

  return candidates;
}

function scoreCandidate(candidate: SleepCandidate, events: ZentraEventRecord[]): SleepCandidate {
  const chargingAroundStart = events.some((event) => (
    event.dataType === 'charging_state'
      && Math.abs(new Date(event.timestampStart).getTime() - new Date(candidate.startTimestamp).getTime()) <= 90 * 60_000
  ));
  const unlocksDuringWindow = events.filter((event) => (
    event.dataType === 'unlock_event'
      && event.timestampStart >= candidate.startTimestamp
      && event.timestampStart <= candidate.endTimestamp
  )).length;
  const activityEventsDuringWindow = events.filter((event) => (
    event.dataType === 'activity'
      && event.timestampStart >= candidate.startTimestamp
      && event.timestampStart <= candidate.endTimestamp
      && event.valueText !== 'still'
  )).length;

  let confidence = candidate.confidence;

  if (chargingAroundStart) {
    confidence += 0.2;
  }

  if (unlocksDuringWindow === 0) {
    confidence += 0.15;
  }

  if (activityEventsDuringWindow === 0) {
    confidence += 0.1;
  }

  return {
    ...candidate,
    confidence: Math.min(0.95, Number(confidence.toFixed(2))),
  };
}

function chooseBestCandidate(events: ZentraEventRecord[]): SleepCandidate | null {
  const candidates = findScreenStateCandidates(events).map((candidate) => scoreCandidate(candidate, events));

  if (!candidates.length) {
    return null;
  }

  return candidates.sort((left, right) => {
    const leftDuration = new Date(left.endTimestamp).getTime() - new Date(left.startTimestamp).getTime();
    const rightDuration = new Date(right.endTimestamp).getTime() - new Date(right.startTimestamp).getTime();
    return (right.confidence - left.confidence) || (rightDuration - leftDuration);
  })[0] ?? null;
}

export function inferSleepEvents(events: ZentraEventRecord[], endDate: string): ZentraEventRecord[] {
  const inferredEvents: ZentraEventRecord[] = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const date = shiftISODate(endDate, -offset);
    const previousDate = shiftISODate(date, -1);
    const windowStart = `${previousDate}T18:00:00.000Z`;
    const windowEnd = `${date}T12:00:00.000Z`;
    const windowEvents = events.filter((event) => (
      event.timestampStart >= windowStart && event.timestampStart <= windowEnd
    ));
    const hasExistingSleep = windowEvents.some((event) => (
      event.dataType === 'sleep_inferred' && (event.source === 'health_connect' || event.source === 'inferred')
    ));

    if (hasExistingSleep) {
      continue;
    }

    const candidate = chooseBestCandidate(windowEvents);

    if (!candidate) {
      continue;
    }

    const durationMinutes = Math.round(
      (new Date(candidate.endTimestamp).getTime() - new Date(candidate.startTimestamp).getTime()) / 60_000,
    );

    inferredEvents.push({
      id: createSleepEventId(date),
      timestampStart: candidate.startTimestamp,
      timestampEnd: candidate.endTimestamp,
      dataType: 'sleep_inferred',
      source: 'inferred',
      valueNumeric: durationMinutes,
      unit: 'minutes',
      confidence: candidate.confidence,
      metadata: {
        inferred_for_date: date,
        heuristic: 'screen_state_unlock_charging',
      },
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
    });
  }

  return inferredEvents;
}

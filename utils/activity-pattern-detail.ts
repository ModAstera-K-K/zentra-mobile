import type {
  ActivityPatternCell,
  MetricTone,
  UnifiedTimelineBucket,
  UnifiedTimelineWindow,
  ZentraEventRecord,
} from '@/types/zentra';
import type {
  TodayDetailChartPoint,
  TodayDetailFact,
  TodayDetailPayload,
  TodayDetailVisual,
} from '@/utils/today-visualization';
import { formatMinutes, formatNumber, formatPercent } from '@/utils/format';
import { buildUnifiedTimeline } from '@/utils/unified-timeline';

function getTone(cell: ActivityPatternCell): MetricTone {
  switch (cell.dominantKind) {
    case 'movement':
      return 'physical';
    case 'screen':
      return 'cool';
    default:
      return 'human';
  }
}

function getWindowLabel(startTimestamp: string, endTimestamp: string): string {
  const start = new Date(startTimestamp);
  const end = new Date(endTimestamp);
  const sameDay = start.toDateString() === end.toDateString();

  if (sameDay) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(start);
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${formatter.format(start)} to ${formatter.format(end)}`;
}

function overlapsWindow(event: ZentraEventRecord, startMs: number, endMs: number): boolean {
  const eventStart = new Date(event.timestampStart).getTime();
  const eventEnd = new Date(event.timestampEnd > event.timestampStart ? event.timestampEnd : event.timestampStart).getTime();

  return eventStart < endMs && eventEnd >= startMs;
}

function filterEventsForCell(
  cell: ActivityPatternCell,
  events: ZentraEventRecord[],
): ZentraEventRecord[] {
  const startMs = new Date(cell.startTimestamp).getTime();
  const endMs = new Date(cell.endTimestamp).getTime();

  return events
    .filter((event) => overlapsWindow(event, startMs, endMs))
    .sort((left, right) => left.timestampStart.localeCompare(right.timestampStart));
}

function getCombinedScore(bucket: UnifiedTimelineBucket): number {
  return Math.max(bucket.movementScore, bucket.restScore, bucket.screenScore);
}

function formatPointLabel(bucket: UnifiedTimelineBucket, granularity: ActivityPatternCell['granularity']): string {
  const date = new Date(bucket.timestampStart);

  if (granularity === 'year') {
    return new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
    }).format(date);
  }

  return bucket.label;
}

function buildLinePoints(
  granularity: ActivityPatternCell['granularity'],
  buckets: UnifiedTimelineBucket[],
): TodayDetailChartPoint[] {
  return buckets.map((bucket) => {
    const value = getCombinedScore(bucket);

    return {
      label: formatPointLabel(bucket, granularity),
      value,
      valueLabel: value > 0 ? formatNumber(value) : '0',
    };
  });
}

function buildWindowForCell(cell: ActivityPatternCell): UnifiedTimelineWindow | null {
  if (cell.granularity === 'day') {
    return {
      endTimestamp: cell.endTimestamp,
      resolution: '15min',
      startTimestamp: cell.startTimestamp,
    };
  }

  if (cell.granularity === 'month') {
    return {
      endTimestamp: cell.endTimestamp,
      resolution: 'hour',
      startTimestamp: cell.startTimestamp,
    };
  }

  return null;
}

function buildYearBucketPoints(cell: ActivityPatternCell, events: ZentraEventRecord[]): TodayDetailChartPoint[] {
  const monthStart = new Date(cell.startTimestamp);
  const monthEnd = new Date(cell.endTimestamp);
  const points: TodayDetailChartPoint[] = [];
  let cursor = new Date(monthStart);

  while (cursor < monthEnd) {
    const next = new Date(cursor);
    next.setDate(next.getDate() + 1);

    const timeline = buildUnifiedTimeline(events, {
      endTimestamp: next.toISOString(),
      resolution: 'hour',
      startTimestamp: cursor.toISOString(),
    });
    const value = Math.max(0, ...timeline.map(getCombinedScore));

    points.push({
      label: new Intl.DateTimeFormat('en-US', {
        month: 'numeric',
        day: 'numeric',
      }).format(cursor),
      value,
      valueLabel: value > 0 ? formatNumber(value) : '0',
    });

    cursor = next;
  }

  return points;
}

function buildVisualForCell(
  cell: ActivityPatternCell,
  events: ZentraEventRecord[],
): TodayDetailVisual | null {
  if (!cell.hasAnyData) {
    return null;
  }

  if (cell.granularity === 'year') {
    const points = buildYearBucketPoints(cell, events);

    return {
      type: 'line',
      annotation: 'Daily combined signal intensity across the selected month.',
      points,
    };
  }

  const window = buildWindowForCell(cell);
  if (!window) {
    return null;
  }

  const buckets = buildUnifiedTimeline(events, window);

  return {
    type: 'line',
    annotation: cell.granularity === 'day'
      ? 'Quarter-hour combined signal intensity inside the selected hour.'
      : 'Hourly combined signal intensity across the selected day.',
    points: buildLinePoints(cell.granularity, buckets),
  };
}

function buildFacts(cell: ActivityPatternCell, relatedEvents: ZentraEventRecord[]): TodayDetailFact[] {
  const movement = Math.round(cell.movementScore);
  const screen = Math.round(cell.screenScore);
  const rest = Math.round(cell.restScore);
  const intensity = Math.round(cell.intensity);

  return [
    { label: 'Window', value: getWindowLabel(cell.startTimestamp, cell.endTimestamp) },
    { label: 'Dominant', value: cell.dominantKind },
    { label: 'Events', value: formatNumber(relatedEvents.length) },
    { label: 'Intensity', value: formatPercent(intensity) },
    { label: 'Movement', value: formatNumber(movement) },
    { label: 'Screen', value: formatNumber(screen) },
    { label: 'Rest', value: formatNumber(rest) },
  ];
}

function buildRows(events: ZentraEventRecord[]): TodayDetailFact[] {
  return [...events]
    .sort((left, right) => right.timestampStart.localeCompare(left.timestampStart))
    .slice(0, 8)
    .map((event) => ({
      label: `${event.dataType.replace(/_/g, ' ')} · ${new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(event.timestampStart))}`,
      value: typeof event.valueNumeric === 'number'
        ? formatNumber(Math.round(event.valueNumeric))
        : event.valueText ?? event.unit,
    }));
}

function buildSummary(cell: ActivityPatternCell, relatedEvents: ZentraEventRecord[]): string {
  if (!cell.hasAnyData || !relatedEvents.length) {
    return 'No stored events have landed in this window yet.';
  }

  if (cell.granularity === 'day') {
    return `${relatedEvents.length} captured events landed in this hour. The strongest signal in this slice was ${cell.dominantKind}.`;
  }

  if (cell.granularity === 'month') {
    return `${relatedEvents.length} captured events shaped this day. The day leaned ${cell.dominantKind}, with ${formatMinutes(Math.round(cell.restScore * 5))} of inferred recovery-weighted time represented in the aligned summary.`;
  }

  return `${relatedEvents.length} captured events shaped this month. This month leaned ${cell.dominantKind} across the combined movement, screen, and rest signals.`;
}

function getValueLabel(cell: ActivityPatternCell): string {
  if (!cell.hasAnyData) {
    return 'No data';
  }

  return `${Math.round(cell.intensity)}/100`;
}

function getMetaLabel(cell: ActivityPatternCell): string {
  if (cell.granularity === 'day') {
    return 'Hour detail';
  }

  if (cell.granularity === 'month') {
    return 'Day detail';
  }

  return 'Month detail';
}

export function buildActivityPatternDetailPayload(
  cell: ActivityPatternCell,
  events: ZentraEventRecord[],
): TodayDetailPayload {
  const relatedEvents = filterEventsForCell(cell, events);

  return {
    key: cell.id,
    eyebrow: 'Activity pattern',
    title: cell.detailLabel,
    value: getValueLabel(cell),
    summary: buildSummary(cell, relatedEvents),
    tone: getTone(cell),
    meta: getMetaLabel(cell),
    visual: buildVisualForCell(cell, relatedEvents),
    facts: buildFacts(cell, relatedEvents),
    rows: buildRows(relatedEvents),
  };
}

import type { ActivityHour, ZentraEventRecord } from '@/types/zentra';

interface ActivityBucket {
  hour: string;
  label: string;
  movementScore: number;
  restScore: number;
  screenScore: number;
}

const BUCKET_HOURS = ['00', '02', '04', '06', '08', '10', '12', '14', '16', '18', '20', '22'];

function createBuckets(): ActivityBucket[] {
  return BUCKET_HOURS.map((hour) => ({
    hour,
    label: `${hour}:00`,
    movementScore: 0,
    restScore: 0,
    screenScore: 0,
  }));
}

function getBucketIndex(timestamp: string): number {
  const localHour = new Date(timestamp).getHours();
  return Math.floor(localHour / 2);
}

function addActivityScore(bucket: ActivityBucket, event: ZentraEventRecord): void {
  if (event.valueText === 'still') {
    bucket.restScore += 2;
    return;
  }

  bucket.movementScore += 5;
}

function addAppUsageScore(bucket: ActivityBucket, event: ZentraEventRecord): void {
  const durationSeconds = typeof event.valueNumeric === 'number' ? event.valueNumeric : 0;
  bucket.screenScore += Math.max(2, Math.min(8, Math.round(durationSeconds / 300)));
}

function addScreenStateScore(bucket: ActivityBucket, event: ZentraEventRecord): void {
  if (event.valueText === 'interactive') {
    bucket.screenScore += 3;
    return;
  }

  if (event.valueText === 'non_interactive') {
    bucket.restScore += 3;
  }
}

function addEventToBucket(bucket: ActivityBucket, event: ZentraEventRecord): void {
  switch (event.dataType) {
    case 'activity':
      addActivityScore(bucket, event);
      break;
    case 'app_usage':
      addAppUsageScore(bucket, event);
      break;
    case 'screen_state':
      addScreenStateScore(bucket, event);
      break;
    case 'unlock_event':
      bucket.screenScore += 1;
      break;
    case 'location':
      bucket.movementScore += 2;
      break;
  }
}

function getBucketKind(bucket: ActivityBucket): ActivityHour['kind'] {
  if (bucket.movementScore >= bucket.screenScore && bucket.movementScore >= bucket.restScore) {
    return bucket.movementScore > 0 ? 'movement' : 'rest';
  }

  if (bucket.screenScore >= bucket.restScore) {
    return bucket.screenScore > 0 ? 'screen' : 'rest';
  }

  return 'rest';
}

function getBucketTotal(bucket: ActivityBucket): number {
  return Math.max(bucket.movementScore, bucket.screenScore, bucket.restScore);
}

function toIntensity(total: number, maxTotal: number): number {
  if (maxTotal <= 0 || total <= 0) {
    return 0;
  }

  return Math.max(6, Math.min(98, Math.round((total / maxTotal) * 98)));
}

export function buildLiveActivityHours(events: ZentraEventRecord[]): ActivityHour[] {
  const relevantEvents = events.filter((event) => (
    event.dataType === 'activity'
      || event.dataType === 'app_usage'
      || event.dataType === 'screen_state'
      || event.dataType === 'unlock_event'
      || event.dataType === 'location'
  ));

  if (!relevantEvents.length) {
    return [];
  }

  const buckets = createBuckets();

  relevantEvents.forEach((event) => {
    const bucket = buckets[getBucketIndex(event.timestampStart)];
    if (!bucket) {
      return;
    }

    addEventToBucket(bucket, event);
  });

  const maxTotal = Math.max(...buckets.map(getBucketTotal));
  const maxMovement = Math.max(...buckets.map((bucket) => bucket.movementScore), 0);
  const maxScreen = Math.max(...buckets.map((bucket) => bucket.screenScore), 0);
  const maxRest = Math.max(...buckets.map((bucket) => bucket.restScore), 0);

  if (maxTotal <= 0) {
    return [];
  }

  return buckets.map((bucket) => {
    const total = getBucketTotal(bucket);

    return {
      hour: bucket.hour,
      label: bucket.label,
      intensity: toIntensity(total, maxTotal),
      kind: getBucketKind(bucket),
      movementIntensity: toIntensity(bucket.movementScore, maxMovement),
      restIntensity: toIntensity(bucket.restScore, maxRest),
      screenIntensity: toIntensity(bucket.screenScore, maxScreen),
    };
  });
}

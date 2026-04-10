import { appendEventsForCollector, ensureCollectorFailureState } from '@/utils/event-repository';
import { toISODate } from '@/utils/dates';
import { getEventsForRange } from '@/utils/event-repository';
import { inferSleepEvents } from '@/utils/sleep-inference';
import type { CollectorHandle, SleepCollectorDeps } from '@/utils/collectors/types';

export async function startSleepCollector(
  deps: SleepCollectorDeps,
): Promise<CollectorHandle> {
  const today = toISODate(new Date());
  const start = new Date();
  start.setDate(start.getDate() - 8);
  const startIsoDate = toISODate(start);
  const events = await getEventsForRange(startIsoDate, today);
  const inferredEvents = inferSleepEvents(events, today);

  if (!inferredEvents.length) {
    await ensureCollectorFailureState(
      'sleep',
      'Sleep inference needs screen-state, unlock, or charging history before it can infer rest windows',
    );
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  await appendEventsForCollector('sleep', inferredEvents, `Sleep inference stored ${inferredEvents.length} night(s)`);
  await deps.refreshRepository();

  return {
    stop: () => undefined,
  };
}

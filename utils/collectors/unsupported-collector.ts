import { ensureCollectorFailureState } from '@/utils/event-repository';
import type { CollectorHandle, UnsupportedCollectorDeps } from '@/utils/collectors/types';

export async function startUnsupportedCollector(
  deps: UnsupportedCollectorDeps,
): Promise<CollectorHandle> {
  await ensureCollectorFailureState(deps.collectorKey, deps.message);
  await deps.refreshRepository();

  return {
    stop: () => undefined,
  };
}

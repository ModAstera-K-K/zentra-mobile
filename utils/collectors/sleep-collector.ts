import { logCollectorSuccess } from "@/utils/event-repository";
import { reconcileRestEstimates } from "@/utils/rest-repository";
import type { CollectorHandle, SleepCollectorDeps } from "@/utils/collectors/types";

export async function syncSleepCollector(deps: SleepCollectorDeps): Promise<void> {
  const count = await reconcileRestEstimates();
  await logCollectorSuccess("sleep", count ? `Rest inference reconciled ${count} night(s)`
    : "No supported phone-rest window yet; imported sleep remains available", count);
  await deps.refreshRepository();
}

export async function startSleepCollector(deps: SleepCollectorDeps): Promise<CollectorHandle> {
  await syncSleepCollector(deps);
  return { stop: () => undefined };
}

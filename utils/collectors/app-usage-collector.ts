import { appendEventsForCollector, ensureCollectorFailureState, logCollectorSuccess } from '@/utils/event-repository';
import {
  getUsageAccessPermissionStatusAsync,
  readUsageEventsAsync,
} from '@/utils/native/zentra-native-signals';
import { createUsageDerivedEvents } from '@/utils/live-event-builders';
import type { AppUsageCollectorDeps, CollectorHandle } from '@/utils/collectors/types';

function getSyncWindowStart(lastSyncedAt: string | null): string {
  if (lastSyncedAt) {
    return new Date(new Date(lastSyncedAt).getTime() - 60_000).toISOString();
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

export async function startAppUsageCollector(
  deps: AppUsageCollectorDeps,
): Promise<CollectorHandle> {
  let lastSyncedAt: string | null = null;

  async function syncUsageStats(): Promise<void> {
    const permissionStatus = await getUsageAccessPermissionStatusAsync();

    if (permissionStatus === 'unsupported') {
      await ensureCollectorFailureState(
        'appUsage',
        'Usage stats are unsupported in this build until the Android dev client is rebuilt',
      );
      await ensureCollectorFailureState(
        'deviceState',
        'Screen and unlock events depend on Android Usage Access in this build',
      );
      await deps.refreshRepository();
      return;
    }

    if (permissionStatus !== 'granted') {
      await ensureCollectorFailureState('appUsage', 'Usage access not granted');
      await ensureCollectorFailureState('deviceState', 'Usage access not granted for screen and unlock events');
      await deps.refreshRepository();
      return;
    }

    const endIso = new Date().toISOString();
    const usageEvents = await readUsageEventsAsync(getSyncWindowStart(lastSyncedAt), endIso);
    const { appUsageEvents, deviceStateEvents } = createUsageDerivedEvents(usageEvents);

    if (appUsageEvents.length) {
      await appendEventsForCollector('appUsage', appUsageEvents, `Usage stats stored ${appUsageEvents.length} event(s)`);
    } else {
      await logCollectorSuccess('appUsage', 'Usage access granted with no app sessions in this window', 0);
    }

    if (deviceStateEvents.length) {
      await appendEventsForCollector('deviceState', deviceStateEvents, `Screen and unlock events stored ${deviceStateEvents.length} event(s)`);
    } else {
      await logCollectorSuccess('deviceState', 'Usage access granted with no screen-state events in this window', 0);
    }

    lastSyncedAt = endIso;
    await deps.refreshRepository();
  }

  await syncUsageStats();
  const interval = setInterval(() => {
    void syncUsageStats();
  }, 60_000);

  return {
    stop: () => clearInterval(interval),
  };
}

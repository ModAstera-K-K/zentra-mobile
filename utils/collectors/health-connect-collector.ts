import { appendEventsForCollector, ensureCollectorFailureState, logCollectorSuccess } from '@/utils/event-repository';
import type { CollectorHandle, HealthConnectCollectorDeps } from '@/utils/collectors/types';
import { shiftISODate, toISODate } from '@/utils/dates';
import { createHealthConnectEvents } from '@/utils/live-event-builders';
import {
  getGrantedHealthConnectPermissionsAsync,
  getHealthConnectAvailabilityAsync,
  hasRequiredHealthConnectPermissions,
  readHealthConnectRecordsAsync,
  requestHealthConnectPermissionsAsync,
} from '@/utils/native/zentra-native-signals';

function getHealthConnectWindow(): { startIso: string; endIso: string } {
  const now = new Date();
  const endIso = now.toISOString();
  const startIso = new Date(`${shiftISODate(toISODate(now), -30)}T00:00:00.000Z`).toISOString();

  return { startIso, endIso };
}

export async function startHealthConnectCollector(
  deps: HealthConnectCollectorDeps,
): Promise<CollectorHandle> {
  const availability = await getHealthConnectAvailabilityAsync();

  if (availability === 'unsupported') {
    await ensureCollectorFailureState(
      'healthConnect',
      'Health Connect is unsupported in this build until the Android dev client is rebuilt',
    );
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  if (availability === 'not_installed') {
    await ensureCollectorFailureState(
      'healthConnect',
      'Install or update Health Connect before enabling this collector',
    );
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  let grantedPermissions = await getGrantedHealthConnectPermissionsAsync();

  if (!hasRequiredHealthConnectPermissions(grantedPermissions)) {
    grantedPermissions = await requestHealthConnectPermissionsAsync();
  }

  if (!hasRequiredHealthConnectPermissions(grantedPermissions)) {
    await ensureCollectorFailureState('healthConnect', 'Health Connect permissions not granted');
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  const { startIso, endIso } = getHealthConnectWindow();
  const records = await readHealthConnectRecordsAsync(startIso, endIso);
  const events = createHealthConnectEvents(records);

  if (!events.length) {
    await logCollectorSuccess('healthConnect', 'Health Connect connected with no matching records yet', 0);
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  await appendEventsForCollector('healthConnect', events, `Health Connect sync stored ${events.length} event(s)`);
  await deps.refreshRepository();

  return {
    stop: () => undefined,
  };
}

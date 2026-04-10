import { appendEventsForCollector, ensureCollectorFailureState } from '@/utils/event-repository';
import { createActivityEvent } from '@/utils/live-event-builders';
import {
  addActivityTransitionListener,
  getActivityRecognitionPermissionStatusAsync,
  requestActivityRecognitionPermissionAsync,
  startActivityRecognitionUpdatesAsync,
  stopActivityRecognitionUpdatesAsync,
} from '@/utils/native/zentra-native-signals';
import type { ActivityCollectorDeps, CollectorHandle } from '@/utils/collectors/types';

export async function startActivityCollector(
  deps: ActivityCollectorDeps,
): Promise<CollectorHandle> {
  let permissionStatus = await getActivityRecognitionPermissionStatusAsync();

  if (permissionStatus === 'not_requested') {
    permissionStatus = await requestActivityRecognitionPermissionAsync();
  }

  if (permissionStatus === 'unsupported') {
    await ensureCollectorFailureState(
      'activity',
      'Activity recognition is unsupported in this build until the Android dev client is rebuilt',
    );
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  if (permissionStatus !== 'granted') {
    await ensureCollectorFailureState(
      'activity',
      permissionStatus === 'blocked'
        ? 'Activity recognition permission denied'
        : 'Activity recognition permission not granted',
    );
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  const subscription = addActivityTransitionListener((payload) => {
    void (async () => {
      await appendEventsForCollector(
        'activity',
        [createActivityEvent(payload)],
        `Activity ${payload.activityType} ${payload.transitionType} stored`,
      );
      await deps.refreshRepository();
    })();
  });

  const didStart = await startActivityRecognitionUpdatesAsync();

  if (!didStart) {
    subscription?.remove();
    await ensureCollectorFailureState(
      'activity',
      'Activity recognition is unsupported in this build until the Android dev client is rebuilt',
    );
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  await deps.refreshRepository();

  return {
    stop: () => {
      subscription?.remove();
      void stopActivityRecognitionUpdatesAsync();
    },
  };
}

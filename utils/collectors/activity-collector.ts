import { Platform } from "react-native";
import {
  activityHistoryGeneration,
  assertActivityHistoryGeneration,
  cancelActivityHistory,
} from "@/utils/activity-history-session";
import {
  appendEventsForCollector,
  ensureCollectorFailureState,
} from "@/utils/event-repository";
import { createActivityEvent } from "@/utils/live-event-builders";
import {
  addActivityTransitionListener,
  cancelNativeActivityHistory,
  getActivityRecognitionPermissionStatusAsync,
  startActivityRecognitionUpdatesAsync,
  stopActivityRecognitionUpdatesAsync,
} from "@/utils/native/zentra-native-signals";
import { getActivityUnsupportedMessage } from "@/utils/platform-capabilities";
import type {
  ActivityCollectorDeps,
  CollectorHandle,
} from "@/utils/collectors/types";

export async function startActivityCollector(
  deps: ActivityCollectorDeps,
): Promise<CollectorHandle> {
  const permissionStatus = await getActivityRecognitionPermissionStatusAsync();

  if (permissionStatus === "unsupported") {
    await ensureCollectorFailureState(
      "activity",
      getActivityUnsupportedMessage(),
    );
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  if (permissionStatus !== "granted") {
    await ensureCollectorFailureState(
      "activity",
      permissionStatus === "blocked"
        ? "Activity recognition permission denied"
        : "Activity recognition permission not granted",
    );
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  const generation = activityHistoryGeneration();
  let stopped = false;
  const assertActive = () => {
    if (stopped) throw new Error("Activity collector stopped");
    assertActivityHistoryGeneration(generation);
  };
  const subscription = addActivityTransitionListener((payload) => {
    void (async () => {
      await appendEventsForCollector(
        "activity",
        [createActivityEvent(payload)],
        `Activity ${payload.activityType} ${payload.transitionType} stored`,
        assertActive,
      );
      await deps.refreshRepository();
    })().catch(() => undefined);
  });

  const didStart = await startActivityRecognitionUpdatesAsync();

  if (!didStart) {
    subscription?.remove();
    await ensureCollectorFailureState(
      "activity",
      getActivityUnsupportedMessage(),
    );
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  const recoverHistory = async () => {
    try {
      await deps.drainBufferedEvents();
    } catch {
      if (stopped || generation !== activityHistoryGeneration()) return;
      await ensureCollectorFailureState(
        "activity",
        Platform.OS === "ios"
          ? "Core Motion history read failed; retry available"
          : "Failed to import buffered activity transitions",
      );
    }
    if (!stopped) await deps.refreshRepository();
  };
  // iOS recovery never holds up registration of the other live collectors.
  if (Platform.OS === "ios") void recoverHistory().catch(() => undefined);
  else await recoverHistory();

  return {
    stop: () => {
      stopped = true;
      if (generation === activityHistoryGeneration()) cancelActivityHistory();
      void cancelNativeActivityHistory().catch(() => undefined);
      subscription?.remove();
      void stopActivityRecognitionUpdatesAsync();
    },
  };
}

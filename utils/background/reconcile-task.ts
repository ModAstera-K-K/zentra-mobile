import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import { useRepositoryStore } from "@/stores";
import type { CollectorState } from "@/types/zentra";
import { runImportantCollectorReconcile } from "@/utils/background/reconcile";

export const ZENTRA_BACKGROUND_RECONCILE_TASK =
  "zentra-background-reconcile";
const MINIMUM_INTERVAL_MINUTES = 15;

function hasPeriodicReconcileCollectors(
  collectors: Record<string, CollectorState>,
): boolean {
  return [
    collectors.activity?.enabled,
    collectors.appUsage?.enabled,
    collectors.healthConnect?.enabled,
    collectors.sleep?.enabled,
  ].some(Boolean);
}

if (!TaskManager.isTaskDefined(ZENTRA_BACKGROUND_RECONCILE_TASK)) {
  TaskManager.defineTask(ZENTRA_BACKGROUND_RECONCILE_TASK, async () => {
    try {
      await runImportantCollectorReconcile();
      await useRepositoryStore.getState().noteBackgroundTaskSuccess();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      await useRepositoryStore.getState().noteBackgroundTaskFailure(
        error instanceof Error ? error.message : "Background reconcile failed",
      );
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function syncBackgroundReconcileTaskRegistration(
  collectors: Record<string, CollectorState>,
): Promise<void> {
  const repositoryStore = useRepositoryStore.getState();
  const isTaskManagerAvailable = await TaskManager.isAvailableAsync();

  if (!isTaskManagerAvailable) {
    await repositoryStore.noteBackgroundTaskRegistrationState(
      "unavailable",
      "TaskManager is unavailable in this build or runtime.",
    );
    return;
  }

  const backgroundTaskStatus = await BackgroundTask.getStatusAsync();

  if (
    backgroundTaskStatus !== BackgroundTask.BackgroundTaskStatus.Available
  ) {
    await repositoryStore.noteBackgroundTaskRegistrationState(
      "restricted",
      `BackgroundTask status ${backgroundTaskStatus}`,
    );
    return;
  }

  const shouldRegister = hasPeriodicReconcileCollectors(collectors);
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      ZENTRA_BACKGROUND_RECONCILE_TASK,
    );

    if (shouldRegister && !isRegistered) {
      await BackgroundTask.registerTaskAsync(ZENTRA_BACKGROUND_RECONCILE_TASK, {
        minimumInterval: MINIMUM_INTERVAL_MINUTES,
      });
      await repositoryStore.noteBackgroundTaskRegistrationState(
        "registered",
        `Minimum interval ${MINIMUM_INTERVAL_MINUTES} min`,
      );
      return;
    }

    if (!shouldRegister && isRegistered) {
      await BackgroundTask.unregisterTaskAsync(ZENTRA_BACKGROUND_RECONCILE_TASK);
      await repositoryStore.noteBackgroundTaskRegistrationState(
        "disabled",
        "No periodic reconcile collectors enabled.",
      );
      return;
    }

    await repositoryStore.noteBackgroundTaskRegistrationState(
      shouldRegister ? "registered" : "idle",
      shouldRegister
        ? `Minimum interval ${MINIMUM_INTERVAL_MINUTES} min`
        : "No periodic reconcile collectors enabled.",
    );
  } catch (error) {
    await repositoryStore.noteBackgroundTaskRegistrationState(
      "failed",
      error instanceof Error
        ? error.message
        : "Background task registration failed.",
    );
  }
}
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import { useRepositoryStore, useSignalStore } from "@/stores";
import type { CollectorState } from "@/types/zentra";
import { runImportantCollectorReconcile } from "@/utils/background/reconcile";
import { hasEnabledCollectorCapability } from "@/utils/collectors/registry";

export const ZENTRA_BACKGROUND_RECONCILE_TASK = "zentra-background-reconcile";
const DEFAULT_MINIMUM_INTERVAL_MINUTES = 15;
const LOW_POWER_MINIMUM_INTERVAL_MINUTES = 30;
const BACKGROUND_RECONCILE_BUDGET_MS = 12_000;
const BACKGROUND_ACTIVITY_DRAIN_BATCH_SIZE = 125;
const BACKGROUND_ACTIVITY_DRAIN_MAX_BATCHES = 2;

function logBackgroundReconcile(message: string): void {
  if (__DEV__) {
    console.info(`[background-reconcile] ${message}`);
  }
}

function getMinimumIntervalMinutes(): number {
  return useSignalStore.getState().lowPowerMode
    ? LOW_POWER_MINIMUM_INTERVAL_MINUTES
    : DEFAULT_MINIMUM_INTERVAL_MINUTES;
}

function buildRegistrationMessage(minimumIntervalMinutes: number): string {
  return minimumIntervalMinutes === LOW_POWER_MINIMUM_INTERVAL_MINUTES
    ? `Minimum interval ${minimumIntervalMinutes} min (low power fallback)`
    : `Minimum interval ${minimumIntervalMinutes} min`;
}

function hasPeriodicReconcileCollectors(
  collectors: Record<string, CollectorState>,
): boolean {
  return hasEnabledCollectorCapability(collectors, [
    "backgroundPeriodic",
    "nativeBuffered",
  ]);
}

if (!TaskManager.isTaskDefined(ZENTRA_BACKGROUND_RECONCILE_TASK)) {
  TaskManager.defineTask(ZENTRA_BACKGROUND_RECONCILE_TASK, async () => {
    try {
      logBackgroundReconcile("task started");
      await runImportantCollectorReconcile({
        activityDrainBatchSize: BACKGROUND_ACTIVITY_DRAIN_BATCH_SIZE,
        activityDrainMaxBatches: BACKGROUND_ACTIVITY_DRAIN_MAX_BATCHES,
        budgetMs: BACKGROUND_RECONCILE_BUDGET_MS,
        trigger: "backgroundTask",
      });
      await useRepositoryStore.getState().noteBackgroundTaskSuccess();
      logBackgroundReconcile("task finished successfully");
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      logBackgroundReconcile(
        `task failed: ${error instanceof Error ? error.message : "Background reconcile failed"}`,
      );
      await useRepositoryStore
        .getState()
        .noteBackgroundTaskFailure(
          error instanceof Error
            ? error.message
            : "Background reconcile failed",
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
    logBackgroundReconcile("registration skipped: task manager unavailable");
    await repositoryStore.noteBackgroundTaskRegistrationState(
      "unavailable",
      "TaskManager is unavailable in this build or runtime.",
    );
    return;
  }

  const backgroundTaskStatus = await BackgroundTask.getStatusAsync();

  if (backgroundTaskStatus !== BackgroundTask.BackgroundTaskStatus.Available) {
    logBackgroundReconcile(
      `registration skipped: background task status ${backgroundTaskStatus}`,
    );
    await repositoryStore.noteBackgroundTaskRegistrationState(
      "restricted",
      `BackgroundTask status ${backgroundTaskStatus}`,
    );
    return;
  }

  const shouldRegister = hasPeriodicReconcileCollectors(collectors);
  const minimumIntervalMinutes = getMinimumIntervalMinutes();
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      ZENTRA_BACKGROUND_RECONCILE_TASK,
    );

    if (shouldRegister) {
      if (isRegistered) {
        await BackgroundTask.unregisterTaskAsync(
          ZENTRA_BACKGROUND_RECONCILE_TASK,
        );
      }

      await BackgroundTask.registerTaskAsync(ZENTRA_BACKGROUND_RECONCILE_TASK, {
        minimumInterval: minimumIntervalMinutes,
      });
      logBackgroundReconcile(
        `task registered at ${minimumIntervalMinutes} min`,
      );
      await repositoryStore.noteBackgroundTaskRegistrationState(
        "registered",
        buildRegistrationMessage(minimumIntervalMinutes),
      );
      return;
    }

    if (isRegistered) {
      await BackgroundTask.unregisterTaskAsync(
        ZENTRA_BACKGROUND_RECONCILE_TASK,
      );
      logBackgroundReconcile(
        "task unregistered: no periodic collectors enabled",
      );
      await repositoryStore.noteBackgroundTaskRegistrationState(
        "disabled",
        "No periodic reconcile collectors enabled.",
      );
      return;
    }

    logBackgroundReconcile("registration idle: no periodic collectors enabled");
    await repositoryStore.noteBackgroundTaskRegistrationState(
      "idle",
      "No periodic reconcile collectors enabled.",
    );
  } catch (error) {
    logBackgroundReconcile(
      `registration failed: ${error instanceof Error ? error.message : "Background task registration failed."}`,
    );
    await repositoryStore.noteBackgroundTaskRegistrationState(
      "failed",
      error instanceof Error
        ? error.message
        : "Background task registration failed.",
    );
  }
}

import type { ReconcileOutcome, ReconcileTrigger } from "@/types/zentra";
import { useAppStore, useRepositoryStore } from "@/stores";
import { getLatestCollectorDiagnosticForKey } from "@/utils/event-repository";
import { syncAppUsageCollector } from "@/utils/collectors/app-usage-collector";
import { syncHealthConnectCollector } from "@/utils/collectors/health-connect-collector";
import { syncSleepCollector } from "@/utils/collectors/sleep-collector";

export interface RunImportantCollectorReconcileOptions {
  activityDrainBatchSize?: number;
  activityDrainMaxBatches?: number;
  budgetMs?: number;
  trigger?: ReconcileTrigger;
}

export interface RunImportantCollectorReconcileResult {
  boundedReason: string | null;
  durationMs: number;
  outcome: ReconcileOutcome;
  trigger: ReconcileTrigger;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Reconcile failed";
}

function budgetExceeded(startedAtMs: number, budgetMs?: number): boolean {
  return budgetMs != null && Date.now() - startedAtMs >= budgetMs;
}

export async function runImportantCollectorReconcile(
  options: RunImportantCollectorReconcileOptions = {},
): Promise<RunImportantCollectorReconcileResult> {
  await useAppStore.getState().bootstrap();
  const repositoryStore = useRepositoryStore.getState();
  await repositoryStore.bootstrap();

  const trigger = options.trigger ?? "manual";
  const startedAtMs = Date.now();
  await repositoryStore.noteReconcileStart(trigger);

  const { collectors } = useAppStore.getState();
  let boundedReason: string | null = null;

  try {
    if (collectors.activity.enabled) {
      await repositoryStore.drainBufferedActivityTransitions({
        batchSize: options.activityDrainBatchSize,
        maxBatches: options.activityDrainMaxBatches,
      });
      await repositoryStore.refreshTodayData();

      const remainingBufferedEvents =
        await repositoryStore.refreshBufferedActivityQueueDepth();
      if (
        !boundedReason &&
        options.activityDrainMaxBatches != null &&
        remainingBufferedEvents > 0
      ) {
        boundedReason = "activity_queue_remaining";
      }
    }

    if (!boundedReason && budgetExceeded(startedAtMs, options.budgetMs)) {
      boundedReason = "time_budget_exhausted_before_app_usage";
    }

    if (!boundedReason && collectors.appUsage.enabled) {
      const latestDiagnostic =
        await getLatestCollectorDiagnosticForKey("appUsage");
      await syncAppUsageCollector(
        { refreshRepository: repositoryStore.refreshTodayData },
        latestDiagnostic?.lastSuccessfulSyncAt ?? null,
      );
    }

    if (!boundedReason && budgetExceeded(startedAtMs, options.budgetMs)) {
      boundedReason = "time_budget_exhausted_before_health_connect";
    }

    if (!boundedReason && collectors.healthConnect.enabled) {
      await syncHealthConnectCollector({
        refreshRepository: repositoryStore.refreshAll,
      });
    }

    if (!boundedReason && budgetExceeded(startedAtMs, options.budgetMs)) {
      boundedReason = "time_budget_exhausted_before_sleep";
    }

    if (!boundedReason && collectors.sleep.enabled) {
      await syncSleepCollector({
        refreshRepository: async () => {
          await repositoryStore.refreshSleep();
          await repositoryStore.refreshTodayData();
        },
      });
    }

    if (!collectors.activity.enabled) {
      await repositoryStore.refreshBufferedActivityQueueDepth();
    }

    const durationMs = Date.now() - startedAtMs;
    const outcome: ReconcileOutcome = boundedReason ? "bounded" : "success";

    await repositoryStore.noteReconcileFinish({
      boundedReason,
      durationMs,
      outcome,
      trigger,
    });

    return {
      boundedReason,
      durationMs,
      outcome,
      trigger,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    await repositoryStore.noteReconcileFinish({
      durationMs,
      errorMessage: getErrorMessage(error),
      outcome: "failure",
      trigger,
    });
    throw error;
  }
}

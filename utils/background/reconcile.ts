import { useAppStore, useRepositoryStore } from "@/stores";
import { getLatestCollectorDiagnosticForKey } from "@/utils/event-repository";
import { syncAppUsageCollector } from "@/utils/collectors/app-usage-collector";
import { syncHealthConnectCollector } from "@/utils/collectors/health-connect-collector";
import { syncSleepCollector } from "@/utils/collectors/sleep-collector";

export async function runImportantCollectorReconcile(): Promise<void> {
  await useAppStore.getState().bootstrap();
  await useRepositoryStore.getState().bootstrap();
  await useRepositoryStore.getState().noteReconcileRun();

  const { collectors } = useAppStore.getState();
  const repositoryStore = useRepositoryStore.getState();

  if (collectors.activity.enabled) {
    await repositoryStore.drainBufferedActivityTransitions();
    await repositoryStore.refreshTodayData();
  }

  if (collectors.appUsage.enabled) {
    const latestDiagnostic = await getLatestCollectorDiagnosticForKey(
      "appUsage",
    );
    await syncAppUsageCollector(
      { refreshRepository: repositoryStore.refreshTodayData },
      latestDiagnostic?.lastSuccessfulSyncAt ?? null,
    );
  }

  if (collectors.healthConnect.enabled) {
    await syncHealthConnectCollector({
      refreshRepository: repositoryStore.refreshAll,
    });
  }

  if (collectors.sleep.enabled) {
    await syncSleepCollector({
      refreshRepository: async () => {
        await repositoryStore.refreshSleep();
        await repositoryStore.refreshTodayData();
      },
    });
  }

  await useRepositoryStore.getState().refreshBufferedActivityQueueDepth();
}
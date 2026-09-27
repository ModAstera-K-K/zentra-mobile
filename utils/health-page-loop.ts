import type { HealthSyncPage } from "@/types/health-sync";

export interface HealthPageLoopDependencies {
  read: (cursor: string | null) => Promise<HealthSyncPage>;
  commit: (page: HealthSyncPage, index: number) => Promise<void>;
  assertActive: () => void;
}
/** Cursor advancement follows durable commit. Retries safely replay an uncommitted page. */
export async function runHealthPageLoop(
  cursor: string | null,
  deps: HealthPageLoopDependencies,
): Promise<void> {
  for (let index = 0; index < 4; index++) {
    deps.assertActive();
    const page = await deps.read(cursor);
    deps.assertActive();
    await deps.commit(page, index);
    cursor = page.reset ? null : page.cursor;
    if (!page.hasMore && !page.reset) break;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

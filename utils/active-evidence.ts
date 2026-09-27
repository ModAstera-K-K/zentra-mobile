import type { ActiveMinutesSummary } from "@/types/active-minutes";
import {
  enqueueDatabaseOperation,
  mapEventRow,
  type EventRow,
} from "@/utils/event-repository";
import { getLocalDatabase } from "@/utils/local-database";
import {
  assertRepositoryEpoch,
  repositoryEpoch,
} from "@/utils/repository-session";

/** Detail-only bounded read also includes the previous-day start of overnight activity. */
export async function activeEvidenceRows(summary: ActiveMinutesSummary) {
  const epoch = repositoryEpoch();
  const events = await enqueueDatabaseOperation(async () => {
    assertRepositoryEpoch(epoch);
    const rows = await (
      await getLocalDatabase()
    ).getAllAsync<EventRow>(
      "SELECT * FROM events WHERE id IN (SELECT value FROM json_each(?)) ORDER BY timestamp_start LIMIT 50",
      JSON.stringify(summary.recordIds.slice(0, 100)),
    );
    return rows.map(mapEventRow);
  });
  assertRepositoryEpoch(epoch);
  return events.map((event) => ({
    label: `${event.valueText ?? event.dataType} · ${event.id}`,
    value: `${event.timestampStart} – ${event.timestampEnd} · ${event.source}`,
  }));
}

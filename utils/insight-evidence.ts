import type { PersonalInsight } from "@/types/insights";
import { getEventsByIds } from "@/utils/event-repository";
import { insightDetail } from "@/utils/insight-presentation";

export async function loadInsightEvidence(insight: PersonalInsight) {
  const ids = [
    ...new Set(
      insight.observations.flatMap((observation) => observation.recordIds),
    ),
  ];
  const records = await getEventsByIds(ids.slice(0, 50));
  const detail = insightDetail(insight);
  return {
    ...detail,
    facts: [
      ...detail.facts,
      {
        label: "Supporting records",
        value: `Showing ${records.length} of ${ids.length} records. Raw source samples can be exported separately.`,
      },
    ],
    rows: [
      ...detail.rows,
      ...records.map((event) => ({
        label: event.timestampStart,
        value: `${event.valueNumeric ?? "—"} ${event.unit}; until ${event.timestampEnd}; ${event.metadata.source_app ?? event.source}; ID ${event.id}`,
      })),
    ],
  };
}

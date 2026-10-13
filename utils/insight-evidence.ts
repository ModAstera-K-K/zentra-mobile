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
  // An observation keeps at most 50 ids and the count of all its records.
  // The ids give the exact total unless one of them was cut short.
  const truncated = insight.observations.some(
    (observation) =>
      (observation.recordCount ?? 0) > observation.recordIds.length,
  );
  const total = truncated
    ? insight.observations.reduce(
        (sum, observation) =>
          sum + (observation.recordCount ?? observation.recordIds.length),
        0,
      )
    : ids.length;
  const detail = insightDetail(insight);
  return {
    ...detail,
    facts: [
      ...detail.facts,
      {
        label: "Supporting records",
        value: `Showing ${records.length} of ${total} records. Raw source samples can be exported separately.`,
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

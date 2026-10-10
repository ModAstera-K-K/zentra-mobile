import { test } from "node:test";
import assert from "node:assert/strict";
import { parseISODate, shiftISODate } from "@/utils/dates";
import { getEventsForRange } from "@/utils/event-repository";
import { loadSleepSummaryEvent } from "@/utils/rest-repository";
import { sleepSummaryEvent } from "@/utils/sleep-summary";
import {
  insertEvents,
  openTestRepository,
  ordinaryDay,
  storedEvent,
} from "./repository-harness";
import { statementLog } from "./sqlite-adapter";

const HOUR = 3_600_000;
const TODAY = "2026-09-15";
const YESTERDAY = shiftISODate(TODAY, -1);
const midnight = parseISODate(TODAY).getTime();

function sleep(
  id: string,
  startMs: number,
  endMs: number,
  fields: Parameters<typeof storedEvent>[3] = {},
) {
  return storedEvent(id, "sleep_inferred", startMs, {
    timestampEnd: new Date(endMs).toISOString(),
    valueNumeric: Math.round((endMs - startMs) / 60_000),
    unit: "minutes",
    ...fields,
  });
}

/** What the card showed before: the summary of every event of both days. */
async function summaryFromAllEvents() {
  return sleepSummaryEvent(await getEventsForRange(YESTERDAY, TODAY), TODAY);
}

test("the sleep card's typed read gives the same summary as reading every event", async (context) => {
  const adapter = await openTestRepository();
  insertEvents(adapter, [...ordinaryDay(YESTERDAY), ...ordinaryDay(TODAY)]);

  assert.equal(await loadSleepSummaryEvent(TODAY), null);
  assert.equal(await summaryFromAllEvents(), null);

  // An inferred night, then imported stages from two apps and a superseded copy.
  const steps = [
    [
      sleep("rest-inferred", midnight - HOUR / 2, midnight + 6.75 * HOUR, {
        source: "inferred",
        metadata: { rest_wake_date: TODAY, rest_algorithm_version: 2 },
      }),
    ],
    [
      sleep("stage-a1", midnight - HOUR, midnight + 2 * HOUR, {
        source: "health_connect",
        metadata: { health_platform: "Health Connect", source_app: "com.watch", record_id: "a1" },
      }),
      sleep("stage-a2", midnight + 2 * HOUR, midnight + 6 * HOUR, {
        source: "health_connect",
        metadata: { health_platform: "Health Connect", source_app: "com.watch", record_id: "a2" },
      }),
      sleep("stage-b1", midnight, midnight + 5 * HOUR, {
        source: "health_connect",
        metadata: { health_platform: "Health Connect", source_app: "com.ring", record_id: "b1" },
      }),
      sleep("stage-stale", midnight - 2 * HOUR, midnight + 7 * HOUR, {
        source: "health_connect",
        metadata: { health_platform: "Health Connect", source_app: "com.watch", stale_import: true },
      }),
    ],
    [
      sleep("rest-adjusted", midnight - HOUR, midnight + 7 * HOUR, {
        source: "inferred",
        metadata: { rest_wake_date: TODAY, rest_user_adjusted: true },
      }),
    ],
  ];
  for (const rows of steps) {
    insertEvents(adapter, rows);
    const typed = await loadSleepSummaryEvent(TODAY);
    assert.ok(typed, "a night is found");
    assert.deepEqual(typed, await summaryFromAllEvents());
  }

  const count = async (task: () => Promise<unknown>) => {
    const from = statementLog.length;
    await task();
    const issued = statementLog.slice(from);
    return {
      statements: issued.length,
      rows: issued.reduce((total, statement) => total + statement.rows, 0),
    };
  };
  const typed = await count(() => loadSleepSummaryEvent(TODAY));
  const everything = await count(summaryFromAllEvents);
  context.diagnostic(
    `typed read: ${typed.statements} statement, ${typed.rows} rows; all events: ${everything.statements} statements, ${everything.rows} rows`,
  );
  assert.deepEqual(typed, { statements: 1, rows: 6 });
  assert.ok(everything.rows > 2_000);
});

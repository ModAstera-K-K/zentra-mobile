import { test } from "node:test";
import assert from "node:assert/strict";
import { useRepositoryStore } from "@/stores";
import { refreshActiveDay } from "@/utils/active-background";
import { enumerateISODateRange, shiftISODate, toISODate } from "@/utils/dates";
import * as repository from "@/utils/event-repository";
import { getHealthSyncStates } from "@/utils/health-sync-repository";
import { loadPersonalInsights } from "@/utils/insight-repository";
import { createBatteryEvent } from "@/utils/live-event-builders";
import { reconcileRestEstimates } from "@/utils/rest-repository";
import {
  insertEvents,
  openTestRepository,
  ordinaryDay,
  storedEvent,
} from "./repository-harness";
import { queryPlan, statementLog } from "./sqlite-adapter";

const NOW = new Date(2026, 8, 15, 15, 0, 0).getTime();

// Tables that grow with every stored sample. A statement that walks one of
// them from end to end gets slower for as long as the app is in use.
const GROWING_TABLES = ["events", "collector_diagnostics"];

/**
 * Statements known to walk a growing table today. Each names the plan item
 * that removes it; the test fails when an entry stops matching, so fixed
 * statements leave this list.
 */
const KNOWN = [
  {
    sql: "FROM collector_diagnostics diagnostics INNER JOIN",
    why: "latest diagnostic per collector groups the whole table (029 item 3.8)",
  },
  {
    sql: "SELECT * FROM collector_diagnostics ORDER BY recorded_at DESC LIMIT ?",
    why: "diagnostics history sorts the whole table (029 item 3.8)",
  },
  {
    sql: "SELECT COUNT(*) as count FROM events",
    why: "seed check counts every event (029 item 4.3)",
  },
  {
    sql: "WHERE data_type IN ('app_usage','sleep_inferred','exercise_session','steps') AND timestamp_start < ?",
    why: "aggregate rebuild reads all earlier rows of four types (029 item 3.1)",
  },
  {
    sql: "FROM health_sync_state s LEFT JOIN events e ON e.source='health_connect'",
    why: "health sync states read every imported record (029 item 6.1)",
  },
];

/** Statements the rules flag that are cheap for a reason the plan text cannot show. */
const ACCEPTED = [
  {
    sql: "SELECT * FROM events WHERE data_type = ? ORDER BY timestamp_start DESC LIMIT 1",
    why: "reads one row from the end of the index",
  },
  {
    sql: "SELECT DISTINCT date(timestamp_end,'localtime') AS date FROM events WHERE data_type='sleep_inferred'",
    why: "sleep rows are a handful per night",
  },
];
const LISTED = [...KNOWN, ...ACCEPTED];

function squash(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

/** Table names and aliases under which a statement reads a growing table. */
function growingTableNames(sql: string): Set<string> {
  const names = new Set<string>();
  const pattern = new RegExp(
    `(?:FROM|JOIN)\\s+(${GROWING_TABLES.join("|")})\\b(?:\\s+(?:AS\\s+)?(?!WHERE|INNER|LEFT|JOIN|ON|ORDER|GROUP|LIMIT)(\\w+))?`,
    "gi",
  );
  for (const match of sql.matchAll(pattern)) {
    names.add(match[1]);
    if (match[2]) names.add(match[2]);
  }
  return names;
}

function problems(sql: string, plan: string[]): string[] {
  const names = growingTableNames(sql);
  return plan.filter((step) => {
    const [, kind, table] = /^(SCAN|SEARCH) (\w+)/.exec(step) ?? [];
    if (!names.has(table)) return false;
    if (kind === "SCAN") return true;
    // Every row of one type or source, with no time range at all.
    if (/\((?:data_type|source)=\?\)/.test(step)) return true;
    // A time range with an upper bound only starts at the first stored row.
    return /timestamp_start<\?/.test(step) && !/timestamp_start>\?/.test(step);
  });
}

test("no statement walks a growing table from end to end, beyond the listed ones", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: NOW });
  const adapter = await openTestRepository();
  const today = toISODate(new Date());
  const weekAgo = shiftISODate(today, -6);
  for (const date of enumerateISODateRange(weekAgo, shiftISODate(today, -1)))
    insertEvents(adapter, ordinaryDay(date));
  insertEvents(adapter, [
    ...ordinaryDay(today, NOW),
    storedEvent("sleep-last-night", "sleep_inferred", NOW - 15 * 3_600_000, {
      timestampEnd: new Date(NOW - 8 * 3_600_000).toISOString(),
      valueNumeric: 420,
      unit: "minutes",
    }),
  ]);

  const store = () => useRepositoryStore.getState();
  const battery = createBatteryEvent({
    batteryLevel: 0.8,
    batteryStateLabel: "Unplugged",
    lowPowerMode: false,
  });
  await store().bootstrap();
  await repository.appendEventsForCollector("deviceState", [battery], "Battery snapshot refreshed");
  await store().refreshTodayData(true);
  await store().refreshAll();
  await repository.getDailyAggregatesForRange(weekAgo, today);
  await repository.getDailyAggregatesForRange(weekAgo, today);
  await repository.getEventsForRange(shiftISODate(today, -1), today);
  await repository.getEventsOverlappingDay(today);
  await repository.getEventsForDayScoring(today);
  await repository.getEventsForDayScoring(today, { maximaOnly: true });
  await repository.getEventsOfTypeForRange("sleep_inferred", shiftISODate(today, -1), today);
  await repository.getHealthStepEventsForRange(weekAgo, today);
  await repository.getEventsCarriedIntoDay(today);
  await repository.getLatestEventByType("sleep_inferred");
  await repository.getGroupedEventsForRange(today, today);
  await repository.getTodayLiveSnapshot();
  await repository.getRepositoryFirstDate();
  await repository.getStoredEventCount();
  await repository.getLatestCollectorDiagnosticForKey("deviceState");
  await repository.getCollectorDiagnosticHistoryForKey("deviceState");
  await repository.getRepositoryRevision(weekAgo, today);
  await repository.getRepositoryGeneration();
  await repository.getEventsByIds([battery.id]);
  await reconcileRestEstimates(new Date());
  await getHealthSyncStates();
  await loadPersonalInsights(today, await repository.getRepositoryRevision());
  await refreshActiveDay(shiftISODate(today, -1), new AbortController().signal, false);

  const found = new Map<string, string[]>();
  let checked = 0;
  for (const statement of statementLog) {
    const sql = squash(statement.sql);
    if (!/^(SELECT|WITH|UPDATE|DELETE)\b/i.test(sql) || found.has(sql)) continue;
    checked++;
    found.set(sql, problems(sql, queryPlan(adapter.db, statement)));
  }
  context.diagnostic(`${checked} distinct statements checked`);

  const unexpected: string[] = [];
  for (const [sql, steps] of found) {
    if (steps.length && !LISTED.some((listed) => sql.includes(listed.sql)))
      unexpected.push(`${sql}\n    ${steps.join("\n    ")}`);
  }
  assert.deepEqual(unexpected, [], "statements that walk a growing table");

  const stale = LISTED.filter(
    (listed) =>
      ![...found].some(([sql, steps]) => steps.length && sql.includes(listed.sql)),
  ).map((listed) => listed.sql);
  assert.deepEqual(stale, [], "listed statements that are no longer flagged: remove them");
});

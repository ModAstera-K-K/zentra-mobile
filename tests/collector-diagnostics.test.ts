import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getLatestCollectorDiagnostics,
  pruneCollectorDiagnostics,
} from "@/utils/event-repository";
import { openTestRepository } from "./repository-harness";
import { statementLog } from "./sqlite-adapter";

/** How the latest row per collector was read before: a pass over every row. */
const LATEST_BY_GROUPING = `SELECT diagnostics.id FROM collector_diagnostics diagnostics
  INNER JOIN (
    SELECT collector_key, MAX(recorded_at) AS max_recorded_at
    FROM collector_diagnostics GROUP BY collector_key
  ) latest ON diagnostics.collector_key = latest.collector_key
    AND diagnostics.recorded_at = latest.max_recorded_at
  ORDER BY diagnostics.collector_key ASC`;

test("diagnostics are pruned to each collector's newest rows and its latest success", async () => {
  const adapter = await openTestRepository();
  const insert = adapter.db.prepare(
    `INSERT INTO collector_diagnostics (id, collector_key, status, message,
      event_count, consecutive_failures, recorded_at) VALUES (?, ?, ?, ?, 1, 0, ?)`,
  );
  const base = Date.parse("2026-09-01T00:00:00Z");
  const seed = (key: string, rows: number, status: (index: number) => string) => {
    adapter.db.exec("BEGIN");
    for (let index = 0; index < rows; index++)
      insert.run(
        `${key}-${index}`,
        key,
        status(index),
        "Recorded",
        new Date(base + index * 1000).toISOString(),
      );
    adapter.db.exec("COMMIT");
  };
  // Its only successes are the 100 oldest rows, far behind the newest 200.
  seed("deviceState", 450, (index) => (index < 100 ? "success" : "error"));
  seed("steps", 150, () => "success");
  seed("appUsage", 6_000, () => "success");

  const ids = (sql: string) =>
    adapter.db.prepare(sql).all().map((row) => String(row.id));
  const count = (key: string) =>
    Number(
      adapter.db
        .prepare("SELECT COUNT(*) AS rows FROM collector_diagnostics WHERE collector_key = ?")
        .get(key)?.rows,
    );
  const latest = async () => (await getLatestCollectorDiagnostics()).map((row) => row.id);
  const expectedLatest = ["appUsage-5999", "deviceState-449", "steps-149"];

  assert.deepEqual(await latest(), expectedLatest);
  assert.deepEqual(ids(LATEST_BY_GROUPING), expectedLatest);

  assert.equal(await pruneCollectorDiagnostics({ budgetMs: 0 }), "partial");
  assert.equal(count("appUsage"), 6_000);

  const from = statementLog.length;
  assert.equal(await pruneCollectorDiagnostics(), "complete");
  const deletes = statementLog
    .slice(from)
    .filter((statement) => statement.sql.startsWith("DELETE"));
  // appUsage takes two chunks of at most 5,000 rows; the others one each.
  assert.equal(deletes.length, 4);

  assert.equal(count("appUsage"), 200);
  assert.equal(count("steps"), 150);
  assert.equal(count("deviceState"), 201);
  assert.deepEqual(
    ids(
      "SELECT id FROM collector_diagnostics WHERE collector_key = 'deviceState' AND status = 'success'",
    ),
    ["deviceState-99"],
    "the latest success survives although it is older than the kept rows",
  );
  assert.deepEqual(
    ids(
      "SELECT id FROM collector_diagnostics WHERE collector_key = 'appUsage' ORDER BY recorded_at LIMIT 1",
    ),
    ["appUsage-5800"],
  );
  assert.deepEqual(await latest(), expectedLatest);

  assert.equal(await pruneCollectorDiagnostics(), "complete");
  assert.equal(count("appUsage") + count("steps") + count("deviceState"), 551);
});

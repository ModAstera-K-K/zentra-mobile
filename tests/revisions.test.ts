import { URL } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { REVISION_SCHEMA } from "@/utils/repository-revision";
import { reconcileHealthSnapshot } from "@/utils/health-snapshot";
import { upsertHealthEvent } from "@/utils/health-sync-sql";
import { readFileSync } from "node:fs";

test("migration and revision triggers are transactional and track corrections/deletions", async () => {
  const db = new DatabaseSync(":memory:");
  const source = readFileSync(
    new URL("../utils/local-database.ts", import.meta.url),
    "utf8",
  );
  db.exec(source.match(/const SCHEMA_SQL = `([\s\S]*?)`;/)![1]);
  db.exec(REVISION_SCHEMA);
  db.exec(REVISION_SCHEMA);
  const adapter = {
    runAsync: async (sql: string, ...values: unknown[]) =>
      db.prepare(sql).run(...(values as never[])),
    getFirstAsync: async (sql: string, ...values: unknown[]) =>
      db.prepare(sql).get(...(values as never[])),
    getAllAsync: async (sql: string, ...values: unknown[]) =>
      db.prepare(sql).all(...(values as never[])),
  };
  const row = {
    id: "health-a",
    timestampStart: "2026-09-01T10:00:00Z",
    timestampEnd: "2026-09-01T11:00:00Z",
    dataType: "steps" as const,
    source: "health_connect" as const,
    valueNumeric: 10,
    unit: "count",
    confidence: 1,
    metadata: { record_id: "a" },
    schemaVersion: 1,
    createdAt: "2026-09-01T11:00:00Z",
  };
  const revision = () =>
    Number(
      db
        .prepare("SELECT COALESCE(MAX(revision),0) AS rev FROM event_changes")
        .get()!.rev,
    );
  await upsertHealthEvent(adapter as never, row);
  const first = revision();
  await upsertHealthEvent(adapter as never, row);
  assert.equal(revision(), first);
  await upsertHealthEvent(adapter as never, { ...row, valueNumeric: 20 });
  assert.ok(revision() > first);
  await reconcileHealthSnapshot(
    adapter as never,
    "steps",
    [],
    "2026-09-01T00:00:00Z",
    "2026-09-02T00:00:00Z",
    true,
    true,
  );
  assert.equal(
    db
      .prepare(
        "SELECT json_extract(metadata,'$.stale_import') AS stale FROM events",
      )
      .get()!.stale,
    1,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM events").get()!.count,
    1,
  );
  await upsertHealthEvent(adapter as never, row);
  assert.equal(
    db
      .prepare(
        "SELECT json_extract(metadata,'$.stale_import') AS stale FROM events",
      )
      .get()!.stale,
    null,
  );
  const changed = revision();
  db.exec("BEGIN; DELETE FROM events; ROLLBACK;");
  assert.equal(revision(), changed);
  db.exec("DELETE FROM events");
  assert.ok(revision() > changed);
  assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 2);
  db.close();
});

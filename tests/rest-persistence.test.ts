import { test } from "node:test";
import assert from "node:assert/strict";
import type { SQLiteDatabase } from "expo-sqlite";
import { commitRestEstimates, upsertRestEvent } from "@/utils/rest-inference-sql";
import { inferSleepEvents } from "@/utils/sleep-inference";
import { createRestAdjustment } from "@/utils/rest-adjustment";
import { resolvedSleepMinutes } from "@/utils/source-resolution";
import { readDataRevision } from "@/utils/repository-revision";
import { activityDatabase } from "./activity-history-fixtures";
import { stillNight, restNow } from "./rest-fixtures";
import { restRows } from "./rest-persistence-fixtures";

const date = "2026-09-30";

test("reconciliation is idempotent and late evidence replaces the same derived identity with changed-date revisions", async () => {
  const fixture = activityDatabase(), db = fixture.adapter as unknown as SQLiteDatabase;
  try {
    const next = inferSleepEvents(stillNight(), date, restNow());
    assert.equal((await commitRestEstimates(db, next, [], [date], () => {})).length, 1);
    const revision = await readDataRevision(db);
    const replay = next.map((e) => ({ ...e, createdAt: new Date(restNow().getTime() + 60000).toISOString() }));
    assert.deepEqual(await commitRestEstimates(db, replay, restRows(fixture.db), [date], () => {}), []);
    assert.equal(await readDataRevision(db), revision);
    const corrected = inferSleepEvents(stillNight(undefined, "2026-09-30T06:00:00"), date, restNow());
    const changed = await commitRestEstimates(db, corrected, restRows(fixture.db), [date], () => {});
    assert.equal(changed.length, 2);
    assert.equal(restRows(fixture.db).length, 1);
    assert.equal(restRows(fixture.db)[0].valueNumeric, 420);
    assert.ok(Number(await readDataRevision(db)) > Number(revision));
    assert.equal(resolvedSleepMinutes(restRows(fixture.db), date), 420);
  } finally { fixture.db.close(); }
});

test("withdrawal invalidates only owned automatic estimates, preserves originals and does not repeat revisions", async () => {
  const fixture = activityDatabase(), db = fixture.adapter as unknown as SQLiteDatabase;
  try {
    const next = inferSleepEvents(stillNight(), date, restNow());
    const legacy = { ...next[0], id: `sleep-inferred-${date}`, metadata: { inferred_for_date: date } };
    await upsertRestEvent(db, legacy);
    await upsertRestEvent(db, { ...next[0], id: "unowned-inferred" });
    const adjusted = createRestAdjustment(date, "2026-09-29 23:30", "2026-09-30 06:30", restNow());
    await upsertRestEvent(db, adjusted);
    await commitRestEstimates(db, next, restRows(fixture.db), [date], () => {});
    assert.equal(restRows(fixture.db).find((e) => e.id === legacy.id)?.metadata.stale_import, true);
    await commitRestEstimates(db, [], restRows(fixture.db), [date], () => {});
    assert.equal(restRows(fixture.db).length, 4);
    assert.equal(restRows(fixture.db).find((e) => e.id === next[0].id)?.metadata.stale_import, true);
    assert.equal(restRows(fixture.db).find((e) => e.id === adjusted.id)?.metadata.stale_import, undefined);
    assert.equal(restRows(fixture.db).find((e) => e.id === "unowned-inferred")?.metadata.stale_import, undefined);
    const revision = await readDataRevision(db);
    await commitRestEstimates(db, [], restRows(fixture.db), [date], () => {});
    assert.equal(await readDataRevision(db), revision);
  } finally { fixture.db.close(); }
});

test("a cancelled transaction rolls back derived rows and their revisions", async () => {
  const fixture = activityDatabase(), db = fixture.adapter as unknown as SQLiteDatabase;
  try {
    let calls = 0;
    await assert.rejects(commitRestEstimates(db, inferSleepEvents(stillNight(), date, restNow()), [], [date], () => {
      if (++calls === 3) throw new Error("Repository was cleared");
    }));
    assert.equal(restRows(fixture.db).length, 0);
    assert.equal(await readDataRevision(db), "0");
  } finally { fixture.db.close(); }
});

test("resetting an adjustment restores automatic totals and a new save reactivates the same adjustment identity", async () => {
  const fixture = activityDatabase(), db = fixture.adapter as unknown as SQLiteDatabase;
  try {
    const next = inferSleepEvents(stillNight(), date, restNow());
    await commitRestEstimates(db, next, [], [date], () => {});
    const adjusted = createRestAdjustment(date, "2026-09-29 23:30", "2026-09-30 06:30", restNow());
    await upsertRestEvent(db, adjusted);
    assert.equal(resolvedSleepMinutes(restRows(fixture.db), date), 420);
    fixture.db.prepare("UPDATE events SET metadata=json_set(metadata,'$.stale_import',json('true')) WHERE id=?").run(adjusted.id);
    assert.equal(resolvedSleepMinutes(restRows(fixture.db), date), 480);
    await upsertRestEvent(db, adjusted);
    assert.equal(resolvedSleepMinutes(restRows(fixture.db), date), 420);
    assert.equal(restRows(fixture.db).length, 2);
  } finally { fixture.db.close(); }
});

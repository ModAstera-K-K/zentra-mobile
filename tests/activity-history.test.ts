import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activityDatabase,
  activityPage,
  activityRecord,
} from "./activity-history-fixtures";
import {
  emptyActivityHistory,
  prepareActivityHistory,
  advanceActivityHistory,
  activityHistoryWindows,
} from "@/utils/activity-history-windows";
import {
  commitActivityHistoryPage,
  readActivityHistoryState,
  upsertActivityEvent,
} from "@/utils/activity-history-sql";
import { runActivityHistoryLoop } from "@/utils/activity-history-loop";
import {
  runActivityHistoryJob,
  type ActivityHistoryJob,
} from "@/utils/activity-history-job";
import {
  activityHistoryGeneration,
  assertActivityHistoryGeneration,
  cancelActivityHistory,
  joinActivityHistoryJob,
} from "@/utils/activity-history-session";
import {
  resolveActiveMinutes,
  resolveActiveMinutesAsync,
} from "@/utils/active-minutes";
import {
  activityRevision,
  isActiveSummaryCurrent,
  summaryRevision,
} from "@/utils/active-minutes-cache";
import { loadActivityContext } from "@/utils/activity-context";
import { activityHistoryDescription } from "@/utils/activity-history-presentation";
import {
  selectResolvedStepEvents,
  resolveStepTotal,
} from "@/utils/source-resolution";
import { groupExportEvents } from "@/utils/export-data";
import { event } from "./fixtures";
import type { ActivityHistoryState } from "@/types/activity-history";

const now = new Date("2026-09-28T03:00:00.000Z");

test("completed motion snapshots retire superseded classifications while empty or interrupted reads retain raw evidence", async () => {
  const { db, adapter } = activityDatabase();
  const window = {
    start: "2026-09-25T09:00:00.000Z",
    end: "2026-09-25T10:00:00.000Z",
    cursor: null,
  };
  const state = { ...emptyActivityHistory(), windows: [window] };
  const live = activityRecord(window.start, "enter", "walking", "live");
  await upsertActivityEvent(adapter as never, live);
  const empty = activityPage(window);
  await commitActivityHistoryPage(
    adapter as never,
    [],
    advanceActivityHistory(state, empty, now),
    () => {},
    { window, page: empty },
  );
  assert.equal(
    JSON.parse(
      db.prepare("SELECT metadata FROM events WHERE id=?").get(live.id)!
        .metadata as string,
    ).stale_import,
    false,
  );
  const unknown = activityRecord(window.start, "enter", "unknown");
  const partial = activityPage(window, {
    hasMore: true,
    nextCursor: "continue",
  });
  const pending = advanceActivityHistory(state, partial, now);
  await commitActivityHistoryPage(
    adapter as never,
    [unknown],
    pending,
    () => {},
    { window, page: partial },
  );
  assert.equal(
    JSON.parse(
      db.prepare("SELECT metadata FROM events WHERE id=?").get(live.id)!
        .metadata as string,
    ).stale_import,
    false,
  );
  await assert.rejects(
    commitActivityHistoryPage(
      adapter as never,
      [],
      advanceActivityHistory(pending, empty, now),
      () => {
        throw new Error("cancelled");
      },
      { window: pending.windows[0], page: empty },
    ),
    /cancelled/,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM activity_history_records").get()!.n,
    1,
  );
  await commitActivityHistoryPage(
    adapter as never,
    [],
    advanceActivityHistory(pending, empty, now),
    () => {},
    { window: pending.windows[0], page: empty },
  );
  assert.equal(
    JSON.parse(
      db.prepare("SELECT metadata FROM events WHERE id=?").get(live.id)!
        .metadata as string,
    ).stale_import,
    true,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM events").get()!.n,
    2,
    "raw records remain inspectable",
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM activity_history_records").get()!.n,
    0,
  );
  db.close();
});

test("live and historical deliveries pair, legacy ISO formatting deduplicates, and distinct recognizers stay separate", () => {
  const start = activityRecord(
    "2026-09-25T09:00:00Z",
    "enter",
    "walking",
    "live",
  );
  const end = activityRecord("2026-09-25T09:20:00.000Z", "exit");
  const summary = resolveActiveMinutes("2026-09-25", [
    start,
    end,
    { ...start, id: "duplicate", timestampStart: "2026-09-25T09:00:00.000Z" },
  ]);
  assert.equal(summary.supportedMinutes, 20);
  assert.equal(
    summary.contributions.reduce((n, c) => n + c.minutes, 0),
    20,
  );
  const legacy = {
    ...start,
    metadata: { transition: "enter", confidence: 0.95 },
  };
  assert.equal(
    resolveActiveMinutes("2026-09-25", [legacy, end]).supportedMinutes,
    20,
  );
  assert.equal(
    resolveActiveMinutes("2026-09-25", [
      start,
      {
        ...end,
        metadata: { ...end.metadata, activity_stream: "other:recognizer" },
      },
    ]).supportedMinutes,
    null,
  );
  assert.equal(
    resolveActiveMinutes("2026-09-25", [start]).supportedMinutes,
    null,
  );
  assert.equal(groupExportEvents([start, end]).activity?.length, 2);
  const androidLive = {
    ...start,
    metadata: { transition: "enter", confidence: 0.95 },
  };
  const androidBuffered = {
    ...end,
    metadata: { transition: "exit", confidence: 0.95 },
  };
  assert.equal(
    resolveActiveMinutes("2026-09-25", [androidLive, androidBuffered])
      .supportedMinutes,
    20,
  );
});

test("unknown motion closes known walking; neither unknown nor vehicle time contributes", () => {
  const records = [
    activityRecord("2026-09-25T01:00:00Z", "enter"),
    activityRecord("2026-09-25T01:10:00Z", "exit"),
    activityRecord("2026-09-25T01:10:00Z", "enter", "unknown"),
    activityRecord("2026-09-25T01:30:00Z", "enter", "in_vehicle"),
  ];
  assert.equal(
    resolveActiveMinutes("2026-09-25", records).supportedMinutes,
    10,
  );
});

test("a real next-day exit closes both sides of midnight and carries through adjacent-day repository context", async () => {
  const date = "2026-09-25";
  const start = activityRecord(
    new Date(`${date}T23:50:00`).toISOString(),
    "enter",
    "walking",
    "live",
  );
  const end = activityRecord(
    new Date("2026-09-26T00:10:00").toISOString(),
    "exit",
  );
  assert.equal(resolveActiveMinutes(date, [start, end]).supportedMinutes, 10);
  assert.equal(
    resolveActiveMinutes("2026-09-26", [start, end]).supportedMinutes,
    10,
  );
  const { db, adapter } = activityDatabase();
  await upsertActivityEvent(adapter as never, end);
  const context = await loadActivityContext(
    adapter as never,
    date,
    (row) => row as never,
  );
  assert.equal(context.length, 1);
  db.close();
});

test("history windows prioritize Today, use seven elapsed days, and honor DST calendar boundaries", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const end = new Date("2026-03-10T12:00:00");
    const state = prepareActivityHistory(null, end);
    assert.equal(
      state.windows[0].start,
      new Date("2026-03-10T00:00:00").toISOString(),
    );
    const total = state.windows.reduce(
      (n, w) => n + Date.parse(w.end) - Date.parse(w.start),
      0,
    );
    assert.equal(total, 7 * 24 * 3600_000);
    assert.ok(
      state.windows.some(
        (w) => Date.parse(w.end) - Date.parse(w.start) === 23 * 3600_000,
      ),
    );
    assert.equal(activityHistoryWindows(end, end).length, 0);
    const fall = activityHistoryWindows(
      new Date("2026-11-01T00:00:00"),
      new Date("2026-11-02T00:00:00"),
    );
    assert.equal(
      Date.parse(fall[0].end) - Date.parse(fall[0].start),
      25 * 3600_000,
    );
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("bounded imports checkpoint empty pages, resume a cursor, and avoid repeated reads on immediate navigation", async () => {
  let state = prepareActivityHistory(null, now);
  const initial = state.windows[0];
  const reads: (string | null)[] = [];
  await runActivityHistoryLoop(state, {
    now: () => now,
    maxPages: 2,
    assertActive: () => {},
    read: async (w) => {
      reads.push(w.cursor);
      return activityPage(w, {
        hasMore: true,
        nextCursor: `page-${reads.length}`,
      });
    },
    commit: async (_, next) => {
      state = next;
    },
  });
  assert.deepEqual(reads, [null, "page-1"]);
  assert.equal(state.windows[0].cursor, "page-2");
  const resumed = prepareActivityHistory(
    state,
    new Date(now.getTime() + 60_000),
  );
  assert.equal(resumed.windows[0].start, initial.start);
  assert.equal(resumed.windows[0].cursor, "page-2");
  state = { ...state, windows: [{ ...initial, cursor: null }] };
  const finished = advanceActivityHistory(state, activityPage(initial), now);
  assert.equal(finished.queriedThrough, initial.end);
  assert.equal(finished.status, "ready");
  assert.equal(
    prepareActivityHistory(finished, new Date(now.getTime() + 10_000)).windows
      .length,
    0,
  );
  assert.throws(
    () =>
      advanceActivityHistory(
        state,
        activityPage(initial, { hasMore: true }),
        now,
      ),
    /did not advance/,
  );
});

test("expired pending ranges are bounded to retained history; permission-delayed first imports still begin", () => {
  const expired = prepareActivityHistory(
    null,
    new Date(now.getTime() - 10 * 86400_000),
  );
  const restarted = prepareActivityHistory(
    { ...expired, status: "permission" },
    now,
  );
  assert.ok(restarted.windows.length);
  assert.ok(restarted.truncated);
  assert.ok(
    restarted.windows.every(
      (w) => Date.parse(w.start) >= now.getTime() - 7 * 86400_000,
    ),
  );
  const old = {
    ...emptyActivityHistory(),
    queriedThrough: "2026-09-01T00:00:00.000Z",
    status: "ready" as const,
  };
  assert.ok(prepareActivityHistory(old, now).truncated);
});

test("records and checkpoints commit atomically; retries enrich one raw identity without replay revisions", async () => {
  const { db, adapter } = activityDatabase();
  let state = prepareActivityHistory(null, now);
  state = advanceActivityHistory(state, activityPage(state.windows[0]), now);
  const live = activityRecord(
    "2026-09-25T09:00:00Z",
    "enter",
    "walking",
    "live",
  );
  await upsertActivityEvent(adapter as never, live);
  const historical = activityRecord("2026-09-25T09:00:00.000Z", "enter");
  await commitActivityHistoryPage(
    adapter as never,
    [historical],
    state,
    () => {},
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM events").get()!.n, 1);
  const row = db.prepare("SELECT * FROM events").get()!;
  assert.equal(row.id, live.id);
  assert.equal(row.source, "activity_recognition");
  const metadata = JSON.parse(row.metadata as string);
  assert.ok(metadata.activity_live && metadata.activity_history);
  const revision = await activityRevision(adapter as never, "2026-09-25");
  await commitActivityHistoryPage(
    adapter as never,
    [historical],
    state,
    () => {},
  );
  assert.equal(
    await activityRevision(adapter as never, "2026-09-25"),
    revision,
  );
  let guards = 0;
  await assert.rejects(
    commitActivityHistoryPage(
      adapter as never,
      [activityRecord("2026-09-25T09:20:00Z", "exit")],
      { ...state, queriedThrough: "later" },
      () => {
        if (++guards === 3) throw new Error("interrupted");
      },
    ),
    /interrupted/,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM events").get()!.n, 1);
  assert.equal(
    (await readActivityHistoryState(adapter as never))!.queriedThrough,
    state.queriedThrough,
  );
  await commitActivityHistoryPage(
    adapter as never,
    [],
    { ...state, message: "Empty success" },
    () => {},
  );
  assert.equal(
    (await readActivityHistoryState(adapter as never))!.message,
    "Empty success",
  );
  assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 4);
  db.close();
});

test("same-count corrections and deletion invalidate adjacent summaries and dependent calibration", async () => {
  const { db, adapter } = activityDatabase();
  const record = activityRecord(
    new Date("2026-09-25T23:50:00").toISOString(),
    "enter",
  );
  await upsertActivityEvent(adapter as never, record);
  const revision = await summaryRevision(adapter as never, "2026-09-26");
  const summary = { ...resolveActiveMinutes("2026-09-26", [record]), revision };
  assert.ok(
    await isActiveSummaryCurrent(
      adapter as never,
      summary.date,
      JSON.stringify(summary),
    ),
  );
  const calibration = await summaryRevision(adapter as never, "2026-10-10");
  await upsertActivityEvent(adapter as never, {
    ...record,
    confidence: 0.35,
    metadata: { ...record.metadata, confidence: 0.35 },
  });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM events").get()!.n, 1);
  assert.equal(
    await isActiveSummaryCurrent(
      adapter as never,
      summary.date,
      JSON.stringify(summary),
    ),
    false,
  );
  assert.notEqual(
    await summaryRevision(adapter as never, "2026-10-10"),
    calibration,
  );
  const changed = await activityRevision(adapter as never, "2026-09-25");
  db.exec("DELETE FROM events");
  assert.notEqual(
    await activityRevision(adapter as never, "2026-09-25"),
    changed,
  );
  assert.equal(
    await isActiveSummaryCurrent(
      adapter as never,
      summary.date,
      JSON.stringify({ ...summary, calculationVersion: 2 }),
    ),
    false,
  );
  db.close();
});

test("one job serves simultaneous triggers and disable/wipe blocks a delayed native result", async () => {
  cancelActivityHistory();
  let queries = 0,
    commits = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const task = (generation: number) =>
    runActivityHistoryLoop(prepareActivityHistory(null, now), {
      assertActive: () => assertActivityHistoryGeneration(generation),
      read: async (w) => {
        queries++;
        await gate;
        return activityPage(w);
      },
      commit: async () => {
        commits++;
      },
    });
  const first = joinActivityHistoryJob(task),
    second = joinActivityHistoryJob(task);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(queries, 1);
  cancelActivityHistory();
  release();
  await assert.rejects(first, /cancelled/);
  assert.equal(commits, 0);
  assert.equal(await joinActivityHistoryJob(async () => 7), 7);
});

test("permission denial never queries history; read failure differs from successful empty history", async () => {
  let state: ActivityHistoryState | null = null,
    reads = 0;
  const deps: ActivityHistoryJob = {
    now: () => now,
    maxPages: 1,
    load: async () => state,
    permission: async () => "blocked",
    assertActive: () => {},
    save: async (next) => {
      state = next;
    },
    refresh: async () => {},
    read: async () => {
      reads++;
      throw new Error("Core Motion query failed");
    },
    commit: async (_, next) => {
      state = next;
    },
  };
  await runActivityHistoryJob(deps);
  assert.equal(reads, 0);
  assert.equal((state as ActivityHistoryState | null)?.status, "permission");
  await assert.rejects(
    runActivityHistoryJob({ ...deps, permission: async () => "granted" }),
    /query failed/,
  );
  assert.equal((state as ActivityHistoryState | null)?.status, "error");
  assert.match(activityHistoryDescription(state, true), /Read failed/);
  await runActivityHistoryJob({
    ...deps,
    permission: async () => "granted",
    read: async (w) => activityPage(w),
  });
  assert.equal((state as ActivityHistoryState | null)?.status, "importing");
  assert.equal(
    (state as ActivityHistoryState | null)?.message,
    "No motion records in the latest query window.",
  );
  assert.match(activityHistoryDescription(state, false), /paused/);
});

test("PR10 step regressions stay fixed: resets, duplicate health providers, and phone-only dates", () => {
  const reset = [
    event("a", 100, "sensor", { step_delta: 100 }),
    event("b", 50, "sensor", { step_delta: 50 }),
  ];
  assert.equal(resolveStepTotal(reset), 150);
  const providers = [
    event("p1", 1000, "health_connect", { source_app: "phone" }),
    event("p2", 1000, "health_connect", { source_app: "watch" }),
  ];
  assert.equal(resolveStepTotal(providers), 1000);
  const mixed = [
    providers[0],
    { ...reset[0], timestampStart: "2026-09-28T03:00:00Z" },
  ];
  assert.equal(selectResolvedStepEvents(mixed).length, 2);
});

test("dense native history yields cooperative work and obsolete range calculations cancel", async () => {
  const records = Array.from({ length: 3000 }, (_, i) =>
    activityRecord(
      new Date(
        new Date("2026-09-25T00:00:00").getTime() + i * 20_000,
      ).toISOString(),
      i % 2 ? "exit" : "enter",
    ),
  );
  const abort = new AbortController();
  let ticks = 0;
  const heartbeat = setInterval(() => {
    ticks++;
  }, 0);
  try {
    const actual = await resolveActiveMinutesAsync("2026-09-25", records);
    assert.equal(
      actual.supportedMinutes,
      resolveActiveMinutes("2026-09-25", records).supportedMinutes,
    );
    assert.ok(ticks > 0);
    abort.abort();
    await assert.rejects(
      resolveActiveMinutesAsync("2026-09-25", records, "0", abort.signal),
      /cancelled/i,
    );
  } finally {
    clearInterval(heartbeat);
  }
  assert.equal(activityHistoryGeneration() >= 0, true);
});

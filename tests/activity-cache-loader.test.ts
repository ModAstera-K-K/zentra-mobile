import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  loadActivityHistoryFrom,
  type ActivityCacheStore,
  type ActivityHistory,
  type ActivityHistoryOptions,
} from "@/utils/activity-cache-loader";
import { emptyTrendDaySummary } from "@/utils/trend-day-summary";
import {
  activitySamplesKey,
  activityTrendKey,
  readActivityCacheManifest,
  readActivityCacheRevision,
} from "@/utils/activity-cache-manifest";
import { encodeActivityHourSamples } from "@/utils/activity-hour-samples";
import { buildActivityScoreMaxima } from "@/utils/activity-intensity";
import { enumerateISODateRange, shiftISODate } from "@/utils/dates";
import {
  ACTIVE_TIMING_CHANGE_TYPE,
  REVISION_SCHEMA,
} from "@/utils/repository-revision";

const START = "2026-08-01";
const END = "2026-09-30";
const SAMPLES_FROM = "2026-09-04"; // the days a pattern grid would draw

/**
 * Stored days in real SQLite, so staleness follows the production manifest
 * query, with scoring replaced by a counter: `steps` for a day is how many
 * times its events were changed.
 */
function createStore(firstDate: string | null = START) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE events(id TEXT,source TEXT,metadata TEXT,timestamp_start TEXT,timestamp_end TEXT,data_type TEXT)",
  );
  db.exec(REVISION_SCHEMA);
  const adapter = {
    getAllAsync: async (sql: string, ...values: unknown[]) =>
      db.prepare(sql).all(...(values as never[])),
    getFirstAsync: async (sql: string, ...values: unknown[]) =>
      db.prepare(sql).get(...(values as never[])),
  } as unknown as SQLiteDatabase;
  const writes = new Map<string, number>();
  const scored: { date: string; withSamples: boolean }[] = [];
  let active = true;
  let saveTrends = true;
  let beforeScore: ((date: string) => void) | null = null;

  const store: ActivityCacheStore = {
    assertActive() {
      if (!active) throw new Error("Repository was cleared");
    },
    firstDate: async () => firstDate,
    manifest: (first, last, samplesFrom, withTrends) =>
      readActivityCacheManifest(
        adapter,
        first,
        last,
        0,
        samplesFrom,
        withTrends,
      ),
    async scoreDay(date, withSamples) {
      beforeScore?.(date);
      scored.push({ date, withSamples });
      const steps = writes.get(date) ?? 0;
      const bucket = {
        ...buildActivityScoreMaxima([]),
        hasAnyData: steps > 0,
        steps,
      };
      return {
        maxima: { ...buildActivityScoreMaxima([]), steps },
        samples: withSamples ? encodeActivityHourSamples([bucket]) : null,
        trend: withSamples
          ? JSON.stringify({ ...emptyTrendDaySummary(), heartRate: [steps, 1] })
          : null,
      };
    },
    async saveDay(day, { maxima, samples, trend }) {
      const save = db.prepare(
        "INSERT OR REPLACE INTO derived_cache(cache_key,revision,payload) VALUES(?,?,?)",
      );
      save.run(day.key, day.revision, JSON.stringify(maxima));
      if (samples !== null)
        save.run(
          day.samplesKey ?? activitySamplesKey(day.date, 0),
          day.revision,
          samples,
        );
      if (trend !== null && saveTrends)
        save.run(
          day.trendKey ?? activityTrendKey(day.date, 0),
          day.revision,
          trend,
        );
    },
  };

  return {
    db,
    store,
    scored,
    /** A real change to a day's events. */
    write(date: string, dataType = "steps") {
      writes.set(date, (writes.get(date) ?? 0) + 1);
      db.prepare(
        "INSERT INTO event_changes(start_date,end_date,data_type) VALUES(?,?,?)",
      ).run(date, date, dataType);
    },
    wipe() {
      active = false;
    },
    /** Days stored before Trends summaries existed have none. */
    withoutTrendRows() {
      saveTrends = false;
    },
    withTrendRows() {
      saveTrends = true;
    },
    onScore(hook: ((date: string) => void) | null) {
      beforeScore = hook;
    },
    revision: () => readActivityCacheRevision(adapter, START, END),
    load(
      signal = new AbortController().signal,
      onProgress?: (history: ActivityHistory) => void,
      options?: ActivityHistoryOptions,
    ) {
      scored.length = 0;
      return loadActivityHistoryFrom(
        store,
        START,
        END,
        SAMPLES_FROM,
        signal,
        onProgress,
        options,
      );
    },
  };
}

const visibleDates = enumerateISODateRange(SAMPLES_FROM, END);
const olderDates = enumerateISODateRange(START, shiftISODate(SAMPLES_FROM, -1));

test("a cold window reports at once, then scores drawn days newest first before the rest", async () => {
  const fixture = createStore();
  try {
    for (const date of enumerateISODateRange(START, END)) fixture.write(date);
    const reports: ActivityHistory[] = [];
    const history = await fixture.load(undefined, (report) =>
      reports.push(report),
    );

    // The first report arrives before any scoring, with every drawn day pending.
    assert.deepEqual([...reports[0].pendingDates].sort(), visibleDates);
    assert.equal(reports[0].samplesByDate.size, 0);
    assert.equal(reports[0].visibleComplete, false);
    assert.equal(reports[0].visibleRemaining, visibleDates.length);

    assert.deepEqual(
      fixture.scored.map((day) => day.date),
      [...visibleDates].reverse().concat([...olderDates].reverse()),
    );
    // Only drawn days need hourly samples; the rest are scored for maxima alone.
    assert.ok(
      fixture.scored.every(
        (day) => day.withSamples === day.date >= SAMPLES_FROM,
      ),
    );
    // The drawn days are reported complete while older days are still loading.
    const drawn = reports.find((report) => report.visibleComplete);
    assert.ok(drawn && !drawn.complete);
    assert.equal(drawn.pendingDates.size, 0);

    assert.equal(history.complete, true);
    assert.equal(history.visibleRemaining, 0);
    assert.equal(history.samplesByDate.size, visibleDates.length);
    assert.equal(history.maxima.steps, 1);
  } finally {
    fixture.db.close();
  }
});

test("a warm window scores nothing and needs no progress report", async () => {
  const fixture = createStore();
  try {
    for (const date of enumerateISODateRange(START, END)) fixture.write(date);
    await fixture.load();
    let reports = 0;
    const history = await fixture.load(undefined, () => reports++);
    assert.deepEqual(fixture.scored, []);
    assert.equal(reports, 0);
    assert.equal(history.complete, true);
    assert.equal(history.samplesByDate.size, visibleDates.length);
  } finally {
    fixture.db.close();
  }
});

test("a changed day shows its stored value first and only it and the next day are rescored", async () => {
  const fixture = createStore();
  try {
    for (const date of enumerateISODateRange(START, END)) fixture.write(date);
    await fixture.load();

    fixture.write("2026-09-20");
    const reports: ActivityHistory[] = [];
    const history = await fixture.load(undefined, (report) =>
      reports.push(report),
    );

    // Stale, not missing: the grid stays fully drawn while the day reloads.
    assert.equal(reports[0].pendingDates.size, 0);
    assert.equal(reports[0].samplesByDate.size, visibleDates.length);
    assert.equal(reports[0].samplesByDate.get("2026-09-20")?.[0].steps, 1);
    assert.equal(reports[0].visibleComplete, false);
    // An overnight record can reach the following day, so it reloads too.
    assert.deepEqual(
      fixture.scored.map((day) => day.date),
      ["2026-09-21", "2026-09-20"],
    );
    assert.equal(history.samplesByDate.get("2026-09-20")?.[0].steps, 2);
    assert.equal(history.maxima.steps, 2);
    assert.equal(history.complete, true);
  } finally {
    fixture.db.close();
  }
});

test("an interrupted load resumes from the days already saved", async () => {
  const fixture = createStore();
  try {
    for (const date of enumerateISODateRange(START, END)) fixture.write(date);
    const controller = new AbortController();
    let scoredBeforeStop = 0;
    fixture.onScore(() => {
      if (++scoredBeforeStop === 11) controller.abort();
    });
    await assert.rejects(fixture.load(controller.signal));
    fixture.onScore(null);
    const finished = fixture.scored.length;
    assert.equal(finished, 11);

    await fixture.load();
    // The day in flight when the load stopped was saved too, so nothing repeats.
    assert.equal(
      fixture.scored.length,
      visibleDates.length + olderDates.length - finished,
    );
  } finally {
    fixture.db.close();
  }
});

test("a day written while it is being scored is scored again on the next load", async () => {
  const fixture = createStore();
  try {
    for (const date of enumerateISODateRange(START, END)) fixture.write(date);
    await fixture.load();
    fixture.write("2026-09-10");
    const before = await fixture.revision();
    fixture.onScore((date) => {
      // A collector write lands in the day after its revision was read.
      if (date === "2026-09-10") {
        fixture.onScore(null);
        fixture.write("2026-09-10");
      }
    });
    await fixture.load();
    // The revision moved, which is what queues the next pass.
    assert.notEqual(await fixture.revision(), before);

    const history = await fixture.load();
    assert.ok(fixture.scored.some((day) => day.date === "2026-09-10"));
    assert.equal(history.samplesByDate.get("2026-09-10")?.[0].steps, 3);

    await fixture.load();
    assert.deepEqual(fixture.scored, []);
  } finally {
    fixture.db.close();
  }
});

test("rebuilt step-timing evidence does not make a stored day stale", async () => {
  const fixture = createStore();
  try {
    for (const date of enumerateISODateRange(START, END)) fixture.write(date);
    await fixture.load();
    const before = await fixture.revision();
    for (const date of visibleDates)
      fixture.db
        .prepare(
          "INSERT INTO event_changes(start_date,end_date,data_type) VALUES(?,?,?)",
        )
        .run(date, date, ACTIVE_TIMING_CHANGE_TYPE);

    assert.equal(await fixture.revision(), before);
    await fixture.load();
    assert.deepEqual(fixture.scored, []);
  } finally {
    fixture.db.close();
  }
});

test("Trends summaries are stored with a drawn day and only missing ones are scored for", async () => {
  const fixture = createStore();
  try {
    for (const date of enumerateISODateRange(START, END)) fixture.write(date);

    // Stored by an older build: samples but no Trends summaries.
    fixture.withoutTrendRows();
    await fixture.load();
    fixture.withTrendRows();
    // The Today pattern does not need them, so nothing is rescored for it.
    await fixture.load();
    assert.equal(fixture.scored.length, 0);

    // Trends does: each drawn day is scored once more, and only those.
    const reports: ActivityHistory[] = [];
    const history = await fixture.load(
      undefined,
      (report) => reports.push(report),
      { trends: true },
    );
    assert.deepEqual(
      fixture.scored.map((day) => day.date),
      [...visibleDates].reverse(),
    );
    // The stored samples stay on screen while the summaries are filled in.
    assert.equal(reports[0].samplesByDate.size, visibleDates.length);
    assert.equal(reports[0].trendsByDate.size, 0);
    assert.equal(history.trendsByDate.size, visibleDates.length);
    assert.deepEqual(history.trendsByDate.get("2026-09-20")?.heartRate, [1, 1]);

    // Now either screen finds the days current.
    await fixture.load(undefined, undefined, { trends: true });
    assert.equal(fixture.scored.length, 0);

    // A day the Today pattern rescores gets its summary in the same read.
    fixture.write("2026-09-20");
    await fixture.load();
    assert.equal(fixture.scored.length, 2);
    const again = await fixture.load(undefined, undefined, { trends: true });
    assert.equal(fixture.scored.length, 0);
    assert.deepEqual(again.trendsByDate.get("2026-09-20")?.heartRate, [2, 1]);
  } finally {
    fixture.db.close();
  }
});

test("the window starts at the first stored event and an empty or wiped repository loads nothing", async () => {
  const late = createStore("2026-09-25");
  const empty = createStore(null);
  const wiped = createStore();
  try {
    await late.load();
    assert.deepEqual(
      late.scored.map((day) => day.date),
      enumerateISODateRange("2026-09-25", END).reverse(),
    );

    const history = await empty.load();
    assert.deepEqual(empty.scored, []);
    assert.equal(history.complete, true);
    assert.equal(history.samplesByDate.size, 0);

    wiped.write("2026-09-20");
    wiped.wipe();
    await assert.rejects(wiped.load(), /cleared/);
    assert.deepEqual(wiped.scored, []);
  } finally {
    late.db.close();
    empty.db.close();
    wiped.db.close();
  }
});

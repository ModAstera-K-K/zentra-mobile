import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveActiveMinutes,
  resolveActiveMinutesAsync,
} from "@/utils/active-minutes";
import { walkingEquivalent } from "@/utils/walking-calibration";
import { timingProfileEvents } from "@/utils/active-timing-profile";
import { event } from "./fixtures";
import type { ZentraEventRecord } from "@/types/zentra";
const date = "2026-09-10";
function record(
  id: string,
  time: string,
  type: ZentraEventRecord["dataType"],
  label?: string,
  metadata: ZentraEventRecord["metadata"] = {},
): ZentraEventRecord {
  const timestamp = new Date(`${date}T${time}:00`).toISOString();
  return {
    ...event(id, 0, "sensor", metadata),
    timestampStart: timestamp,
    timestampEnd: timestamp,
    dataType: type,
    valueText: label,
  };
}
function transition(
  id: string,
  time: string,
  label: string,
  type: "enter" | "exit",
) {
  return record(id, time, "activity", label, { transition: type });
}
function steps(id: string, time: string, count = 100) {
  return {
    ...record(id, time, "steps", undefined, {
      step_delta: count,
      step_timing_verified: true,
    }),
    valueNumeric: count,
  };
}
function workout(
  id: string,
  start: string,
  end: string,
  minutes: number,
  label = "cycling",
) {
  return {
    ...record(id, start, "exercise_session", label),
    source: "health_connect" as const,
    timestampEnd: new Date(`${date}T${end}:00`).toISOString(),
    unit: "minutes",
    valueNumeric: minutes,
  };
}

test("15106 coarse imported steps do not suppress five supported minutes or imply complete coverage", () => {
  const imported = {
    ...workout("total", "00:00", "23:59", 15106),
    dataType: "steps" as const,
    unit: "count",
    metadata: { platform_aggregate: true },
  };
  const summary = resolveActiveMinutes(date, [
    imported,
    ...[0, 1, 2, 3, 4].map((i) => steps(`s${i}`, `09:0${i}`)),
  ]);
  assert.equal(summary.supportedMinutes, 5);
  assert.equal(summary.quality, "partial");
  assert.ok(summary.coverageReasons.some((r) => r.includes("lack reliable")));
  assert.equal(summary.walkingEquivalent, null);
});
test("fine health records recover timed activity without summing phone and watch duplicates", () => {
  const timed = Array.from({ length: 150 }, (_, i) => {
    const start = new Date(`${date}T08:00:00`).getTime() + i * 60_000;
    return {
      ...event(`health-${i}`, 100, "health_connect"),
      timestampStart: new Date(start).toISOString(),
      timestampEnd: new Date(start + 60_000).toISOString(),
    };
  });
  assert.equal(
    resolveActiveMinutes(date, [
      ...timed,
      ...timed.map((e) => ({ ...e, id: `copy-${e.id}` })),
      steps("phone", "09:00"),
    ]).supportedMinutes,
    150,
  );
});
test("still does not suppress steps; first deltas and resets count; vehicles and idle motion do not", () => {
  const records = [
    transition("still", "08:00", "still", "enter"),
    steps("first", "09:00", 20),
    steps("reset", "09:01", 5),
    steps("after", "09:02", 10),
  ];
  assert.equal(resolveActiveMinutes(date, records).supportedMinutes, 3);
  assert.equal(
    resolveActiveMinutes(date, [
      transition("a", "10:00", "vehicle", "enter"),
      transition("b", "10:45", "vehicle", "exit"),
      record("motion", "12:00", "motion_context", "stable"),
    ]).supportedMinutes,
    null,
  );
});
test("duplicate starts retain walking time and overlaps are attributed exactly once", () => {
  const records = [
    transition("a", "09:00", "walking", "enter"),
    transition("duplicate", "09:20", "walking", "enter"),
    transition("b", "09:30", "walking", "exit"),
    workout("ride", "09:15", "09:45", 30),
    steps("step", "09:20"),
  ];
  const summary = resolveActiveMinutes(date, records);
  assert.equal(summary.supportedMinutes, 45);
  assert.deepEqual(summary.contributions, [
    { activity: "walking", minutes: 15 },
    { activity: "cycling", minutes: 30 },
  ]);
});
test("paused and duplicate workouts preserve active duration and use remaining capacity", () => {
  const paused = workout("paused", "09:00", "10:00", 30);
  assert.equal(
    resolveActiveMinutes(date, [paused, { ...paused, id: "duplicate" }])
      .supportedMinutes,
    30,
  );
  const summary = resolveActiveMinutes(date, [
    paused,
    transition("a", "09:00", "walking", "enter"),
    transition("b", "10:00", "walking", "exit"),
  ]);
  assert.equal(summary.supportedMinutes, 60);
  assert.equal(
    summary.contributions.reduce((n, p) => n + p.minutes, 0),
    60,
  );
  const exact = {
    ...paused,
    metadata: {
      active_intervals: JSON.stringify([
        [
          new Date(`${date}T09:00:00`).toISOString(),
          new Date(`${date}T09:10:00`).toISOString(),
        ],
      ]),
    },
  };
  assert.equal(resolveActiveMinutes(date, [exact]).supportedMinutes, 10);
});
test("midnight clipping is deterministic and open transitions do not accrue wall-clock time", () => {
  const previous = {
    ...transition("a", "23:50", "walking", "enter"),
    timestampStart: new Date("2026-09-09T23:50:00").toISOString(),
  };
  assert.equal(
    resolveActiveMinutes(date, [
      previous,
      transition("b", "00:20", "walking", "exit"),
    ]).supportedMinutes,
    20,
  );
  assert.equal(
    resolveActiveMinutes(date, [
      transition("open", "23:50", "walking", "enter"),
    ]).supportedMinutes,
    null,
  );
  assert.equal(resolveActiveMinutes(date, []).supportedMinutes, null);
});
test("minute aggregation cannot convert coarse underlying step records into timed evidence", () => {
  const raw = {
    ...workout("coarse", "09:00", "10:00", 1000),
    dataType: "steps" as const,
  };
  const records = [
    {
      id: "stat",
      recordType: "steps" as const,
      startTime: raw.timestampStart,
      endTime: new Date(Date.parse(raw.timestampStart) + 60_000).toISOString(),
      valueNumeric: 100,
      unit: "count",
      metadata: {},
    },
  ];
  assert.equal(timingProfileEvents(records, [raw]).length, 0);
  assert.equal(
    timingProfileEvents(records, [{ ...raw, timestampEnd: records[0].endTime }])
      .length,
    1,
  );
});
test("personal estimate requires 10 bouts, three days and 60 minutes, excluding current day", () => {
  const bouts = Array.from({ length: 10 }, (_, i) => ({
    date: `2026-09-0${1 + (i % 3)}`,
    start: i * 60 * 60_000,
    end: i * 60 * 60_000 + 6 * 60_000,
    minutes: 6,
    steps: 600,
    source: "phone",
  }));
  assert.deepEqual(walkingEquivalent(date, 15106, [{ walkingBouts: bouts }]), {
    lowerMinutes: 151,
    upperMinutes: 152,
    bouts: 10,
    days: 3,
  });
  assert.equal(
    walkingEquivalent(date, 15106, [{ walkingBouts: bouts.slice(1) }]),
    null,
  );
  assert.equal(
    walkingEquivalent(date, 15106, [
      { walkingBouts: bouts.map((b) => ({ ...b, date })) },
    ]),
    null,
  );
});
test("walking calibration requires contiguous fine records from a consistent source", () => {
  const records = [
    transition("a", "09:00", "walking", "enter"),
    transition("b", "09:06", "walking", "exit"),
    ...[0, 1, 2, 3, 4, 5].map((i) => steps(`s${i}`, `09:0${i}`)),
  ];
  assert.equal(resolveActiveMinutes(date, records).walkingBouts.length, 1);
  assert.equal(
    resolveActiveMinutes(
      date,
      records.filter((e) => e.id !== "s3"),
    ).walkingBouts.length,
    0,
  );
});
test("async resolver matches sync, cancels obsolete jobs, and yields dense work", async () => {
  const records = Array.from({ length: 10000 }, (_, i) =>
    steps(`s${i}`, `09:${String(i % 60).padStart(2, "0")}`),
  );
  let ticks = 0;
  const timer = setInterval(() => ticks++, 0);
  const result = await resolveActiveMinutesAsync(date, records);
  clearInterval(timer);
  assert.equal(result.supportedMinutes, 60);
  assert.ok(ticks > 0);
  assert.deepEqual(result, resolveActiveMinutes(date, records));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    resolveActiveMinutesAsync(date, records, "0", controller.signal),
    /cancelled/,
  );
});

test("legacy closely spaced step deltas remain usable and sparse batched deltas remain partial", () => {
  const a = steps("a", "09:00", 10),
    b = steps("b", "09:01", 20),
    c = steps("c", "09:30", 1000);
  for (const e of [a, b, c]) delete e.metadata.step_timing_verified;
  const summary = resolveActiveMinutes(date, [a, b, c]);
  assert.equal(summary.supportedMinutes, 1);
  assert.equal(summary.quality, "partial");
});

test("DST days use local elapsed boundaries and stale imports never contribute", () => {
  const prior = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const e = {
      ...workout("walk", "01:00", "04:00", 180, "walking"),
      timestampStart: "2026-03-08T01:00:00-05:00",
      timestampEnd: "2026-03-08T04:00:00-04:00",
    };
    assert.equal(resolveActiveMinutes("2026-03-08", [e]).supportedMinutes, 120);
    assert.equal(
      resolveActiveMinutes("2026-03-08", [
        { ...e, metadata: { stale_import: true } },
      ]).supportedMinutes,
      null,
    );
  } finally {
    if (prior === undefined) delete process.env.TZ;
    else process.env.TZ = prior;
  }
});

test("motion windows require independent timed step corroboration and only fill uncovered time", () => {
  const motion = {
    ...record("motion", "09:00", "motion_context", "moderate_movement"),
    timestampStart: new Date(`${date}T09:00:30`).toISOString(),
    timestampEnd: new Date(`${date}T09:01:30`).toISOString(),
  };
  assert.equal(resolveActiveMinutes(date, [motion]).supportedMinutes, null);
  const summary = resolveActiveMinutes(date, [motion, steps("s", "09:01")]);
  assert.equal(summary.supportedMinutes, 2); // 1.5 minutes rounds once, after attribution
  assert.equal(
    summary.contributions.reduce((sum, p) => sum + p.minutes, 0),
    summary.supportedMinutes,
  );
});

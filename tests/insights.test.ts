import { event, history } from "./fixtures";
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareMetric } from "@/utils/personal-insights";
import {
  recordedDurationMinutes,
  resolveStepTotal,
  resolvedSleepMinutes,
} from "@/utils/source-resolution";
import { shiftISODate, parseISODate } from "@/utils/dates";
import { buildMetricObservation } from "@/utils/metric-observations";
import {
  buildUnifiedTimelineAsync,
  buildUnifiedTimeline,
} from "@/utils/unified-timeline";
import { buildPolylineSegments, buildChartCoordinates } from "@/utils/charts";

test("comparisons use matched weekdays, require five pairs, and reject changed provenance", () => {
  const all = history();
  const insight = compareMetric("steps", all, "2026-09-27");
  assert.equal(insight.pairs, 7);
  assert.equal(insight.percentChange, 100);
  assert.equal(insight.absoluteChange, 100);
  assert.equal(
    compareMetric("steps", all.slice(3), "2026-09-27").eligible,
    false,
  );
  all[8].provenance = "sensor";
  all[9].quality = "partial";
  assert.equal(compareMetric("steps", all, "2026-09-27").pairs, 5);
  all[10].value = null;
  assert.equal(compareMetric("steps", all, "2026-09-27").eligible, false);
});
test("zero baseline yields absolute change, never fabricated percentage", () => {
  const insight = compareMetric("steps", history(0), "2026-09-27");
  assert.equal(insight.percentChange, null);
  assert.equal(insight.absoluteChange, 200);
});
test("platform statistics supersede both raw health samples and phone counters", () => {
  assert.equal(
    resolveStepTotal([
      event("phone", 400),
      event("watch", 900, "health_connect"),
      event("total", 500, "health_connect", { platform_aggregate: true }),
    ]),
    500,
  );
  assert.equal(
    resolveStepTotal([
      event("zero", 0, "health_connect", { platform_aggregate: true }),
      event("phone", 400),
    ]),
    0,
  );
  assert.equal(resolveStepTotal([]), null);
});
test("phone counters handle resets", () => {
  const records = [
    event("a", 100),
    { ...event("b", 20), timestampStart: "2026-09-10T12:00:00Z" },
  ];
  assert.equal(resolveStepTotal(records), 120);
});
test("sleep stages are unioned within one origin and attributed to wake date", () => {
  const a = {
    ...event("sleep", 120, "health_connect", { source_app: "watch" }),
    dataType: "sleep_inferred" as const,
    timestampStart: "2026-09-09T23:00:00",
    timestampEnd: "2026-09-10T02:00:00",
  };
  const b = {
    ...a,
    id: "stage",
    timestampStart: "2026-09-10T01:00:00",
    timestampEnd: "2026-09-10T03:00:00",
  };
  assert.equal(resolvedSleepMinutes([a, b], "2026-09-10"), 240);
  assert.equal(resolvedSleepMinutes([a, b], "2026-09-09"), null);
});
test("missing is not zero and incomplete imports cannot produce eligible observations", () => {
  const o = buildMetricObservation("steps", "2026-09-10", [], []);
  assert.equal(o.value, null);
  assert.equal(o.quality, "missing");
  const partial = buildMetricObservation(
    "steps",
    "2026-09-10",
    [event("total", 0, "health_connect", { platform_aggregate: true })],
    [],
  );
  assert.equal(partial.value, 0);
  assert.equal(partial.quality, "partial");
});
test("async timeline matches synchronous output and missing buckets do not imply rest", async () => {
  const window = {
    startTimestamp: "2026-09-10T00:00:00Z",
    endTimestamp: "2026-09-11T00:00:00Z",
    resolution: "hour" as const,
  };
  const rows = [event("a", 100)];
  const actual = await buildUnifiedTimelineAsync(rows, window);
  assert.deepEqual(actual, buildUnifiedTimeline(rows, window));
  assert.equal(actual[0].restCompositeScore, 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    buildUnifiedTimelineAsync(rows, window, controller.signal),
    /cancelled/,
  );
});
test("line charts preserve gaps instead of bridging missing readings", () => {
  const coordinates = buildChartCoordinates(
    [
      { label: "a", value: 1 },
      { label: "b", value: null },
      { label: "c", value: 0 },
    ],
    100,
    100,
  );
  assert.equal(buildPolylineSegments(coordinates).length, 2);
});
test("local calendar boundaries honor DST", () => {
  const old = process.env.TZ;
  process.env.TZ = "America/New_York";
  assert.equal(
    (parseISODate("2026-03-09").getTime() -
      parseISODate("2026-03-08").getTime()) /
      3600000,
    23,
  );
  process.env.TZ = old;
});

test("Android asleep intervals exclude awake gaps and stage fragments use the final wake date", () => {
  const session = {
    ...event("sleep-session", 180, "health_connect", {
      source_app: "watch",
      sleep_intervals: JSON.stringify([
        ["2026-09-09T22:00:00", "2026-09-09T23:00:00"],
        ["2026-09-09T23:30:00", "2026-09-10T02:00:00"],
      ]),
    }),
    dataType: "sleep_inferred" as const,
    timestampStart: "2026-09-09T22:00:00",
    timestampEnd: "2026-09-10T02:00:00",
  };
  assert.equal(resolvedSleepMinutes([session], "2026-09-10"), 210);
  const early = {
    ...session,
    id: "early",
    metadata: { source_app: "watch" },
    timestampEnd: "2026-09-09T23:00:00",
  };
  const late = {
    ...early,
    id: "late",
    timestampStart: "2026-09-09T23:30:00",
    timestampEnd: "2026-09-10T02:00:00",
  };
  assert.equal(resolvedSleepMinutes([early, late], "2026-09-10"), 210);
  assert.equal(resolvedSleepMinutes([early, late], "2026-09-09"), null);
});
test("new phone counter deltas do not carry yesterday's cumulative total into today", () => {
  assert.equal(
    resolveStepTotal([event("delta", 1100, "sensor", { step_delta: 100 })]),
    100,
  );
});

test("health-only legacy sources never sum competing providers, and paused workouts retain recorded duration", () => {
  assert.equal(
    resolveStepTotal([
      event("a", 400, "health_connect", { source_app: "a" }),
      event("b", 900, "health_connect", { source_app: "b" }),
    ]),
    400,
  );
  const workout = {
    ...event("workout", 1800, "health_connect"),
    dataType: "exercise_session" as const,
    unit: "seconds",
  };
  assert.equal(
    recordedDurationMinutes([workout, { ...workout, id: "duplicate" }]),
    30,
  );
});

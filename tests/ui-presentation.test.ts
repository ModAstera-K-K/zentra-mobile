import { test } from "node:test";
import assert from "node:assert/strict";

import type { DashboardMetric } from "@/types/zentra";
import { buildChartCoordinates, buildPolylineSegments } from "@/utils/charts";
import { initialRhythmIndex, rhythmSeries } from "@/utils/daily-rhythm-presentation";
import { metricQuality, metricReadout } from "@/utils/metric-card-presentation";
import { buildUnifiedTimeline } from "@/utils/unified-timeline";

test("tile formatting preserves unavailable, measured zero, and compound duration values", () => {
  assert.deepEqual(metricReadout({ key: "steps", value: "0", available: true }), { value: "0", unit: "steps" });
  assert.deepEqual(metricReadout({ key: "activeMinutes", value: "74", available: true }), { value: "74", unit: "min" });
  assert.deepEqual(metricReadout({ key: "screenTime", value: "2h 48m", available: true }), { value: "2h 48m", unit: "" });
  assert.deepEqual(metricReadout({ key: "activeMinutes", value: "Unavailable", available: false }), { value: "Unavailable", unit: "" });
});

test("the sparse activity regression retains a prominent Partial label without changing minutes", () => {
  const metric: DashboardMetric = { key: "activeMinutes", label: "Active Minutes", value: "5 min", available: true, tone: "physical", detail: "Supported activity; timing coverage is partial." };
  assert.deepEqual(metricReadout(metric), { value: "5", unit: "min" });
  assert.equal(metricQuality(metric), "Partial");
  assert.equal(metricQuality({ ...metric, available: false, value: "Unavailable" }), null);
});

test("separated rhythm traces preserve zero and gaps on the same 0–100 domain", () => {
  const buckets = buildUnifiedTimeline([], {
    startTimestamp: "2026-09-28T00:00:00Z",
    endTimestamp: "2026-09-28T03:00:00Z",
    resolution: "hour",
  }).map((bucket, index) => ({
    ...bucket,
    hasAnyData: index !== 1,
    dailyRhythmMovementScore: index === 0 ? 0 : 25,
    normalizedScreenScore: 25,
    restCompositeScore: 100,
  }));
  const movement = rhythmSeries(buckets, "movement");
  const screen = rhythmSeries(buckets, "screen");
  const rest = rhythmSeries(buckets, "rest");
  assert.deepEqual(movement.map(point => point.value), [0, null, 25]);
  assert.deepEqual(rest.map(point => point.value), [100, null, 100]);
  const movementCoordinates = buildChartCoordinates(movement, 100, 100, undefined, { min: 0, max: 100 });
  const screenCoordinates = buildChartCoordinates(screen, 100, 100, undefined, { min: 0, max: 100 });
  assert.equal(movementCoordinates[2].y, screenCoordinates[2].y);
  assert.equal(buildPolylineSegments(movementCoordinates).length, 2, "Missing hours must not be joined by a line");
});

test("rhythm selection uses timestamps when local hour labels repeat at DST", () => {
  const buckets = buildUnifiedTimeline([], {
    startTimestamp: "2026-11-01T05:00:00Z",
    endTimestamp: "2026-11-01T07:00:00Z",
    resolution: "hour",
  }).map(bucket => ({ ...bucket, label: "1 AM" }));
  assert.equal(initialRhythmIndex(buckets, Date.parse("2026-11-01T05:30:00Z")), 0);
  assert.equal(initialRhythmIndex(buckets, Date.parse("2026-11-01T06:30:00Z")), 1);
});

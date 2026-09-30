import { test } from "node:test";
import assert from "node:assert/strict";
import { inferSleepEvents, inferSleepEventsAsync } from "@/utils/sleep-inference";
import { overnightRestWindow } from "@/utils/rest-window";
import { appUsageSyncWindowStart } from "@/utils/app-usage-window";
import { resolvedSleepMinutes, resolvedTimelineEvents } from "@/utils/source-resolution";
import { sleepSummaryEvent } from "@/utils/sleep-summary";
import { createRestAdjustment, parseRestDateTime } from "@/utils/rest-adjustment";
import { restPresentation } from "@/utils/rest-presentation";
import { emptyActivityHistory } from "@/utils/activity-history-windows";
import { pendingRestHistoryGaps } from "@/utils/rest-history-coverage";
import { restEvent, stillNight, screenNight, restNow, localStamp, restTimezone } from "./rest-fixtures";

const date = "2026-09-30";

test("iOS motion-only and Android motion fallback infer the same closed overnight window", () => {
  for (const stream of ["ios:core_motion", "android:activity_recognition"]) {
    const [event] = inferSleepEvents(stillNight(undefined, undefined, stream), date, restNow());
    assert.equal(event.valueNumeric, 480);
    assert.equal(event.metadata.rest_evidence_quality, "limited");
    assert.equal(event.metadata.rest_coverage, 1);
    assert.match(String(event.metadata.rest_evidence), /Phone stillness/);
    assert.equal(event.metadata.rest_wake_date, date);
  }
});

test("Android needs both screen transitions and positive query coverage; an empty query cannot imply rest", () => {
  const events = screenNight();
  assert.equal(inferSleepEvents(events, date, restNow())[0].valueNumeric, 480);
  assert.deepEqual(inferSleepEvents(events.slice(0, 2), date, restNow()), []);
  assert.deepEqual(inferSleepEvents(events.slice(2), date, restNow()), []);
  assert.deepEqual(inferSleepEvents(events.slice(0, 1), date, restNow()), []);
});

test("empty, charging-only, stale, unmatched, low-confidence and cross-stream motion cannot create rest", () => {
  const night = stillNight();
  const variants = [[], [restEvent("charging_state", "2026-09-29T23:00:00", undefined, { valueText: "charging" })],
    night.slice(0, 1), night.map((e) => ({ ...e, metadata: { ...e.metadata, stale_import: true } })),
    night.map((e) => ({ ...e, confidence: 0.2, metadata: { ...e.metadata, confidence: 0.2 } })),
    [night[0], { ...night[1], metadata: { ...night[1].metadata, activity_stream: "other" } }]];
  for (const events of variants) assert.deepEqual(inferSleepEvents(events, date, restNow()), []);
});

test("duplicate delivery and starts preserve original boundaries without double counting", () => {
  const night = stillNight();
  const duplicate = { ...night[0], id: "duplicate", source: "activity_recognition" as const };
  const restart = { ...night[0], id: "repeated-enter", timestampStart: localStamp("2026-09-30T00:00:00"), timestampEnd: localStamp("2026-09-30T00:00:00") };
  const [event] = inferSleepEvents([night[1], duplicate, night[0], restart], date, restNow());
  assert.equal(event.valueNumeric, 480);
  assert.equal(event.timestampStart, night[0].timestampStart);
});

test("short observed interruptions are subtracted and unknown gaps stay out of supported duration", () => {
  const events = [...stillNight("2026-09-29T23:00:00", "2026-09-30T03:00:00"),
    ...stillNight("2026-09-30T03:05:00", "2026-09-30T07:00:00"),
    restEvent("app_usage", "2026-09-30T04:00:00", "2026-09-30T04:05:00", { valueNumeric: 300 })];
  const [event] = inferSleepEvents(events, date, restNow());
  assert.equal(event.valueNumeric, 470);
  assert.equal(event.metadata.rest_unknown_minutes, 5);
  assert.equal(event.metadata.rest_interruption_minutes, 5);
  assert.equal(resolvedSleepMinutes([event], date), 470);
  const timeline = resolvedTimelineEvents([event]);
  assert.equal(timeline.reduce((n, e) => n + (e.valueNumeric ?? 0), 0), 470);
  assert.ok(timeline.every((e) => e.timestampEnd <= localStamp("2026-09-30T03:00:00") || e.timestampStart >= localStamp("2026-09-30T03:05:00")));
});

test("long gaps split candidates, and short fragments never become a complete night", () => {
  assert.deepEqual(inferSleepEvents([...stillNight("2026-09-29T23:00:00", "2026-09-30T01:00:00"),
    ...stillNight("2026-09-30T02:00:00", "2026-09-30T04:00:00")], date, restNow()), []);
  const events = [...stillNight(), restEvent("exercise_session", "2026-09-30T02:00:00", "2026-09-30T03:00:00")];
  const [event] = inferSleepEvents(events, date, restNow());
  assert.equal(event.timestampStart, localStamp("2026-09-30T03:00:00"));
  assert.equal(event.valueNumeric, 240);
});

test("actual charging and stable samples add context, not probability; battery-only and unplugged do not", () => {
  const battery = restEvent("charging_state", "2026-09-29T23:00:00", undefined, { valueNumeric: 0.9, valueText: "unplugged" });
  const [without] = inferSleepEvents([...stillNight(), battery], date, restNow());
  const [withCharge] = inferSleepEvents([...stillNight(), { ...battery, valueText: "Charging" }], date, restNow());
  assert.doesNotMatch(String(without.metadata.rest_evidence), /Charging/);
  assert.match(String(withCharge.metadata.rest_evidence), /Charging/);
  assert.equal(without.confidence, withCharge.confidence);
  assert.doesNotMatch(restPresentation(withCharge).qualityLabel!, /confidence/);
});

test("coarse step totals never imply continuous movement; verified timed steps interrupt rest", () => {
  const coarse = restEvent("steps", "2026-09-30T00:00:00", "2026-09-30T09:00:00", { source: "health_connect", valueNumeric: 10000 });
  assert.equal(inferSleepEvents([...stillNight(), coarse], date, restNow())[0].valueNumeric, 480);
  const step = restEvent("steps", "2026-09-30T03:00:00", undefined, { valueNumeric: 100, metadata: { step_delta: 10, step_timing_verified: true } });
  assert.equal(inferSleepEvents([...stillNight(), step], date, restNow())[0].valueNumeric, 479);
});

test("a real future endpoint, query boundary, previous-evening nap or daytime stillness cannot masquerade as last night", () => {
  assert.deepEqual(inferSleepEvents(stillNight(undefined, "2026-09-30T11:00:00"), date, restNow()), []);
  assert.deepEqual(inferSleepEvents(stillNight("2026-09-29T18:00:00", "2026-09-29T23:00:00"), date, restNow()), []);
  assert.deepEqual(inferSleepEvents(stillNight("2026-09-30T08:00:00", "2026-09-30T16:00:00"), date, new Date("2026-09-30T17:00:00")), []);
  assert.deepEqual(inferSleepEvents(stillNight("2026-09-29T17:00:00", "2026-09-30T02:00:00"), date, restNow()), []);
});

test("local JST midnight and spring/fall DST nights use elapsed local-calendar time", () => {
  restTimezone("Asia/Tokyo", () => {
    const [event] = inferSleepEvents(stillNight(), date, restNow());
    assert.equal(event.timestampStart, "2026-09-29T14:00:00.000Z");
    assert.equal(event.valueNumeric, 480);
    assert.equal(overnightRestWindow(date, restNow()).start, Date.parse("2026-09-29T09:00:00Z"));
  });
  restTimezone("America/New_York", () => {
    for (const [before, after, minutes] of [["2026-03-07", "2026-03-08", 420], ["2026-10-31", "2026-11-01", 540]] as const) {
      const [event] = inferSleepEvents(stillNight(`${before}T23:00:00`, `${after}T07:00:00`), after, new Date(`${after}T10:00:00`));
      assert.equal(event.valueNumeric, minutes);
    }
    assert.equal(parseRestDateTime("2026-03-08 02:30"), null);
  });
});

test("imported sleep outranks a user adjustment; adjustment outranks automatic without summing them", () => {
  const [automatic] = inferSleepEvents(stillNight(), date, restNow());
  const adjusted = createRestAdjustment(date, "2026-09-29 23:30", "2026-09-30 06:30", restNow());
  const imported = { ...automatic, id: "watch", source: "health_connect" as const, metadata: { health_platform: "HealthKit" } };
  assert.equal(resolvedSleepMinutes([automatic, adjusted], date), 420);
  assert.equal(sleepSummaryEvent([automatic, adjusted], date)?.metadata.rest_user_adjusted, true);
  assert.equal(sleepSummaryEvent([automatic, adjusted, imported], date)?.source, "health_connect");
  assert.equal(resolvedTimelineEvents([automatic, adjusted]).reduce((n, e) => n + (e.valueNumeric ?? 0), 0), 420);
  assert.equal(resolvedSleepMinutes([automatic, { ...adjusted, metadata: { ...adjusted.metadata, stale_import: true } }], date), 480);
});

test("manual edits reject invalid, reversed, future and out-of-night times", () => {
  for (const [start, end] of [["bad", "2026-09-30 07:00"], ["2026-09-30 07:00", "2026-09-30 06:00"],
    ["2026-09-29 23:00", "2026-09-30 11:00"], ["2026-09-29 17:00", "2026-09-30 06:00"]])
    assert.throws(() => createRestAdjustment(date, start, end, restNow()));
});

test("initial Android query includes yesterday; existing cursors preserve their read window", () => {
  assert.equal(appUsageSyncWindowStart(null, restNow()), localStamp("2026-09-29T00:00:00"));
  assert.equal(appUsageSyncWindowStart(localStamp("2026-09-30T08:00:00"), restNow()), localStamp("2026-09-30T00:00:00"));
});

test("pending motion-history pages leave gaps and async inference agrees with sync when complete", async () => {
  const events = stillNight();
  assert.deepEqual(await inferSleepEventsAsync(events, date, restNow()), inferSleepEvents(events, date, restNow()));
  const state = { ...emptyActivityHistory(), windows: [{ start: localStamp("2026-09-29T18:00:00"), end: localStamp("2026-09-30T10:00:00"), cursor: "partial" }] };
  assert.deepEqual(await inferSleepEventsAsync(events, date, restNow(), pendingRestHistoryGaps(state)), []);
});

test("unknown and low-confidence motion conflicts with screen evidence instead of receiving a missing-events bonus", () => {
  const night = stillNight();
  const uncertain = night.map((e) => ({ ...e, valueText: "unknown" }));
  assert.deepEqual(inferSleepEvents([...screenNight(), ...uncertain], date, restNow()), []);
  assert.deepEqual(inferSleepEvents([...screenNight(), { ...night[0], valueText: "in_vehicle" }], date, restNow()), []);
});

test("duration thresholds are explicit and independent evidence changes quality without adding duration", () => {
  assert.deepEqual(inferSleepEvents(stillNight("2026-09-30T01:00:00", "2026-09-30T03:59:00"), date, restNow()), []);
  assert.equal(inferSleepEvents(stillNight("2026-09-30T01:00:00", "2026-09-30T04:00:00"), date, restNow())[0].valueNumeric, 180);
  assert.deepEqual(inferSleepEvents(stillNight("2026-09-29T18:00:00", "2026-09-30T07:00:00"), date, restNow()), []);
  const [event] = inferSleepEvents([...screenNight(), ...stillNight()], date, restNow());
  assert.equal(event.valueNumeric, 480);
  assert.equal(event.metadata.rest_evidence_quality, "moderate");
});

test("travel interrupts rest and sparse location context never fills missing motion", () => {
  const here = restEvent("location", "2026-09-30T02:00:00", undefined, { valueJson: JSON.stringify({ latitude: 35, longitude: 139 }) });
  const nearby = restEvent("location", "2026-09-30T06:00:00", undefined, { valueJson: JSON.stringify({ latitude: 35, longitude: 139 }) });
  assert.deepEqual(inferSleepEvents([here, nearby], date, restNow()), []);
  const [stable] = inferSleepEvents([...stillNight(), here, nearby], date, restNow());
  assert.match(String(stable.metadata.rest_evidence), /samples stayed nearby/);
  const moved = restEvent("location", "2026-09-30T02:20:00", undefined, { valueJson: JSON.stringify({ latitude: 35.1, longitude: 139.1 }) });
  const [travel] = inferSleepEvents([...stillNight(), here, moved], date, restNow());
  assert.equal(travel.timestampStart, localStamp("2026-09-30T02:20:00"));
});

test("many individually short missing gaps fail the minimum coverage rule", () => {
  const events = [];
  for (let offset = 0; offset < 10; offset++) {
    const start = new Date("2026-09-29T23:00:00").getTime() + offset * 30 * 60000;
    events.push(...stillNight(new Date(start).toISOString(), new Date(start + 20 * 60000).toISOString()));
  }
  assert.deepEqual(inferSleepEvents(events, date, restNow()), []);
});

test("dense overlapping usage queries do not multiply rest and normalization yields to the event loop", async (t) => {
  const events = [...screenNight(), ...stillNight()];
  const template = events[2];
  for (let index = 0; index < 10000; index++) events.push({ ...template, id: `query-${index}` });
  let opportunities = 0;
  const timer = setInterval(() => opportunities++, 0), started = performance.now();
  try {
    const result = await inferSleepEventsAsync(events, date, restNow());
    assert.equal(result[0].valueNumeric, 480);
    assert.ok(opportunities > 0);
    t.diagnostic(`10,000 overlapping query records: ${(performance.now() - started).toFixed(1)} ms desktop, ${opportunities} event-loop opportunities; not a device benchmark.`);
  } finally { clearInterval(timer); }
});

test("the local rollback switch hides inference while retaining imported sleep", async () => {
  const { RELEASE_FLAGS } = await import("@/constants/release-flags");
  const previous = RELEASE_FLAGS.restInference;
  try {
    const [automatic] = inferSleepEvents(stillNight(), date, restNow());
    RELEASE_FLAGS.restInference = false;
    assert.equal(resolvedSleepMinutes([automatic], date), null);
    assert.deepEqual(resolvedTimelineEvents([automatic]), []);
    assert.equal(restPresentation(automatic).canAdjust, false);
    const imported = { ...automatic, id: "imported", source: "health_connect" as const, metadata: {} };
    assert.equal(resolvedSleepMinutes([automatic, imported], date), 480);
  } finally { RELEASE_FLAGS.restInference = previous; }
});

test("a later usage query does not change a closed night's coverage provenance", () => {
  const events = screenNight();
  const before = inferSleepEvents(events, date, restNow());
  const later = { ...events[2], id: "usage-coverage-later", timestampEnd: localStamp("2026-09-30T09:30:00") };
  const after = inferSleepEvents([...events, later], date, restNow());
  assert.deepEqual(after, before);
});

test("partial usage query coverage cannot invent a wake or bedtime endpoint", () => {
  const events = screenNight();
  const earlyQueryEnd = { ...events[2], timestampEnd: localStamp("2026-09-30T03:00:00") };
  const lateQueryStart = { ...events[2], timestampStart: localStamp("2026-09-30T02:00:00") };
  assert.deepEqual(inferSleepEvents([...events.slice(0, 2), earlyQueryEnd], date, restNow()), []);
  assert.deepEqual(inferSleepEvents([...events.slice(0, 2), lateQueryStart], date, restNow()), []);
});

test("iOS midnight boundary context uses its original motion timestamp", () => {
  const night = stillNight();
  const context = { ...night[0], timestampStart: localStamp("2026-09-30T00:00:00"), timestampEnd: localStamp("2026-09-30T00:00:00"),
    metadata: { ...night[0].metadata, boundary_context: true, original_timestamp: night[0].timestampStart } };
  const [event] = inferSleepEvents([context, night[1]], date, restNow());
  assert.equal(event.timestampStart, night[0].timestampStart);
  assert.equal(event.valueNumeric, 480);
});

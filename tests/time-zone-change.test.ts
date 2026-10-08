import { test } from "node:test";
import assert from "node:assert/strict";
import { buildActivityScoreMaxima } from "@/utils/activity-intensity";
import { localDateFormatter, parseISODate, toISODate } from "@/utils/dates";
import {
  assembleMonthlyActivityPattern,
  buildPatternDayCellFromSamples,
  buildUnifiedTimeline,
  carryPatternCellsForward,
  getMonthlyPatternGrid,
  patternDayCellsByDate,
  restoreSavedPattern,
} from "@/utils/unified-timeline";
import type { ActivityPatternCell } from "@/types/zentra";

// Node re-reads the zone when TZ is assigned, which stands in for the device
// changing time zone while the app stays alive. Each test file is its own
// process, so this does not reach other tests.
const ZONES = ["Asia/Tokyo", "America/Los_Angeles", "Asia/Tokyo"];
const moveTo = (zone: string) => {
  process.env.TZ = zone;
};

const fresh = (options: Intl.DateTimeFormatOptions, date: Date) =>
  new Intl.DateTimeFormat("en-US", options).format(date);

function dayWindow(date: string) {
  const start = parseISODate(date);
  return {
    startTimestamp: start.toISOString(),
    endTimestamp: new Date(start.getTime() + 86_400_000).toISOString(),
    resolution: "hour" as const,
  };
}

function scoredCell(date: string, steps: number) {
  return buildPatternDayCellFromSamples(
    date,
    [{ ...buildActivityScoreMaxima([]), hasAnyData: true, steps }],
    { ...buildActivityScoreMaxima([]), steps: 1000 },
  );
}

test("shared formatters follow the device into a new time zone", () => {
  for (const zone of ZONES) {
    moveTo(zone);
    const morning = new Date(2026, 8, 20, 9, 0);
    // The shared formatter was built in the previous zone on later rounds.
    assert.equal(
      localDateFormatter("test-hour", { hour: "numeric" }).format(morning),
      fresh({ hour: "numeric" }, morning),
      zone,
    );
    assert.match(
      localDateFormatter("test-hour", { hour: "numeric" }).format(morning),
      /^9\s?AM$/u,
    );
  }
  // Within one zone the formatter is reused, not rebuilt per call.
  assert.equal(
    localDateFormatter("test-hour", { hour: "numeric" }),
    localDateFormatter("test-hour", { hour: "numeric" }),
  );
});

test("hour labels and day labels are in the current time zone after it changes", () => {
  for (const zone of ZONES) {
    moveTo(zone);
    const buckets = buildUnifiedTimeline([], dayWindow("2026-09-20"));
    assert.equal(buckets.length, 24);
    assert.match(buckets[0].label, /^12\s?AM$/u, zone);
    assert.match(buckets[17].label, /^5\s?PM$/u, zone);
    // The day label is formatted from that day's local midnight.
    assert.equal(scoredCell("2026-09-20", 500).detailLabel, "Sep 20", zone);
    assert.equal(scoredCell("2026-10-01", 500).detailLabel, "Oct 1", zone);
  }
});

test("a grid saved in one time zone lands on the same calendar days in another", () => {
  const savedOn = "2026-09-24";
  const anchor = "2026-10-01";
  for (const [from, to] of [
    ["Asia/Tokyo", "America/Los_Angeles"],
    ["America/Los_Angeles", "Asia/Tokyo"],
    ["Asia/Tokyo", "Asia/Kolkata"],
  ]) {
    moveTo(from);
    const steps = new Map(
      getMonthlyPatternGrid(savedOn)
        .filter((date) => date <= savedOn)
        .map((date, index) => [date, 100 + index * 10]),
    );
    const saved: ActivityPatternCell[] = JSON.parse(
      JSON.stringify(
        assembleMonthlyActivityPattern(
          savedOn,
          new Map(
            [...steps].map(([date, value]) => [date, scoredCell(date, value)]),
          ),
        ),
      ),
    );

    moveTo(to);
    const byDate = patternDayCellsByDate(saved, savedOn);
    assert.equal(byDate.size, steps.size - 1, "all but the day it was saved");
    for (const [date, cell] of byDate) {
      // Each score stays with its own calendar day...
      assert.equal(cell.intensityScore, (steps.get(date) as number) / 10);
      assert.equal(cell.label, String(Number(date.slice(8))));
      // ...and the cell now spans that day here, so a tap opens the right one.
      assert.equal(toISODate(new Date(cell.startTimestamp)), date);
      assert.equal(cell.startTimestamp, parseISODate(date).toISOString());
      assert.equal(cell.id, `month-${cell.startTimestamp}`);
    }

    const carried = carryPatternCellsForward(anchor, saved, savedOn);
    getMonthlyPatternGrid(anchor).forEach((date, index) => {
      const expected = date < savedOn ? steps.get(date) : undefined;
      assert.equal(
        carried[index].placeholder,
        expected === undefined,
        `${from} -> ${to} ${date}`,
      );
      if (expected !== undefined)
        assert.equal(carried[index].intensityScore, expected / 10);
    });

    // Reopened the same day: every cell is re-anchored, the order unchanged.
    const restored = restoreSavedPattern(saved, savedOn);
    assert.deepEqual(
      restored.map((cell) => cell.intensityScore),
      saved.map((cell) => cell.intensityScore),
    );
    getMonthlyPatternGrid(savedOn).forEach((date, index) => {
      assert.equal(toISODate(new Date(restored[index].startTimestamp)), date);
      if (date > savedOn) assert.equal(restored[index].id, saved[index].id);
    });
  }

  // Not a saved grid at all: nothing is carried rather than misplaced.
  assert.equal(patternDayCellsByDate([], savedOn).size, 0);
  assert.deepEqual(restoreSavedPattern([], savedOn), []);
});

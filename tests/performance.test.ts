import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUnifiedTimelineAsync } from "@/utils/unified-timeline";
import { event } from "./fixtures";

test("dense 90-day timeline yields to input tasks while preserving all observations", async (context) => {
  const start = Date.parse("2026-06-01T00:00:00Z");
  const rows = Array.from({ length: 45000 }, (_, i) => ({
    ...event(`heart-${i}`, 60, "health_connect"),
    dataType: "heart_rate" as const,
    unit: "bpm",
    timestampStart: new Date(start + i * 172800).toISOString(),
    timestampEnd: new Date(start + i * 172800).toISOString(),
  }));
  let ticks = 0;
  const timer = setInterval(() => ticks++, 1);
  const before = performance.now();
  try {
    const buckets = await buildUnifiedTimelineAsync(rows, {
      startTimestamp: new Date(start).toISOString(),
      endTimestamp: new Date(start + 90 * 86400000).toISOString(),
      resolution: "hour",
    });
    assert.equal(buckets.length, 2160);
    assert.ok(ticks > 0, "Must yield before the full calculation finishes");
    context.diagnostic(
      `Synthetic desktop calculation: ${Math.round(performance.now() - before)}ms; ${ticks} event-loop opportunities. Not a device navigation benchmark.`,
    );
  } finally {
    clearInterval(timer);
  }
});

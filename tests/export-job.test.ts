import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { UnifiedTimelineResolution, ZentraEventRecord } from "@/types/zentra";
import { parseISODate, shiftISODate } from "@/utils/dates";
import {
  appendEventsForCollector,
  getEventsForRange,
  getExportTypeCounts,
} from "@/utils/event-repository";
import {
  buildExportArchive,
  ExportDataChangingError,
  exportToFile,
  type ExportFile,
  type ExportProgress,
  type ExportRequest,
  type ExportSource,
} from "@/utils/export-job";
import { memoryExportSource, repositoryExportSource } from "@/utils/export-source";
import { buildUnifiedTimelineAsync } from "@/utils/unified-timeline";
import {
  insertEvents,
  openTestRepository,
  ordinaryDay,
  storedEvent,
} from "./repository-harness";

const END = "2026-09-30";
const START = shiftISODate(END, -3);
const HOUR = 3_600_000;
const midnight = (date: string) => parseISODate(date).getTime();
const isExported = (event: ZentraEventRecord) =>
  event.metadata.platform_aggregate !== true && event.metadata.coverage_window !== true;

function request(overrides: Partial<ExportRequest> = {}): ExportRequest {
  return {
    mode: "raw",
    format: "json",
    range: { start: START, end: END },
    resolution: "hour",
    selectedTypes: null,
    ...overrides,
  };
}

async function build(
  req: ExportRequest,
  source: ExportSource = repositoryExportSource,
  signal = new AbortController().signal,
) {
  const chunks: Uint8Array[] = [];
  const progress: ExportProgress[] = [];
  const result = await buildExportArchive(req, source, (bytes) => void chunks.push(bytes.slice()), {
    signal,
    now: new Date(2026, 8, 30, 18, 0, 0),
    onProgress: (step) => progress.push({ ...step }),
  });
  const archive = Buffer.concat(chunks);
  assert.equal(archive.length, result.bytes);
  const zip = await JSZip.loadAsync(archive, { checkCRC32: true });
  const text = (name: string) => zip.file(name)!.async("string");
  return { result, zip, text, progress, files: Object.keys(zip.files) };
}

// The tests share one database: it is filled once, and the test that writes
// to it comes after those that compare whole contents.
let seeded: Promise<unknown> | null = null;
function seed() {
  return (seeded ??= fill());
}
async function fill() {
  const adapter = await openTestRepository();
  for (let back = 4; back >= 0; back--)
    insertEvents(adapter, ordinaryDay(shiftISODate(END, -back)));
  const second = midnight(shiftISODate(END, -2));
  insertEvents(adapter, [
    // Records that run across midnight, inside the range and into it.
    storedEvent("sleep-over-midnight", "sleep_inferred", second - 1.5 * HOUR, {
      source: "inferred",
      timestampEnd: new Date(second + 6 * HOUR).toISOString(),
      valueNumeric: 450,
      unit: "minutes",
    }),
    storedEvent("workout-over-midnight", "exercise_session", second + 23.5 * HOUR, {
      source: "health_connect",
      timestampEnd: new Date(second + 24.5 * HOUR).toISOString(),
      valueNumeric: 60,
      valueText: "running",
      unit: "minutes",
    }),
    storedEvent("usage-into-range", "app_usage", midnight(START) - HOUR / 2, {
      source: "usage_stats",
      timestampEnd: new Date(midnight(START) + HOUR / 2).toISOString(),
      valueNumeric: 3600,
      unit: "seconds",
    }),
    // A platform step total: part of the timeline, never of a raw export.
    storedEvent("steps-platform-total", "steps", second + 12 * HOUR, {
      source: "health_connect",
      valueNumeric: 5_000,
      metadata: { platform_aggregate: true },
    }),
    storedEvent("note-unicode", "activity", second + 9 * HOUR, {
      source: "activity_recognition",
      valueText: "walking — “brisk” ☀️",
    }),
  ]);
  return adapter;
}

test("a raw export holds exactly the range's records, counted in its manifest", async () => {
  await seed();
  const expected = (await getEventsForRange(START, END)).filter(isExported);
  const { result, text, files, progress } = await build(request());

  assert.deepEqual(files, ["manifest.json", "daily_aggregates.csv", "events.json"]);
  const events = JSON.parse(await text("events.json")) as ZentraEventRecord[];
  assert.deepEqual(events.map((event) => event.id), expected.map((event) => event.id));
  assert.deepEqual(events, JSON.parse(JSON.stringify(expected)));
  assert.equal(result.records, expected.length);
  assert.equal(result.fileName, `Zentra_export_${START}_to_${END}_json.zip`);

  const manifest = JSON.parse(await text("manifest.json"));
  const counts = await getExportTypeCounts(START, END);
  assert.deepEqual(
    Object.fromEntries(Object.entries(manifest.collectors).map(([type, entry]) => [type, (entry as { events: number }).events])),
    Object.fromEntries(counts.map((count) => [count.dataType, count.records])),
  );
  assert.deepEqual([...manifest.data_types_included].sort(), counts.map((count) => count.dataType).sort());
  assert.deepEqual(manifest.date_range, { start: START, end: END });
  assert.equal(manifest.files.daily_aggregates_csv, true);
  assert.equal((await text("daily_aggregates.csv")).split("\n").length, 1 + 4);

  // The count the tab shows before exporting is close to what is written.
  const estimated = counts.reduce((total, count) => total + count.bytes, 0);
  const written = (await text("events.json")).length;
  assert.ok(Math.abs(estimated - written) / written < 0.2, `${estimated} estimated, ${written} written`);

  assert.equal(progress.at(-1)?.fraction, 1);
  assert.ok(progress.every((step, index) => index === 0 || step.fraction >= progress[index - 1].fraction));
  assert.deepEqual(progress.filter((step) => step.phase === "reading").map((step) => step.day), [1, 2, 3, 4]);
});

test("a CSV export writes one file for each selected type", async () => {
  await seed();
  const expected = (await getEventsForRange(START, END)).filter(isExported);
  const { text, files, result } = await build(
    request({ format: "csv", selectedTypes: ["steps", "unlock_event", "heart_rate"] }),
  );
  assert.deepEqual(files, ["manifest.json", "daily_aggregates.csv", "events_steps.csv", "events_unlock_event.csv"]);
  for (const type of ["steps", "unlock_event"] as const) {
    const lines = (await text(`events_${type}.csv`)).split("\n");
    const ofType = expected.filter((event) => event.dataType === type);
    assert.match(lines[0], /^"id","timestamp_start"/);
    assert.deepEqual(
      lines.slice(1).map((line) => line.split(",")[0]),
      ofType.map((event) => `"${event.id}"`),
    );
  }
  assert.equal(
    result.records,
    expected.filter((event) => event.dataType === "steps" || event.dataType === "unlock_event").length,
  );
});

test("a unified export built a day at a time equals the timeline of the whole range", async () => {
  await seed();
  const all = await getEventsForRange(START, END);
  for (const [resolution, format] of [["hour", "json"], ["15min", "json"], ["hour", "csv"]] as const) {
    const whole = await buildUnifiedTimelineAsync(all, {
      resolution: resolution as UnifiedTimelineResolution,
      startTimestamp: parseISODate(START).toISOString(),
      endTimestamp: parseISODate(shiftISODate(END, 1)).toISOString(),
    });
    const { text, files, result } = await build(request({ mode: "unified", resolution, format }));
    assert.deepEqual(files, ["manifest.json", "daily_aggregates.csv", `timeline.${format}`]);
    const manifest = JSON.parse(await text("manifest.json"));
    assert.deepEqual(manifest.timeline, {
      resolution,
      bucket_count: whole.length,
      buckets_with_data: whole.filter((bucket) => bucket.hasAnyData).length,
    });
    assert.equal(result.fileName, `Zentra_unified_${resolution}_${START}_to_${END}_${format}.zip`);
    if (format === "json")
      assert.deepEqual(JSON.parse(await text("timeline.json")), JSON.parse(JSON.stringify(whole)), resolution);
    else assert.equal((await text("timeline.csv")).split("\n").length, 1 + whole.length);
  }
});

test("records written while an export runs are in it", async () => {
  await seed();
  const first = midnight(START);
  let added = 0;
  // Reading the third day, a late record arrives for the first, which the job
  // has already turned into bytes, and one for the day it is on.
  const source: ExportSource = {
    ...repositoryExportSource,
    readDay: async (date, signal) => {
      if (date === shiftISODate(START, 2) && added++ === 0)
        await appendEventsForCollector(
          "steps",
          [
            storedEvent("late-first-day", "steps", first + 10 * HOUR, { valueNumeric: 7_000 }),
            storedEvent("late-third-day", "unlock_event", midnight(date) + HOUR, { source: "usage_stats" }),
          ],
          "Stored",
        );
      return repositoryExportSource.readDay(date, signal);
    },
  };
  const raw = await build(request(), source);
  const expected = (await getEventsForRange(START, END)).filter(isExported);
  const events = JSON.parse(await raw.text("events.json")) as ZentraEventRecord[];
  assert.ok(events.some((event) => event.id === "late-first-day"));
  assert.deepEqual(events.map((event) => event.id), expected.map((event) => event.id));
  assert.equal(raw.result.records, expected.length);
  assert.equal(JSON.parse(await raw.text("manifest.json")).collectors.steps.events, expected.filter((event) => event.dataType === "steps").length);
});

test("a cancelled or failed export leaves no file; a finished one is kept once", async () => {
  await seed();
  const files: { name: string; bytes: number; state: "open" | "kept" | "discarded" }[] = [];
  const openFile = (name: string): ExportFile => {
    const file = { name, bytes: 0, state: "open" as "open" | "kept" | "discarded" };
    files.push(file);
    return {
      write: (bytes) => void (file.bytes += bytes.length),
      finish: () => {
        file.state = "kept";
        return `file:///cache/${name}`;
      },
      discard: () => void (file.state = "discarded"),
    };
  };

  const kept = await exportToFile(request(), repositoryExportSource, openFile, { signal: new AbortController().signal });
  assert.equal(kept.uri, `file:///cache/${kept.fileName}`);
  assert.deepEqual([files[0].state, files[0].bytes], ["kept", kept.bytes]);

  // Cancelled while reading, and while writing the archive.
  for (const cancelAt of ["reading", "writing"] as const) {
    const controller = new AbortController();
    await assert.rejects(
      exportToFile(request(), repositoryExportSource, openFile, {
        signal: controller.signal,
        onProgress: (step) => {
          if (step.phase === cancelAt && step.fraction > (cancelAt === "reading" ? 0.3 : 0.85)) controller.abort();
        },
      }),
      /Work cancelled/,
    );
    assert.equal(files.at(-1)?.state, "discarded", cancelAt);
  }

  // Records that never stop arriving: the export gives up rather than package
  // days read at different moments, and says why.
  let writes = 0;
  const churning: ExportSource = {
    ...repositoryExportSource,
    revision: async (start, end) => {
      await appendEventsForCollector(
        "steps",
        [storedEvent(`churn-${writes++}`, "steps", midnight(END) + HOUR, { valueNumeric: writes })],
        "Stored",
      );
      return repositoryExportSource.revision(start, end);
    },
  };
  await assert.rejects(
    exportToFile(request(), churning, openFile, { signal: new AbortController().signal }),
    ExportDataChangingError,
  );
  assert.equal(files.at(-1)?.state, "discarded");

  // A write that lands while the aggregates are read is caught too.
  let aggregateReads = 0;
  const lateWrite: ExportSource = {
    ...repositoryExportSource,
    aggregates: async (start, end) => {
      if (aggregateReads++ === 0)
        await appendEventsForCollector(
          "steps",
          [storedEvent("during-aggregates", "steps", midnight(END) + 2 * HOUR, { valueNumeric: 77 })],
          "Stored",
        );
      return repositoryExportSource.aggregates(start, end);
    },
  };
  const settled = await build(request(), lateWrite);
  assert.equal(aggregateReads, 2, "the aggregates were read again at the settled revision");
  assert.ok(
    (JSON.parse(await settled.text("events.json")) as ZentraEventRecord[]).some((event) => event.id === "during-aggregates"),
  );

  const failing: ExportSource = { ...repositoryExportSource, aggregates: async () => Promise.reject(new Error("disk I/O error")) };
  await assert.rejects(exportToFile(request(), failing, openFile, { signal: new AbortController().signal }), /disk I\/O error/);
  assert.equal(files.at(-1)?.state, "discarded");
});

test("the demo's records export from memory", async () => {
  const events = [
    storedEvent("demo-1", "steps", midnight(END) + HOUR, { valueNumeric: 10 }),
    storedEvent("demo-2", "steps", midnight(START) + 2 * HOUR, { valueNumeric: 20 }),
    storedEvent("demo-outside", "steps", midnight(START) - 5 * HOUR, { valueNumeric: 30 }),
  ];
  const { text, files } = await build(request(), memoryExportSource(events));
  assert.deepEqual(files, ["manifest.json", "events.json"]);
  assert.deepEqual(
    (JSON.parse(await text("events.json")) as ZentraEventRecord[]).map((event) => event.id),
    ["demo-2", "demo-1"],
  );
});

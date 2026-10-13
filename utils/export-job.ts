import type {
  DailyAggregateRecord,
  UnifiedTimelineBucket,
  ZentraEventRecord,
} from "@/types/zentra";
import {
  buildActivityScoreMaxima,
  mergeActivityScoreMaxima,
} from "@/utils/activity-intensity";
import {
  createCooperativeYield,
  yieldToEventLoop,
} from "@/utils/cooperative-work";
import { enumerateISODateRange, parseISODate, shiftISODate } from "@/utils/dates";
import { isExportedRecord } from "@/utils/export-data";
import {
  buildDailyAggregatesCsv,
  buildExportManifest,
  eventCsvRow,
  EVENTS_CSV_HEADER,
  exportFileName,
  TIMELINE_CSV_HEADER,
  timelineCsvRow,
  type ExportDescription,
} from "@/utils/export";
import {
  buildUnifiedTimelineAsync,
  rescoreTimeline,
} from "@/utils/unified-timeline";
import { encodeUtf8 } from "@/utils/utf8";
import { writeZip, type ZipEntry } from "@/utils/zip-writer";

export interface ExportRequest extends ExportDescription {
  /** Raw mode: the record types to include. `null` includes every type. */
  selectedTypes: string[] | null;
}

/** Where an export reads from: the device database, or the demo's records. */
export interface ExportSource {
  revision(start: string, end: string): Promise<string>;
  /** Local days in [start, end] written to since `revision` returned `since`. */
  changedDates(since: string, start: string, end: string): Promise<string[]>;
  /** The records that start on a local day, oldest first. */
  readDay(date: string, signal: AbortSignal): Promise<ZentraEventRecord[]>;
  aggregates(start: string, end: string): Promise<DailyAggregateRecord[]>;
}

export interface ExportProgress {
  phase: "reading" | "writing";
  /** Days read so far, of `days`. */
  day: number;
  days: number;
  records: number;
  /** Of the whole job, 0 to 1. */
  fraction: number;
}

export interface ExportResult {
  fileName: string;
  bytes: number;
  records: number;
}

export interface ExportOptions {
  signal: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
  now?: Date;
}

// Deflate's fastest level: about a third of the default's time for an archive
// under half as large again.
const COMPRESSION_LEVEL = 1;
// Reading is most of the work; the bar gives writing the rest.
const READING_SHARE = 0.8;
// Times a job re-reads days that were written to while it ran.
const REPAIR_ROUNDS = 3;
const SERIALIZE_SLICE = 500;

/** The records kept changing for as long as the export tried to read them. */
export class ExportDataChangingError extends Error {
  constructor() {
    super("The records were still changing while they were being exported.");
    this.name = "ExportDataChangingError";
  }
}

/** One local day of the export, already turned into bytes. */
interface DayPart {
  /** Records of each exported type, for the manifest. */
  counts: Map<string, number>;
  json: Uint8Array | null;
  csv: Map<string, Uint8Array>;
  /** Unified mode: the day's buckets, and the records still running at its end. */
  buckets: UnifiedTimelineBucket[];
  carriedOut: ZentraEventRecord[];
}

/**
 * Build the archive for `request` and hand its bytes to `write`.
 *
 * Records are read a local day at a time and turned into bytes straight away,
 * so the job never holds a range of records, or a single string of them. If a
 * write lands while it runs, the days it touched are read again. The thread is
 * released between days and while compressing, and `signal` stops the job at
 * the next of those points.
 */
export async function buildExportArchive(
  request: ExportRequest,
  source: ExportSource,
  write: (bytes: Uint8Array) => void | Promise<void>,
  options: ExportOptions,
): Promise<ExportResult> {
  const { signal, onProgress } = options;
  const { mode, format, range, resolution } = request;
  const days = enumerateISODateRange(range.start, range.end);
  const selected =
    mode === "raw" && request.selectedTypes
      ? new Set(request.selectedTypes)
      : null;
  const parts: DayPart[] = [];
  let records = 0;
  const assertActive = () => {
    if (signal.aborted) throw new Error("Work cancelled");
  };
  // A dense day is thousands of records: they are serialised a slice at a
  // time, with a pause whenever a slice of work has used its time.
  const pause = createCooperativeYield();

  async function readDay(index: number): Promise<void> {
    assertActive();
    const date = days[index];
    const events = await source.readDay(date, signal);
    const exported = events.filter(
      (event) => isExportedRecord(event) && (!selected || selected.has(event.dataType)),
    );
    const counts = new Map<string, number>();
    for (const event of exported)
      counts.set(event.dataType, (counts.get(event.dataType) ?? 0) + 1);
    const part: DayPart = {
      counts,
      json: null,
      csv: new Map(),
      buckets: [],
      carriedOut: [],
    };
    if (mode === "unified") {
      const start = parseISODate(date).toISOString();
      const end = parseISODate(shiftISODate(date, 1)).toISOString();
      const endMs = Date.parse(end);
      // The timeline is built from every record, with those still running
      // from earlier days of the range.
      const inDay = [...(parts[index - 1]?.carriedOut ?? []), ...events];
      part.buckets = await buildUnifiedTimelineAsync(
        inDay,
        { resolution, startTimestamp: start, endTimestamp: end },
        signal,
      );
      part.carriedOut = inDay.filter(
        (event) => Date.parse(event.timestampEnd) > endMs,
      );
    } else if (format === "json") {
      const slices: string[] = [];
      for (let from = 0; from < exported.length; from += SERIALIZE_SLICE) {
        slices.push(
          exported
            .slice(from, from + SERIALIZE_SLICE)
            .map((event) => JSON.stringify(event))
            .join(","),
        );
        await pause();
        assertActive();
      }
      part.json = slices.length ? encodeUtf8(slices.join(",")) : null;
    } else {
      const rows = new Map<string, string[]>();
      for (let from = 0; from < exported.length; from += SERIALIZE_SLICE) {
        for (const event of exported.slice(from, from + SERIALIZE_SLICE)) {
          const list = rows.get(event.dataType);
          if (list) list.push(eventCsvRow(event));
          else rows.set(event.dataType, [eventCsvRow(event)]);
        }
        await pause();
        assertActive();
      }
      for (const [type, list] of rows)
        part.csv.set(type, encodeUtf8(list.join("\n")));
    }
    records += exported.length - sum(parts[index]?.counts);
    parts[index] = part;
  }

  let since = await source.revision(range.start, range.end);
  for (let index = 0; index < days.length; index++) {
    await readDay(index);
    onProgress?.({
      phase: "reading",
      day: index + 1,
      days: days.length,
      records,
      fraction: (READING_SHARE * (index + 1)) / days.length,
    });
    await yieldToEventLoop();
  }
  // Days written to while the job read them are read again. A changed day
  // changes what runs into the next, so the timeline redoes all that follow.
  // The archive is only built from a read that nothing wrote under: once the
  // records and the daily aggregates have both been read at one revision.
  let aggregates: DailyAggregateRecord[] | null = null;
  for (let round = 0; aggregates === null; round++) {
    assertActive();
    const now = await source.revision(range.start, range.end);
    if (now === since) {
      const read = await source.aggregates(range.start, range.end);
      if ((await source.revision(range.start, range.end)) === since)
        aggregates = read;
      continue;
    }
    // Writes that never pause, such as a long import: say so rather than
    // package days read at different moments.
    if (round >= REPAIR_ROUNDS) throw new ExportDataChangingError();
    const changed = (await source.changedDates(since, range.start, range.end))
      .map((date) => days.indexOf(date))
      .filter((index) => index >= 0);
    since = now;
    if (!changed.length) continue;
    const redo =
      mode === "unified"
        ? days.map((_, index) => index).slice(Math.min(...changed))
        : changed;
    for (const index of redo) {
      await readDay(index);
      await yieldToEventLoop();
    }
  }
  assertActive();

  const typeCounts = new Map<string, number>();
  for (const part of parts)
    for (const [type, count] of part.counts)
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + count);

  const entries: ZipEntry[] = [];
  let timeline: { bucketCount: number; bucketsWithData: number } | undefined;
  if (mode === "unified") {
    // Scores are relative to the busiest bucket of the whole range.
    const maxima = parts
      .map((part) => buildActivityScoreMaxima(part.buckets))
      .reduce(mergeActivityScoreMaxima, buildActivityScoreMaxima([]));
    timeline = { bucketCount: 0, bucketsWithData: 0 };
    const pieces: Uint8Array[] = [encodeUtf8(format === "json" ? "[" : TIMELINE_CSV_HEADER)];
    for (const part of parts) {
      assertActive();
      const buckets = rescoreTimeline(part.buckets, maxima);
      part.buckets = [];
      for (let from = 0; from < buckets.length; from += SERIALIZE_SLICE) {
        const slice = buckets.slice(from, from + SERIALIZE_SLICE);
        const first = timeline.bucketCount === 0 && from === 0;
        pieces.push(
          encodeUtf8(
            format === "json"
              ? (first ? "" : ",") +
                  slice.map((bucket) => JSON.stringify(bucket)).join(",")
              : "\n" + slice.map(timelineCsvRow).join("\n"),
          ),
        );
        await pause();
        assertActive();
      }
      timeline.bucketCount += buckets.length;
      timeline.bucketsWithData += buckets.filter((b) => b.hasAnyData).length;
      await yieldToEventLoop();
    }
    if (format === "json") pieces.push(encodeUtf8("]"));
    entries.push({ name: `timeline.${format}`, parts: pieces });
  } else if (format === "json") {
    const pieces: Uint8Array[] = [encodeUtf8("[")];
    for (const part of parts)
      if (part.json) {
        if (pieces.length > 1) pieces.push(COMMA);
        pieces.push(part.json);
      }
    pieces.push(encodeUtf8("]"));
    entries.push({ name: "events.json", parts: pieces });
  } else {
    for (const type of typeCounts.keys()) {
      const pieces: Uint8Array[] = [encodeUtf8(EVENTS_CSV_HEADER)];
      for (const part of parts) {
        const rows = part.csv.get(type);
        if (rows) pieces.push(NEWLINE, rows);
      }
      entries.push({ name: `events_${type}.csv`, parts: pieces });
    }
  }

  const manifest = buildExportManifest(request, {
    typeCounts: [...typeCounts],
    hasAggregates: aggregates.length > 0,
    timeline,
    generatedAt: options.now ?? new Date(),
  });
  entries.unshift(
    { name: "manifest.json", parts: [encodeUtf8(JSON.stringify(manifest, null, 2))] },
    ...(aggregates.length
      ? [{ name: "daily_aggregates.csv", parts: [encodeUtf8(buildDailyAggregatesCsv(aggregates))] }]
      : []),
  );

  const bytes = await writeZip(entries, write, {
    level: COMPRESSION_LEVEL,
    now: options.now,
    signal,
    onProgress: (done, total) =>
      onProgress?.({
        phase: "writing",
        day: days.length,
        days: days.length,
        records,
        fraction: READING_SHARE + (1 - READING_SHARE) * (total ? done / total : 1),
      }),
  });
  return { fileName: exportFileName(request), bytes, records };
}

const COMMA = encodeUtf8(",");
const NEWLINE = encodeUtf8("\n");

function sum(counts: Map<string, number> | undefined): number {
  let total = 0;
  if (counts) for (const count of counts.values()) total += count;
  return total;
}

/** A file being written: its bytes, then either kept or thrown away. */
export interface ExportFile {
  write(bytes: Uint8Array): void | Promise<void>;
  /** Keep the file under its final name and return where it is. */
  finish(): string | Promise<string>;
  /** Remove whatever was written. */
  discard(): void | Promise<void>;
}

/**
 * Run the job into a file. The file only gets its name once the archive is
 * complete; a cancelled or failed job leaves nothing behind.
 */
export async function exportToFile(
  request: ExportRequest,
  source: ExportSource,
  openFile: (fileName: string) => ExportFile | Promise<ExportFile>,
  options: ExportOptions,
): Promise<ExportResult & { uri: string }> {
  const file = await openFile(exportFileName(request));
  try {
    const result = await buildExportArchive(
      request,
      source,
      (bytes) => file.write(bytes),
      options,
    );
    if (options.signal.aborted) throw new Error("Work cancelled");
    return { ...result, uri: await file.finish() };
  } catch (error) {
    await file.discard();
    throw error;
  }
}

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import JSZip from "jszip";

import type {
  DailyAggregateRecord,
  DateRangeSelection,
  ExportFormat,
  ExportMode,
  UnifiedTimelineBucket,
  UnifiedTimelineResolution,
  ZentraEventRecord,
} from "@/types/zentra";

function serializeCsvRow(values: Array<number | string>): string {
  return values
    .map((value) => `"${String(value).replace(/"/g, '""')}"`)
    .join(",");
}

function buildEventsCsv(records: ZentraEventRecord[]): string {
  const header = serializeCsvRow([
    "id",
    "timestamp_start",
    "timestamp_end",
    "data_type",
    "source",
    "value_numeric",
    "value_text",
    "value_json",
    "unit",
    "confidence",
    "metadata",
    "schema_version",
    "created_at",
  ]);

  const rows = records.map((record) =>
    serializeCsvRow([
      record.id,
      record.timestampStart,
      record.timestampEnd,
      record.dataType,
      record.source,
      record.valueNumeric ?? "",
      record.valueText ?? "",
      record.valueJson ?? "",
      record.unit,
      record.confidence,
      JSON.stringify(record.metadata),
      record.schemaVersion,
      record.createdAt,
    ]),
  );

  return [header, ...rows].join("\n");
}

function buildDailyAggregatesCsv(records: DailyAggregateRecord[]): string {
  const header = serializeCsvRow([
    "date",
    "steps_total",
    "active_minutes",
    "distance_meters",
    "screen_time_seconds",
    "unlock_count",
    "sleep_estimate_minutes",
    "mobility_radius_meters",
    "top_activity",
    "data_completeness",
    "computed_at",
  ]);

  const rows = records.map((record) =>
    serializeCsvRow([
      record.date,
      record.stepsTotal,
      record.activeMinutes,
      record.distanceMeters,
      record.screenTimeSeconds,
      record.unlockCount,
      record.sleepEstimateMinutes ?? "",
      record.mobilityRadiusMeters ?? "",
      record.topActivity ?? "",
      record.dataCompleteness,
      record.computedAt,
    ]),
  );

  return [header, ...rows].join("\n");
}

function getCollectorEventsCount(
  events: Record<string, ZentraEventRecord[]>,
): Record<string, { version: string; events: number }> {
  return Object.entries(events).reduce<
    Record<string, { version: string; events: number }>
  >((result, [key, value]) => {
    result[key] = { version: "1.0", events: value.length };
    return result;
  }, {});
}

function getIncludedTypes(
  events: Record<string, ZentraEventRecord[]>,
): string[] {
  return Object.keys(events);
}

function getExportFileName(
  format: ExportFormat,
  range: DateRangeSelection,
): string {
  return `Zentra_export_${range.start}_to_${range.end}_${format}.zip`;
}

function buildManifest(
  range: DateRangeSelection,
  events: Record<string, ZentraEventRecord[]>,
  dailyAggregates: DailyAggregateRecord[],
): Record<string, unknown> {
  return {
    schema_version: 1,
    app_version: "1.0.0",
    export_generated_at: new Date().toISOString(),
    date_range: {
      start: range.start,
      end: range.end,
    },
    data_types_included: getIncludedTypes(events),
    collectors: getCollectorEventsCount(events),
    files: {
      daily_aggregates_csv: dailyAggregates.length > 0,
      format: Object.keys(events).length ? "present" : "empty",
    },
    device: {
      os_version: "Android (prototype shell)",
      model_hash: "prototype-shell",
    },
  };
}

function flattenEvents(
  events: Record<string, ZentraEventRecord[]>,
): ZentraEventRecord[] {
  return Object.values(events)
    .flat()
    .slice()
    .sort((left, right) =>
      left.timestampStart.localeCompare(right.timestampStart),
    );
}

export async function buildAndShareExportBundle(
  format: ExportFormat,
  range: DateRangeSelection,
  events: Record<string, ZentraEventRecord[]>,
  dailyAggregates: DailyAggregateRecord[] = [],
): Promise<{ fileName: string; estimatedBytes: number }> {
  const zip = new JSZip();
  const manifest = buildManifest(range, events, dailyAggregates);

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  if (dailyAggregates.length) {
    zip.file("daily_aggregates.csv", buildDailyAggregatesCsv(dailyAggregates));
  }

  if (format === "json") {
    zip.file("events.json", JSON.stringify(flattenEvents(events), null, 2));
  } else {
    Object.entries(events).forEach(([key, records]) => {
      zip.file(`events_${key}.csv`, buildEventsCsv(records));
    });
  }

  const base64 = await zip.generateAsync({
    type: "base64",
    compression: "DEFLATE",
  });

  if (!FileSystem.cacheDirectory) {
    throw new Error("Cache directory is unavailable.");
  }

  const fileName = getExportFileName(format, range);
  const outputPath = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(outputPath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(outputPath, {
      mimeType: "application/zip",
      dialogTitle: "Share Zentra export",
      UTI: "public.zip-archive",
    });
  }

  return {
    fileName,
    estimatedBytes: Math.round((base64.length * 3) / 4),
  };
}

export function estimateExportBundleBytes(
  format: ExportFormat,
  range: DateRangeSelection,
  events: Record<string, ZentraEventRecord[]>,
  dailyAggregates: DailyAggregateRecord[] = [],
): number {
  const manifestBytes = JSON.stringify(
    buildManifest(range, events, dailyAggregates),
  ).length;
  const aggregateBytes = dailyAggregates.reduce(
    (total, record) => total + JSON.stringify(record).length,
    0,
  );
  const eventBytes = flattenEvents(events).reduce(
    (total, record) => total + JSON.stringify(record).length,
    0,
  );
  const multiplier = format === "json" ? 1.15 : 0.9;

  return Math.round((manifestBytes + eventBytes + aggregateBytes) * multiplier);
}

// Unified timeline export helpers

const TIMELINE_CSV_COLUMNS = [
  "timestamp_start",
  "timestamp_end",
  "resolution",
  "steps",
  "movement_score",
  "screen_score",
  "rest_score",
  "screen_time_seconds",
  "unlock_count",
  "sleep_minutes",
  "exercise_seconds",
  "activity_events",
  "location_samples",
  "ambient_light_avg_lux",
  "heart_rate_avg_bpm",
  "battery_level",
  "charging_state",
  "dominant_kind",
  "data_completeness",
  "has_any_data",
  "label",
] as const;

function buildTimelineCsv(buckets: UnifiedTimelineBucket[]): string {
  const header = serializeCsvRow([...TIMELINE_CSV_COLUMNS]);
  const rows = buckets.map((bucket) =>
    serializeCsvRow([
      bucket.timestampStart,
      bucket.timestampEnd,
      bucket.resolution,
      bucket.steps,
      bucket.movementScore,
      bucket.screenScore,
      bucket.restScore,
      bucket.screenTimeSeconds,
      bucket.unlockCount,
      bucket.sleepMinutes,
      bucket.exerciseSeconds,
      bucket.activityEvents,
      bucket.locationSamples,
      bucket.ambientLightAverageLux ?? "",
      bucket.heartRateAverageBpm ?? "",
      bucket.batteryLevel ?? "",
      bucket.chargingStateLabel ?? "",
      bucket.dominantKind,
      bucket.dataCompleteness,
      bucket.hasAnyData ? 1 : 0,
      bucket.label,
    ]),
  );
  return [header, ...rows].join("\n");
}

function buildUnifiedManifest(
  range: DateRangeSelection,
  resolution: UnifiedTimelineResolution,
  buckets: UnifiedTimelineBucket[],
  events: Record<string, ZentraEventRecord[]>,
  dailyAggregates: DailyAggregateRecord[],
): Record<string, unknown> {
  return {
    schema_version: 1,
    app_version: "1.0.0",
    export_generated_at: new Date().toISOString(),
    export_mode: "unified",
    date_range: {
      start: range.start,
      end: range.end,
    },
    timeline: {
      resolution,
      bucket_count: buckets.length,
      buckets_with_data: buckets.filter((b) => b.hasAnyData).length,
    },
    data_types_included: getIncludedTypes(events),
    collectors: getCollectorEventsCount(events),
    files: {
      daily_aggregates_csv: dailyAggregates.length > 0,
      format: "present",
    },
    device: {
      os_version: "Android (prototype shell)",
      model_hash: "prototype-shell",
    },
  };
}

export async function buildAndShareUnifiedExportBundle(
  format: ExportFormat,
  range: DateRangeSelection,
  resolution: UnifiedTimelineResolution,
  buckets: UnifiedTimelineBucket[],
  events: Record<string, ZentraEventRecord[]>,
  dailyAggregates: DailyAggregateRecord[] = [],
): Promise<{ fileName: string; estimatedBytes: number }> {
  const zip = new JSZip();
  const manifest = buildUnifiedManifest(
    range,
    resolution,
    buckets,
    events,
    dailyAggregates,
  );

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  if (dailyAggregates.length) {
    zip.file("daily_aggregates.csv", buildDailyAggregatesCsv(dailyAggregates));
  }

  if (format === "json") {
    zip.file("timeline.json", JSON.stringify(buckets, null, 2));
  } else {
    zip.file("timeline.csv", buildTimelineCsv(buckets));
  }

  const base64 = await zip.generateAsync({
    type: "base64",
    compression: "DEFLATE",
  });

  if (!FileSystem.cacheDirectory) {
    throw new Error("Cache directory is unavailable.");
  }

  const fileName = `Zentra_unified_${resolution}_${range.start}_to_${range.end}_${format}.zip`;
  const outputPath = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(outputPath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(outputPath, {
      mimeType: "application/zip",
      dialogTitle: "Share Zentra export",
      UTI: "public.zip-archive",
    });
  }

  return {
    fileName,
    estimatedBytes: Math.round((base64.length * 3) / 4),
  };
}

export function estimateUnifiedExportBundleBytes(
  format: ExportFormat,
  buckets: UnifiedTimelineBucket[],
  dailyAggregates: DailyAggregateRecord[] = [],
): number {
  const bucketBytes = buckets.reduce(
    (total, bucket) => total + JSON.stringify(bucket).length,
    0,
  );
  const aggregateBytes = dailyAggregates.reduce(
    (total, record) => total + JSON.stringify(record).length,
    0,
  );
  const multiplier = format === "json" ? 1.15 : 0.9;

  return Math.round((bucketBytes + aggregateBytes + 500) * multiplier);
}

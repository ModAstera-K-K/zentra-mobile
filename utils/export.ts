import type {
  DailyAggregateRecord,
  ExportFormat,
  ExportMode,
  UnifiedTimelineBucket,
  UnifiedTimelineResolution,
  ZentraEventRecord,
} from "@/types/zentra";

// What goes into an export archive, as text. Building and writing the archive
// is in export-job.ts; nothing here touches the device.

function serializeCsvRow(values: Array<number | string>): string {
  return values
    .map((value) => `"${String(value).replace(/"/g, '""')}"`)
    .join(",");
}

export const EVENTS_CSV_HEADER = serializeCsvRow([
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

export function eventCsvRow(record: ZentraEventRecord): string {
  return serializeCsvRow([
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
  ]);
}

export function buildDailyAggregatesCsv(records: DailyAggregateRecord[]): string {
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
    "active_minutes_quality",
    "active_minutes_calculation_version",
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
      record.activeSummary?.quality ?? "missing",
      record.activeSummary?.calculationVersion ?? "",
    ]),
  );

  return [header, ...rows].join("\n");
}

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

export const TIMELINE_CSV_HEADER = serializeCsvRow([...TIMELINE_CSV_COLUMNS]);

export function timelineCsvRow(bucket: UnifiedTimelineBucket): string {
  return serializeCsvRow([
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
  ]);
}


export interface ExportDescription {
  mode: ExportMode;
  format: ExportFormat;
  range: { start: string; end: string };
  resolution: UnifiedTimelineResolution;
}

export function exportFileName(description: ExportDescription): string {
  const { mode, format, range, resolution } = description;
  return mode === "unified"
    ? `Zentra_unified_${resolution}_${range.start}_to_${range.end}_${format}.zip`
    : `Zentra_export_${range.start}_to_${range.end}_${format}.zip`;
}

export function buildExportManifest(
  description: ExportDescription,
  contents: {
    /** Records of each included type, in the order the types first appear. */
    typeCounts: [type: string, records: number][];
    hasAggregates: boolean;
    timeline?: { bucketCount: number; bucketsWithData: number };
    generatedAt: Date;
  },
): Record<string, unknown> {
  const { mode, range, resolution } = description;
  const types = contents.typeCounts.map(([type]) => type);
  return {
    schema_version: 1,
    app_version: "1.0.0",
    export_generated_at: contents.generatedAt.toISOString(),
    ...(mode === "unified" ? { export_mode: "unified" } : {}),
    date_range: {
      start: range.start,
      end: range.end,
    },
    ...(mode === "unified" && contents.timeline
      ? {
          timeline: {
            resolution,
            bucket_count: contents.timeline.bucketCount,
            buckets_with_data: contents.timeline.bucketsWithData,
          },
        }
      : {}),
    data_types_included: types,
    collectors: Object.fromEntries(
      contents.typeCounts.map(([type, records]) => [
        type,
        { version: "1.0", events: records },
      ]),
    ),
    files: {
      daily_aggregates_csv: contents.hasAggregates,
      format: mode === "unified" || types.length ? "present" : "empty",
    },
    device: {
      os_version: "Android (prototype shell)",
      model_hash: "prototype-shell",
    },
  };
}

const BUCKETS_PER_DAY: Record<UnifiedTimelineResolution, number> = {
  minute: 1440,
  "15min": 96,
  hour: 24,
};
// One timeline bucket and one daily aggregate as written, measured on
// ordinary days.
const BUCKET_BYTES: Record<ExportFormat, number> = { json: 620, csv: 150 };
const AGGREGATE_BYTES = 110;

export function timelineBucketCount(
  days: number,
  resolution: UnifiedTimelineResolution,
): number {
  return days * BUCKETS_PER_DAY[resolution];
}

/**
 * About how large the files in the archive will be before compression, from
 * record counts alone: nothing is read to make the estimate.
 */
export function estimateExportBytes(
  description: ExportDescription & { days: number },
  recordBytes: number,
): number {
  const { mode, format, days, resolution } = description;
  const aggregates = days * AGGREGATE_BYTES;
  if (mode === "unified")
    return (
      timelineBucketCount(days, resolution) * BUCKET_BYTES[format] +
      aggregates +
      500
    );
  return Math.round(recordBytes * (format === "json" ? 1 : 0.8)) + aggregates + 500;
}

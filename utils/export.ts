import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';

import type {
  DailyAggregateRecord,
  DateRangeSelection,
  ExportFormat,
  ZentraEventRecord,
} from '@/types/zentra';

function serializeCsvRow(values: Array<number | string>): string {
  return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',');
}

function buildEventsCsv(records: ZentraEventRecord[]): string {
  const header = serializeCsvRow([
    'id',
    'timestamp_start',
    'timestamp_end',
    'data_type',
    'source',
    'value_numeric',
    'value_text',
    'value_json',
    'unit',
    'confidence',
    'metadata',
    'schema_version',
    'created_at',
  ]);

  const rows = records.map((record) => serializeCsvRow([
    record.id,
    record.timestampStart,
    record.timestampEnd,
    record.dataType,
    record.source,
    record.valueNumeric ?? '',
    record.valueText ?? '',
    record.valueJson ?? '',
    record.unit,
    record.confidence,
    JSON.stringify(record.metadata),
    record.schemaVersion,
    record.createdAt,
  ]));

  return [header, ...rows].join('\n');
}

function buildDailyAggregatesCsv(records: DailyAggregateRecord[]): string {
  const header = serializeCsvRow([
    'date',
    'steps_total',
    'active_minutes',
    'distance_meters',
    'screen_time_seconds',
    'unlock_count',
    'sleep_estimate_minutes',
    'mobility_radius_meters',
    'top_activity',
    'data_completeness',
    'computed_at',
  ]);

  const rows = records.map((record) => serializeCsvRow([
    record.date,
    record.stepsTotal,
    record.activeMinutes,
    record.distanceMeters,
    record.screenTimeSeconds,
    record.unlockCount,
    record.sleepEstimateMinutes ?? '',
    record.mobilityRadiusMeters ?? '',
    record.topActivity ?? '',
    record.dataCompleteness,
    record.computedAt,
  ]));

  return [header, ...rows].join('\n');
}

function getCollectorEventsCount(events: Record<string, ZentraEventRecord[]>): Record<string, { version: string; events: number }> {
  return Object.entries(events).reduce<Record<string, { version: string; events: number }>>((result, [key, value]) => {
    result[key] = { version: '1.0', events: value.length };
    return result;
  }, {});
}

function getIncludedTypes(events: Record<string, ZentraEventRecord[]>): string[] {
  return Object.keys(events);
}

function getExportFileName(format: ExportFormat, range: DateRangeSelection): string {
  return `Zentra_export_${range.start}_to_${range.end}_${format}.zip`;
}

function buildManifest(
  range: DateRangeSelection,
  events: Record<string, ZentraEventRecord[]>,
): Record<string, unknown> {
  return {
    schema_version: 1,
    app_version: '1.0.0',
    export_generated_at: new Date().toISOString(),
    date_range: {
      start: range.start,
      end: range.end,
    },
    data_types_included: getIncludedTypes(events),
    collectors: getCollectorEventsCount(events),
    device: {
      os_version: 'Android (prototype shell)',
      model_hash: 'prototype-shell',
    },
  };
}

export async function buildAndShareExportBundle(
  format: ExportFormat,
  range: DateRangeSelection,
  events: Record<string, ZentraEventRecord[]>,
  dailyAggregates: DailyAggregateRecord[] = [],
): Promise<{ fileName: string; estimatedBytes: number }> {
  const zip = new JSZip();
  const manifest = buildManifest(range, events);

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  if (dailyAggregates.length) {
    zip.file('daily_aggregates.csv', buildDailyAggregatesCsv(dailyAggregates));
  }

  if (format === 'json') {
    zip.file('events_full.json', JSON.stringify(events, null, 2));
  } else {
    Object.entries(events).forEach(([key, records]) => {
      zip.file(`events_${key}.csv`, buildEventsCsv(records));
    });
  }

  const base64 = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE',
  });

  if (!FileSystem.cacheDirectory) {
    throw new Error('Cache directory is unavailable.');
  }

  const fileName = getExportFileName(format, range);
  const outputPath = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(outputPath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(outputPath, {
      mimeType: 'application/zip',
      dialogTitle: 'Share Zentra export',
      UTI: 'public.zip-archive',
    });
  }

  return {
    fileName,
    estimatedBytes: Math.round((base64.length * 3) / 4),
  };
}

export function estimateExportBundleBytes(
  format: ExportFormat,
  events: Record<string, ZentraEventRecord[]>,
  dailyAggregates: DailyAggregateRecord[] = [],
): number {
  const manifestBytes = JSON.stringify(buildManifest({
    preset: 'today',
    start: '2026-04-10',
    end: '2026-04-10',
  }, events)).length;
  const aggregateBytes = dailyAggregates.reduce((total, record) => total + JSON.stringify(record).length, 0);
  const eventBytes = Object.values(events)
    .flat()
    .reduce((total, record) => total + JSON.stringify(record).length, 0);
  const multiplier = format === 'json' ? 1.15 : 0.9;

  return Math.round((manifestBytes + eventBytes + aggregateBytes) * multiplier);
}

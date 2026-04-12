import type { CollectorDiagnosticRecord, CollectorState } from "@/types/zentra";

export interface CollectorTelemetryItem {
  key: string;
  label: string;
  value: string;
}

function formatShortTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatRelativeAge(ms: number): string {
  if (ms < 60_000) {
    return "just now";
  }

  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function getCollectorTelemetryState(
  diagnostic: CollectorDiagnosticRecord | undefined,
): Partial<CollectorState> {
  if (!diagnostic) {
    return {};
  }

  return {
    diagnosticMessage: diagnostic.message ?? null,
    eventCount: diagnostic.eventCount,
    importedRecordCount: diagnostic.importedRecordCount,
    lastSuccessfulSyncAt: diagnostic.lastSuccessfulSyncAt,
    timeSinceLastGoodRunMs: diagnostic.timeSinceLastGoodRunMs,
  };
}

export function buildCollectorTelemetryItems(
  collector: CollectorState,
): CollectorTelemetryItem[] {
  const items: CollectorTelemetryItem[] = [];

  if (collector.lastSuccessfulSyncAt) {
    items.push({
      key: "last_success",
      label: "Last good sync",
      value: formatShortTimestamp(collector.lastSuccessfulSyncAt),
    });
  }

  if (
    collector.key === "healthConnect" &&
    typeof collector.importedRecordCount === "number"
  ) {
    items.push({
      key: "imports",
      label: "Imported",
      value: `${collector.importedRecordCount} record${collector.importedRecordCount === 1 ? "" : "s"}`,
    });
  } else if (typeof collector.eventCount === "number" && collector.eventCount > 0) {
    items.push({
      key: "events",
      label: "Captured",
      value: `${collector.eventCount} event${collector.eventCount === 1 ? "" : "s"}`,
    });
  }

  if (
    collector.health === "degraded" &&
    typeof collector.timeSinceLastGoodRunMs === "number"
  ) {
    items.push({
      key: "gap",
      label: "Gap",
      value: formatRelativeAge(collector.timeSinceLastGoodRunMs),
    });
  }

  return items;
}

export function buildDiagnosticTelemetrySummary(
  diagnostic: CollectorDiagnosticRecord,
): string {
  const segments = [
    diagnostic.status,
    diagnostic.message ?? "No message",
    `failures ${diagnostic.consecutiveFailures}`,
  ];

  if (diagnostic.lastSuccessfulSyncAt) {
    segments.push(`last good ${formatShortTimestamp(diagnostic.lastSuccessfulSyncAt)}`);
  }

  if (
    diagnostic.collectorKey === "healthConnect" &&
    typeof diagnostic.importedRecordCount === "number"
  ) {
    segments.push(`imports ${diagnostic.importedRecordCount}`);
  } else if (diagnostic.eventCount > 0) {
    segments.push(`events ${diagnostic.eventCount}`);
  }

  if (typeof diagnostic.timeSinceLastGoodRunMs === "number") {
    segments.push(`gap ${formatRelativeAge(diagnostic.timeSinceLastGoodRunMs)}`);
  }

  return segments.join(" · ");
}

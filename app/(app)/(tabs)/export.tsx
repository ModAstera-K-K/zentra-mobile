import { ActiveMinutesRefreshStatus } from "@/components/zentra/ActiveMinutesRefreshStatus";
import { useTabPerformance } from "@/hooks/use-tab-performance";
import React from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EmptyState } from "@/components/zentra/EmptyState";
import { ScreenLead } from "@/components/zentra/ScreenLead";
import { ScreenShell } from "@/components/zentra/ScreenShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineStatus } from "@/components/ui/InlineStatus";
import { Chip } from "@/components/ui/Chip";
import {
  getActionIcon,
  getDataModeIcon,
  getEventTypeIcon,
  isEventDataType,
} from "@/constants/iconography";
import {
  Colors,
  Fonts,
  FontSizes,
  Layout,
  IconSizes,
  Spacing,
} from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppStore, useRepositoryStore } from "@/stores";
import { useIsFocused } from "@react-navigation/native";
import type {
  ExportFormat,
  ExportMode,
  ExportPreset,
  UnifiedTimelineResolution,
} from "@/types/zentra";
import {
  enumerateISODateRange,
  getExportRangeForPreset,
  formatDateRangeLabel,
  isValidISODate,
} from "@/utils/dates";
import {
  getExportTypeCounts,
  getRepositoryRevision,
  type ExportTypeCount,
} from "@/utils/event-repository";
import { buildExportEvents, createDemoCollectors } from "@/utils/mock-data";
import { estimateExportBytes, timelineBucketCount } from "@/utils/export";
import { openExportFile, shareExportFile } from "@/utils/export-file-sink";
import {
  ExportDataChangingError,
  exportToFile,
  type ExportProgress,
  type ExportRequest,
} from "@/utils/export-job";
import {
  memoryExportSource,
  repositoryExportSource,
} from "@/utils/export-source";
import { formatBytes } from "@/utils/format";
import { startPerfTimer } from "@/utils/perf";
import { useShallow } from "zustand/react/shallow";
import { afterRender } from "@/utils/cooperative-work";

const PRESETS: ExportPreset[] = ["today", "week", "month", "all", "custom"];
const RESOLUTION_OPTIONS: {
  key: UnifiedTimelineResolution;
  label: string;
}[] = [
  { key: "minute", label: "1 min" },
  { key: "15min", label: "15 min" },
  { key: "hour", label: "1 hour" },
];
const SECTION_ICONS = {
  bundle: "archive-outline",
  dateRange: "calendar-outline",
  exportMode: "layers-outline",
  resolution: "time-outline",
  format: "document-text-outline",
  signals: "apps-outline",
} as const;
// The job reports every day read and every slice written; the screen is
// redrawn for it this often at most.
const PROGRESS_INTERVAL_MS = 120;

export default function ExportScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const isFocused = useIsFocused();
  useTabPerformance("export");
  const noteExport = useAppStore((state) => state.noteExport);
  const collectors = useAppStore((state) => state.collectors);
  const dataMode = useAppStore((state) => state.dataMode);
  const repositoryState = useRepositoryStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      todayDate: state.todayDate,
    })),
  );
  const [preset, setPreset] = React.useState<ExportPreset>("week");
  const [format, setFormat] = React.useState<ExportFormat>("json");
  const [exportMode, setExportMode] = React.useState<ExportMode>("unified");
  const [resolution, setResolution] =
    React.useState<UnifiedTimelineResolution>("15min");
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([]);
  // What the range holds, by record type. The records themselves are read
  // only when an export starts.
  const [loadedCounts, setLoadedCounts] = React.useState<{
    start: string;
    end: string;
    revision: string;
    counts: ExportTypeCount[];
  } | null>(null);
  const [isLoadingCounts, setIsLoadingCounts] = React.useState(false);
  // The export in progress. It belongs to the screen, not to its focus, so it
  // carries on while another tab is open.
  const [job, setJob] = React.useState<{
    controller: AbortController;
    progress: ExportProgress | null;
  } | null>(null);
  const [customRange, setCustomRange] = React.useState(() =>
    getExportRangeForPreset("custom"),
  );
  const focusReadyStopRef = React.useRef<
    | ((
        endContext?: Record<
          string,
          string | number | boolean | null | undefined
        >,
      ) => void)
    | null
  >(null);
  const today = repositoryState.todayDate;
  const range = React.useMemo(
    () => (preset === "custom" ? customRange : getExportRangeForPreset(preset)),
    // `today` moves the presets to the new day at midnight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customRange, preset, today],
  );
  const demoCollectors = React.useMemo(
    () => createDemoCollectors(collectors),
    [collectors],
  );
  const demoEvents = React.useMemo(
    () => (dataMode === "demo" ? buildExportEvents(demoCollectors, true) : null),
    [dataMode, demoCollectors],
  );
  const demoCounts = React.useMemo<ExportTypeCount[] | null>(
    () =>
      demoEvents &&
      Object.entries(demoEvents).map(([type, records]) => ({
        dataType: type as ExportTypeCount["dataType"],
        records: records.length,
        bytes: records.reduce(
          (total, record) => total + JSON.stringify(record).length,
          0,
        ),
      })),
    [demoEvents],
  );
  const hasValidRange =
    isValidISODate(range.start) &&
    isValidISODate(range.end) &&
    range.start <= range.end;
  const rangeCounts =
    loadedCounts?.start === range.start && loadedCounts.end === range.end
      ? loadedCounts.counts
      : null;
  const counts = demoCounts ?? rangeCounts;
  // Until the first count returns there is nothing to say the range is empty.
  const isCounting = dataMode !== "demo" && counts === null && hasValidRange;
  const availableTypes = React.useMemo(
    () => (counts ?? []).map((count) => count.dataType as string),
    [counts],
  );
  const availableTypesKey = availableTypes.join("|");
  const rangeDays = hasValidRange
    ? enumerateISODateRange(range.start, range.end).length
    : 0;
  const isExporting = job !== null;

  React.useEffect(() => {
    if (!isFocused) {
      focusReadyStopRef.current?.({ ready: false });
      focusReadyStopRef.current = null;
      return;
    }

    focusReadyStopRef.current?.({ replaced: true });
    focusReadyStopRef.current = startPerfTimer("export.focus_to_ready", {
      dataMode,
      exportMode,
      rangeEnd: range.end,
      rangeStart: range.start,
      resolution,
      screen: "export",
    });
  }, [dataMode, exportMode, isFocused, range.end, range.start, resolution]);

  React.useEffect(() => {
    if (!isFocused || dataMode === "demo" || !repositoryState.isHydrated) {
      return;
    }

    if (isLoadingCounts || !focusReadyStopRef.current) {
      return;
    }

    focusReadyStopRef.current({
      selectedTypeCount: selectedTypes.length,
      typeCount: availableTypes.length,
    });
    focusReadyStopRef.current = null;
  }, [
    availableTypes.length,
    dataMode,
    isFocused,
    isLoadingCounts,
    repositoryState.isHydrated,
    selectedTypes.length,
  ]);

  // Counts are read when the tab is opened or the range changes, and again on
  // a later visit only if the range was written to in between. A write while
  // the tab is open does not reload them: the export reads the records fresh.
  const loadedCountsRef = React.useRef(loadedCounts);
  loadedCountsRef.current = loadedCounts;
  React.useEffect(() => {
    if (
      dataMode === "demo" ||
      !repositoryState.isHydrated ||
      !hasValidRange ||
      !isFocused
    ) {
      return;
    }

    let isCancelled = false;
    const { start, end } = range;
    const task = afterRender(() => {
      void (async () => {
        const revision = await getRepositoryRevision(start, end);
        const known = loadedCountsRef.current;
        if (
          isCancelled ||
          (known?.start === start &&
            known.end === end &&
            known.revision === revision)
        )
          return;
        setIsLoadingCounts(true);
        const stopLoad = startPerfTimer("export.load_counts", {
          rangeEnd: end,
          rangeStart: start,
          screen: "export",
        });
        try {
          const next = await getExportTypeCounts(start, end);
          stopLoad({ isCancelled, typeCount: next.length });
          if (!isCancelled)
            setLoadedCounts({ start, end, revision, counts: next });
        } catch {
          stopLoad({ isCancelled, result: "error" });
          // An empty count shows the range as empty; the next visit retries.
          if (!isCancelled)
            setLoadedCounts({ start, end, revision: "", counts: [] });
        } finally {
          if (!isCancelled) setIsLoadingCounts(false);
        }
      })();
    });

    return () => {
      isCancelled = true;
      task.cancel();
      setIsLoadingCounts(false);
    };
    // The range is compared by its dates: the object is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataMode,
    hasValidRange,
    isFocused,
    range.end,
    range.start,
    repositoryState.isHydrated,
  ]);

  React.useEffect(() => {
    setSelectedTypes(availableTypesKey ? availableTypesKey.split("|") : []);
  }, [availableTypesKey]);

  function toggleType(type: string): void {
    setSelectedTypes((current) =>
      current.includes(type)
        ? current.filter((value) => value !== type)
        : [...current, type],
    );
  }

  const selectedRecords = React.useMemo(() => {
    const included = (counts ?? []).filter(
      (count) =>
        exportMode === "unified" || selectedTypes.includes(count.dataType),
    );
    return {
      records: included.reduce((total, count) => total + count.records, 0),
      bytes: included.reduce((total, count) => total + count.bytes, 0),
    };
  }, [counts, exportMode, selectedTypes]);
  const bundleEstimate = estimateExportBytes(
    { mode: exportMode, format, range, resolution, days: rangeDays },
    selectedRecords.bytes,
  );

  async function handleExport(): Promise<void> {
    if (exportMode === "raw" && !selectedTypes.length) {
      Alert.alert(
        "Pick at least one signal",
        "Select at least one signal to include in your bundle.",
      );
      return;
    }
    if (!hasValidRange) {
      Alert.alert("Check your dates", "Use YYYY-MM-DD format for both dates.");
      return;
    }

    const controller = new AbortController();
    setJob({ controller, progress: null });
    const request: ExportRequest = {
      mode: exportMode,
      format,
      range: { start: range.start, end: range.end },
      resolution,
      // Every type is included unless some were switched off.
      selectedTypes:
        exportMode === "raw" && selectedTypes.length < availableTypes.length
          ? selectedTypes
          : null,
    };
    let lastShown = 0;
    try {
      const result = await exportToFile(
        request,
        demoEvents
          ? memoryExportSource(Object.values(demoEvents).flat())
          : repositoryExportSource,
        openExportFile,
        {
          signal: controller.signal,
          onProgress: (progress) => {
            const now = Date.now();
            if (progress.fraction < 1 && now - lastShown < PROGRESS_INTERVAL_MS)
              return;
            lastShown = now;
            setJob((current) =>
              current?.controller === controller
                ? { controller, progress }
                : current,
            );
          },
        },
      );
      setJob(null);
      await shareExportFile(result.uri);
      await noteExport(new Date().toISOString());
      Alert.alert(
        "Your bundle is ready",
        `${result.fileName} is packaged up — ${formatBytes(result.bytes)}, ${result.records.toLocaleString()} records. Share it whenever you like.`,
      );
    } catch (error) {
      // A cancelled export says nothing: the button already did.
      if (controller.signal.aborted) return;
      if (error instanceof ExportDataChangingError)
        Alert.alert(
          "Your data is still changing",
          "Records were being added faster than Zentra could export them, as during a health import. Nothing was saved; try again in a moment.",
        );
      else
        Alert.alert(
          "Something went wrong",
          "Zentra couldn't create the bundle. Nothing was saved; give it another try.",
        );
    } finally {
      setJob((current) => (current?.controller === controller ? null : current));
    }
  }

  return (
    <ScreenShell subtitle="Take your data with you" title="Export">
      <ScreenLead
        body={
          dataMode === "demo"
            ? "Same format as a real export — just with sample data inside."
            : "Pick your date range, format, and signals. Zentra packages it up and keeps it here until you're ready to share."
        }
        eyebrow="Your bundle"
        status={
          <ActiveMinutesRefreshStatus
            enabled={
              dataMode !== "demo" && repositoryState.isHydrated && hasValidRange
            }
            end={range.end}
            start={range.start}
          />
        }
        footer={
          <View style={styles.leadFooter}>
            <Text style={[styles.leadMeta, { color: palette.textSecondary }]}>
              {formatDateRangeLabel(range.start, range.end)}
            </Text>
            <View style={styles.leadMetaRow}>
              <Ionicons
                color={palette.textSecondary}
                name={getDataModeIcon(dataMode)}
                size={IconSizes.inline}
              />
              <Text style={[styles.leadMeta, { color: palette.textSecondary }]}>
                {exportMode === "unified"
                  ? `${resolution} resolution`
                  : `${selectedTypes.length} signal${selectedTypes.length === 1 ? "" : "s"} selected`}
              </Text>
            </View>
          </View>
        }
        title={
          isCounting || availableTypes.length
            ? "Everything stays on your device until you decide to share it."
            : "Exports will show up once Zentra has something to bundle."
        }
      />

      {/* The range can always be changed, including away from an empty one. */}
      <Card style={styles.section}>
        <View style={styles.labelRow}>
          <Ionicons
            color={palette.textSecondary}
            name={SECTION_ICONS.dateRange}
            size={IconSizes.inline}
          />
          <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
            Date range
          </Text>
        </View>
        <View style={styles.chipRow}>
          {PRESETS.map((value) => (
            <Chip
              key={value}
              active={value === preset}
              label={value}
              onPress={() => setPreset(value)}
            />
          ))}
        </View>
        <Text style={[styles.helper, { color: palette.mutedForeground }]}>
          {formatDateRangeLabel(range.start, range.end)}
        </Text>
        {preset === "custom" ? (
          <View style={styles.customRangeRow}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) =>
                setCustomRange((current) => ({ ...current, start: value }))
              }
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.mutedForeground}
              style={[
                styles.dateInput,
                { borderColor: palette.border, color: palette.foreground },
              ]}
              value={customRange.start}
            />
            <Text
              style={[styles.helper, { color: palette.mutedForeground }]}
            >
              to
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) =>
                setCustomRange((current) => ({ ...current, end: value }))
              }
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.mutedForeground}
              style={[
                styles.dateInput,
                { borderColor: palette.border, color: palette.foreground },
              ]}
              value={customRange.end}
            />
          </View>
        ) : null}
      </Card>

      {!isCounting && !availableTypes.length ? (
        <EmptyState
          body="Once Zentra has captured some signals in this range, they'll appear here ready to bundle. Signals your device doesn't support simply won't show up."
          iconName="archive-outline"
          title="Nothing to bundle yet"
        />
      ) : (
        <>
          <Card style={styles.section}>
            <View style={styles.labelRow}>
              <Ionicons
                color={palette.textSecondary}
                name={SECTION_ICONS.exportMode}
                size={IconSizes.inline}
              />
              <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
                Export mode
              </Text>
            </View>
            <View style={styles.chipRow}>
              <Chip
                active={exportMode === "unified"}
                label="Unified timeline"
                leadingIconName="layers-outline"
                onPress={() => setExportMode("unified")}
              />
              <Chip
                active={exportMode === "raw"}
                label="Raw events"
                leadingIconName="albums-outline"
                onPress={() => setExportMode("raw")}
              />
            </View>
            <Text style={[styles.helper, { color: palette.mutedForeground }]}>
              {exportMode === "unified"
                ? "All signals aligned to a shared time axis — ready for analysis."
                : "Original event records grouped by signal type."}
            </Text>
          </Card>

          {exportMode === "unified" ? (
            <Card style={styles.section}>
              <View style={styles.labelRow}>
                <Ionicons
                  color={palette.textSecondary}
                  name={SECTION_ICONS.resolution}
                  size={IconSizes.inline}
                />
                <Text
                  style={[styles.eyebrow, { color: palette.textSecondary }]}
                >
                  Resolution
                </Text>
              </View>
              <View style={styles.chipRow}>
                {RESOLUTION_OPTIONS.map((option) => (
                  <Chip
                    key={option.key}
                    active={option.key === resolution}
                    label={option.label}
                    onPress={() => setResolution(option.key)}
                  />
                ))}
              </View>
              <Text style={[styles.helper, { color: palette.mutedForeground }]}>
                {rangeDays
                  ? `${timelineBucketCount(rangeDays, resolution).toLocaleString()} buckets, built when you export`
                  : "Buckets are built from your selected range."}
              </Text>
            </Card>
          ) : null}

          <Card style={styles.section}>
            <View style={styles.labelRow}>
              <Ionicons
                color={palette.textSecondary}
                name={SECTION_ICONS.format}
                size={IconSizes.inline}
              />
              <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
                Format
              </Text>
            </View>
            <View style={styles.chipRow}>
              <Chip
                active={format === "json"}
                label="JSON"
                leadingIconName="code-outline"
                onPress={() => setFormat("json")}
              />
              <Chip
                active={format === "csv"}
                label="CSV"
                leadingIconName="grid-outline"
                onPress={() => setFormat("csv")}
              />
            </View>
          </Card>

          {exportMode === "raw" ? (
            <Card style={styles.section}>
              <View style={styles.labelRow}>
                <Ionicons
                  color={palette.textSecondary}
                  name={SECTION_ICONS.signals}
                  size={IconSizes.inline}
                />
                <Text
                  style={[styles.eyebrow, { color: palette.textSecondary }]}
                >
                  Which signals
                </Text>
              </View>
              <View style={styles.chipRow}>
                {(counts ?? []).map(({ dataType: type, records }) => (
                  <Chip
                    key={type}
                    active={selectedTypes.includes(type)}
                    label={`${type.replace("_", " ")} · ${records.toLocaleString()}`}
                    leadingIconName={
                      isEventDataType(type)
                        ? getEventTypeIcon(type)
                        : "ellipse-outline"
                    }
                    onPress={() => toggleType(type)}
                  />
                ))}
              </View>
            </Card>
          ) : null}

          {/* One card in one place: the estimate, then the export's progress
              while it runs. */}
          <Card elevated style={styles.section}>
            <View style={styles.labelRow}>
              <Ionicons
                color={palette.textSecondary}
                name={SECTION_ICONS.bundle}
                size={IconSizes.inline}
              />
              <Text
                style={[
                  styles.summaryLabel,
                  styles.summaryLabelText,
                  { color: palette.textSecondary },
                ]}
              >
                {isExporting ? "Building your bundle" : "Bundle estimate"}
              </Text>
              {isCounting || isLoadingCounts ? (
                <InlineStatus
                  accessibilityLabel="Counting the records in this range"
                  busy
                  label="Counting"
                />
              ) : null}
            </View>
            {job ? (
              <View
                accessibilityLiveRegion="polite"
                accessibilityRole="progressbar"
                accessibilityValue={{
                  max: 100,
                  min: 0,
                  now: Math.round((job.progress?.fraction ?? 0) * 100),
                }}
                style={styles.progress}
              >
                <Text
                  style={[styles.summaryValue, { color: palette.primary }]}
                >
                  {`${Math.round((job.progress?.fraction ?? 0) * 100)}%`}
                </Text>
                <View
                  style={[styles.progressTrack, { backgroundColor: palette.card }]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: palette.primary,
                        width: `${Math.round((job.progress?.fraction ?? 0) * 100)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.helper, { color: palette.textSecondary }]}>
                  {!job.progress
                    ? "Starting…"
                    : job.progress.phase === "reading"
                      ? `Reading records · day ${job.progress.day} of ${job.progress.days} · ${job.progress.records.toLocaleString()} so far`
                      : `Writing the archive · ${job.progress.records.toLocaleString()} records`}
                </Text>
                <Text style={[styles.helper, { color: palette.textSecondary }]}>
                  You can switch tabs while this runs.
                </Text>
              </View>
            ) : (
              <>
                {/* The number keeps its line while the range is counted. */}
                <View style={styles.summaryValueLine}>
                  <Text
                    style={[
                      styles.summaryValue,
                      { color: palette.primary },
                      isCounting && styles.hidden,
                    ]}
                  >
                    {`About ${formatBytes(bundleEstimate)}`}
                  </Text>
                  {isCounting ? (
                    <View
                      style={[
                        styles.summaryValueBar,
                        { backgroundColor: palette.card },
                      ]}
                    />
                  ) : null}
                </View>
                <Text style={[styles.helper, { color: palette.textSecondary }]}>
                  {dataMode === "demo"
                    ? "Sample data plus a manifest — same structure you'd get with real signals."
                    : exportMode === "unified"
                      ? `Timeline buckets built from ${selectedRecords.records.toLocaleString()} records, and a manifest, before compression. Stays here until you share it.`
                      : `${selectedRecords.records.toLocaleString()} records and a manifest, before compression. Stays here until you share it.`}
                </Text>
              </>
            )}
          </Card>

          {job ? (
            <Button onPress={() => job.controller.abort()} variant="outline">
              Cancel
            </Button>
          ) : (
            <Button
              disabled={isCounting}
              leadingIconName={getActionIcon("export")}
              onPress={() => void handleExport()}
            >
              Export bundle
            </Button>
          )}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  leadFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  leadMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.xs,
  },
  leadMeta: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
  section: {
    gap: Spacing.md,
    marginBottom: Layout.sectionGap,
  },
  eyebrow: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 20,
    letterSpacing: 0,
  },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.xs,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  helper: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  customRangeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  dateInput: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    minHeight: 44,
    paddingHorizontal: Spacing.md,
  },
  summaryLabel: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 20,
    letterSpacing: 0,
  },
  summaryValue: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes["2xl"],
  },
  summaryLabelText: { flex: 1 },
  summaryValueLine: { justifyContent: "center" },
  summaryValueBar: {
    borderRadius: 6,
    height: 22,
    position: "absolute",
    width: "38%",
  },
  hidden: { opacity: 0 },
  progress: { gap: Spacing.sm },
  progressTrack: { borderRadius: 999, height: 8, overflow: "hidden" },
  progressFill: { borderRadius: 999, height: 8 },
});

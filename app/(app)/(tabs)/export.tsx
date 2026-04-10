import React from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";

import { EmptyState } from "@/components/zentra/EmptyState";
import { ScreenLead } from "@/components/zentra/ScreenLead";
import { ScreenShell } from "@/components/zentra/ScreenShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Colors, Fonts, FontSizes, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppStore, useRepositoryStore } from "@/stores";
import type { ExportFormat, ExportPreset } from "@/types/zentra";
import {
  getExportRangeForPreset,
  formatDateRangeLabel,
  isValidISODate,
} from "@/utils/dates";
import {
  getDailyAggregatesForRange,
  getGroupedEventsForRange,
} from "@/utils/event-repository";
import { buildExportEvents, createDemoCollectors } from "@/utils/mock-data";
import {
  buildAndShareExportBundle,
  estimateExportBundleBytes,
} from "@/utils/export";
import { formatBytes } from "@/utils/format";
import { useShallow } from "zustand/react/shallow";

const PRESETS: ExportPreset[] = ["today", "week", "month", "all", "custom"];

export default function ExportScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const noteExport = useAppStore((state) => state.noteExport);
  const collectors = useAppStore((state) => state.collectors);
  const dataMode = useAppStore((state) => state.dataMode);
  const repositoryState = useRepositoryStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      lastUpdatedAt: state.lastUpdatedAt,
    })),
  );
  const [preset, setPreset] = React.useState<ExportPreset>("week");
  const [format, setFormat] = React.useState<ExportFormat>("json");
  const [isExporting, setIsExporting] = React.useState(false);
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([]);
  const [liveEvents, setLiveEvents] = React.useState<
    Record<string, import("@/types/zentra").ZentraEventRecord[]>
  >({});
  const [liveAggregates, setLiveAggregates] = React.useState<
    import("@/types/zentra").DailyAggregateRecord[]
  >([]);
  const [customRange, setCustomRange] = React.useState(() =>
    getExportRangeForPreset("custom"),
  );
  const range =
    preset === "custom" ? customRange : getExportRangeForPreset(preset);
  const demoCollectors = createDemoCollectors(collectors);
  const allEvents =
    dataMode === "demo" ? buildExportEvents(demoCollectors, true) : liveEvents;
  const availableTypes =
    dataMode === "demo" ? Object.keys(allEvents) : Object.keys(liveEvents);
  const availableTypesKey = availableTypes.join("|");
  const hasValidRange =
    isValidISODate(range.start) &&
    isValidISODate(range.end) &&
    range.start <= range.end;

  React.useEffect(() => {
    if (dataMode === "demo" || !repositoryState.isHydrated || !hasValidRange) {
      return;
    }

    let isCancelled = false;

    async function loadLiveExportData(): Promise<void> {
      const [events, aggregates] = await Promise.all([
        getGroupedEventsForRange(range.start, range.end),
        getDailyAggregatesForRange(range.start, range.end),
      ]);

      if (isCancelled) {
        return;
      }

      setLiveEvents(events);
      setLiveAggregates(aggregates);
    }

    void loadLiveExportData();

    return () => {
      isCancelled = true;
    };
  }, [
    dataMode,
    hasValidRange,
    range.end,
    range.start,
    repositoryState.isHydrated,
    repositoryState.lastUpdatedAt,
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

  async function handleExport(): Promise<void> {
    if (!selectedTypes.length) {
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

    setIsExporting(true);

    try {
      const selectedEvents = Object.fromEntries(
        Object.entries(allEvents).filter(([key]) =>
          selectedTypes.includes(key),
        ),
      );
      const result = await buildAndShareExportBundle(
        format,
        range,
        selectedEvents,
        liveAggregates,
      );
      await noteExport(new Date().toISOString());
      Alert.alert(
        "Your bundle is ready",
        `${result.fileName} is packaged up — about ${formatBytes(result.estimatedBytes)}. Share it whenever you like.`,
      );
    } catch {
      Alert.alert(
        "Something went wrong",
        "Zentra couldn't create the bundle in this preview build. Give it another try.",
      );
    } finally {
      setIsExporting(false);
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
        footer={
          <View style={styles.leadFooter}>
            <Text style={[styles.leadMeta, { color: palette.textSecondary }]}>
              {formatDateRangeLabel(range.start, range.end)}
            </Text>
            <Text style={[styles.leadMeta, { color: palette.textSecondary }]}>
              {selectedTypes.length} signal
              {selectedTypes.length === 1 ? "" : "s"} selected
            </Text>
          </View>
        }
        title={
          availableTypes.length
            ? "Everything stays on your device until you decide to share it."
            : "Exports will show up once Zentra has something to bundle."
        }
      />

      {!availableTypes.length ? (
        <EmptyState
          body="Once Zentra has captured some signals, they'll appear here ready to bundle. Signals your device doesn't support simply won't show up."
          title="Nothing to bundle yet"
        />
      ) : (
        <>
          <Card style={styles.section}>
            <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
              Date range
            </Text>
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

          <Card style={styles.section}>
            <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
              Format
            </Text>
            <View style={styles.chipRow}>
              <Chip
                active={format === "json"}
                label="JSON"
                onPress={() => setFormat("json")}
              />
              <Chip
                active={format === "csv"}
                label="CSV"
                onPress={() => setFormat("csv")}
              />
            </View>
          </Card>

          <Card style={styles.section}>
            <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
              Which signals
            </Text>
            <View style={styles.chipRow}>
              {availableTypes.map((type) => (
                <Chip
                  key={type}
                  active={selectedTypes.includes(type)}
                  label={type.replace("_", " ")}
                  onPress={() => toggleType(type)}
                />
              ))}
            </View>
          </Card>

          <Card elevated style={styles.section}>
            <Text
              style={[styles.summaryLabel, { color: palette.textSecondary }]}
            >
              Bundle estimate
            </Text>
            <Text style={[styles.summaryValue, { color: palette.primary }]}>
              {formatBytes(
                estimateExportBundleBytes(
                  format,
                  range,
                  Object.fromEntries(
                    Object.entries(allEvents).filter(([key]) =>
                      selectedTypes.includes(key),
                    ),
                  ),
                  liveAggregates,
                ),
              )}
            </Text>
            <Text style={[styles.helper, { color: palette.textSecondary }]}>
              {dataMode === "demo"
                ? "Sample data plus a manifest — same structure you'd get with real signals."
                : "Your captured signals and a manifest. Stays here until you share it."}
            </Text>
          </Card>

          <Button onPress={() => void handleExport()}>
            {isExporting ? "Bundling…" : "Bundle and export"}
          </Button>
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
  leadMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  section: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.3,
    textTransform: "uppercase",
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
    fontFamily: Fonts.mono,
    fontSize: FontSizes.sm,
    minHeight: 44,
    paddingHorizontal: Spacing.md,
  },
  summaryLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes["2xl"],
  },
});

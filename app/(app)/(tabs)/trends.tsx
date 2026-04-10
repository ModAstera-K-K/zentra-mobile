import React from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState } from "@/components/zentra/EmptyState";
import { HeatmapCard } from "@/components/zentra/HeatmapCard";
import { ScreenShell } from "@/components/zentra/ScreenShell";
import { TrendChartCard } from "@/components/zentra/TrendChartCard";
import { Chip } from "@/components/ui/Chip";
import { Spacing } from "@/constants/theme";
import { useAppStore, useRepositoryStore } from "@/stores";
import type { TrendRange } from "@/types/zentra";
import { getDateRangeForTrendRange } from "@/utils/dates";
import {
  getDailyAggregatesForRange,
  getEventsForRange,
  recomputeDailyAggregatesForRange,
} from "@/utils/event-repository";
import { buildLiveHeatmap, buildLiveTrendSeries } from "@/utils/live-trends";
import {
  buildHeatmap,
  buildTrendSeries,
  createDemoCollectors,
} from "@/utils/mock-data";
import { useShallow } from "zustand/react/shallow";

const RANGE_OPTIONS: { label: string; value: TrendRange }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "Custom", value: "custom" },
];

export default function TrendsScreen() {
  const [range, setRange] = React.useState<TrendRange>("30d");
  const [liveSeries, setLiveSeries] = React.useState<
    import("@/types/zentra").TrendSeries[]
  >([]);
  const [liveHeatmap, setLiveHeatmap] = React.useState<
    import("@/types/zentra").HeatmapCell[]
  >([]);
  const [isLoadingLiveData, setIsLoadingLiveData] = React.useState(false);
  const collectors = useAppStore((state) => state.collectors);
  const dataMode = useAppStore((state) => state.dataMode);
  const repository = useRepositoryStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      lastUpdatedAt: state.lastUpdatedAt,
    })),
  );
  const demoCollectors = createDemoCollectors(collectors);
  const isDemoMode = dataMode === "demo";
  const rangeSelection = getDateRangeForTrendRange(range);
  const rangeStart = rangeSelection.start;
  const rangeEnd = rangeSelection.end;
  const series = isDemoMode
    ? buildTrendSeries(range, demoCollectors, true)
    : liveSeries;
  const heatmap = isDemoMode
    ? buildHeatmap(range, demoCollectors, true)
    : liveHeatmap;
  const hasCollectors = Object.values(collectors).some(
    (collector) => collector.enabled,
  );
  const hasLiveTrendData = series.length > 0 || heatmap.length > 0;
  const emptyTitle = isLoadingLiveData
    ? "Pulling things together…"
    : hasCollectors
      ? "Building your picture"
      : "Nothing to show yet";
  const emptyBody = isLoadingLiveData
    ? "Zentra is crunching your local history for this window. Just a moment."
    : hasCollectors
      ? "Come back once Zentra has a few days of signals to work with. Patterns take a little time to emerge."
      : "Turn on a collector in Settings. Trends start forming once your signals have had time to accumulate.";

  React.useEffect(() => {
    if (isDemoMode || !repository.isHydrated) {
      return;
    }

    let isCancelled = false;

    async function loadLiveTrends(): Promise<void> {
      setIsLoadingLiveData(true);

      try {
        await recomputeDailyAggregatesForRange(rangeStart, rangeEnd);
        const [aggregates, events] = await Promise.all([
          getDailyAggregatesForRange(rangeStart, rangeEnd),
          getEventsForRange(rangeStart, rangeEnd),
        ]);

        if (isCancelled) {
          return;
        }

        setLiveSeries(
          buildLiveTrendSeries(
            aggregates,
            { start: rangeStart, end: rangeEnd },
            events,
          ),
        );
        setLiveHeatmap(buildLiveHeatmap(events));
      } finally {
        if (!isCancelled) {
          setIsLoadingLiveData(false);
        }
      }
    }

    void loadLiveTrends();

    return () => {
      isCancelled = true;
    };
  }, [
    isDemoMode,
    rangeEnd,
    rangeStart,
    repository.isHydrated,
    repository.lastUpdatedAt,
  ]);

  return (
    <ScreenShell subtitle="How your days connect" title="Trends">
      <View style={styles.rangeRow}>
        {RANGE_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            active={option.value === range}
            label={option.label}
            onPress={() => setRange(option.value)}
          />
        ))}
      </View>

      {isDemoMode || hasLiveTrendData ? (
        <>
          {series.map((entry) => (
            <View key={entry.key} style={styles.sectionBlock}>
              <TrendChartCard series={entry} />
            </View>
          ))}
          <View style={styles.sectionBlock}>
            <HeatmapCard cells={heatmap} />
          </View>
        </>
      ) : (
        <EmptyState body={emptyBody} title={emptyTitle} />
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  rangeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  sectionBlock: {
    marginBottom: Spacing.lg,
  },
});

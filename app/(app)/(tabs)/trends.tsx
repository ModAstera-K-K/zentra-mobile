import React from "react";
import {
  FlatList,
  InteractionManager,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { DateRangePickerRow } from "@/components/zentra/DateRangePickerRow";
import { EmptyState } from "@/components/zentra/EmptyState";
import { ScreenShell } from "@/components/zentra/ScreenShell";
import { TrendChartCard } from "@/components/zentra/TrendChartCard";
import { Chip } from "@/components/ui/Chip";
import { Colors, Fonts, FontSizes, Layout, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppStore, useRepositoryStore } from "@/stores";
import type { TrendRange, TrendSeries } from "@/types/zentra";
import {
  formatDateRangeLabel,
  getDateRangeForTrendRange,
  isValidISODate,
  shiftISODate,
  toISODate,
} from "@/utils/dates";
import {
  getDailyAggregatesForRange,
  getEventsForRange,
} from "@/utils/event-repository";
import { buildLiveTrendSeries, groupTrendSeries } from "@/utils/live-trends";
import { buildTrendSeries, createDemoCollectors } from "@/utils/mock-data";
import { useShallow } from "zustand/react/shallow";
import type { TrendSeriesGroup } from "@/types/zentra";

type TrendListItem =
  | { type: "groupHeader"; key: string; group: TrendSeriesGroup }
  | { type: "chart"; key: string; series: TrendSeries };

const RANGE_OPTIONS: { label: string; value: TrendRange }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "Custom", value: "custom" },
];

export default function TrendsScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const [range, setRange] = React.useState<TrendRange>("30d");
  const [customRange, setCustomRange] = React.useState(() => {
    const end = toISODate(new Date());
    return { start: shiftISODate(end, -13), end };
  });
  const [liveSeries, setLiveSeries] = React.useState<TrendSeries[]>([]);
  const [isLoadingLiveData, setIsLoadingLiveData] = React.useState(false);
  const [hiddenSeriesKeys, setHiddenSeriesKeys] = React.useState<Set<string>>(
    new Set(),
  );
  const collectors = useAppStore((state) => state.collectors);
  const dataMode = useAppStore((state) => state.dataMode);
  const repository = useRepositoryStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      lastUpdatedAt: state.lastUpdatedAt,
    })),
  );
  const isDemoMode = dataMode === "demo";
  const demoCollectors = React.useMemo(
    () => createDemoCollectors(collectors),
    [collectors],
  );
  const rangeSelection =
    range === "custom" ? customRange : getDateRangeForTrendRange(range);
  const validCustom =
    range === "custom" &&
    isValidISODate(customRange.start) &&
    isValidISODate(customRange.end) &&
    customRange.start <= customRange.end;
  const rangeStart =
    range === "custom" && validCustom
      ? customRange.start
      : range === "custom"
        ? shiftISODate(toISODate(new Date()), -13)
        : rangeSelection.start;
  const rangeEnd =
    range === "custom" && validCustom
      ? customRange.end
      : range === "custom"
        ? toISODate(new Date())
        : rangeSelection.end;
  const series = React.useMemo(
    () =>
      isDemoMode ? buildTrendSeries(range, demoCollectors, true) : liveSeries,
    [isDemoMode, range, demoCollectors, liveSeries],
  );
  const hasCollectors = Object.values(collectors).some(
    (collector) => collector.enabled,
  );
  const hasLiveTrendData = series.length > 0;
  const groups = React.useMemo(() => groupTrendSeries(series), [series]);
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
        const [aggregates, trendEvents] = await Promise.all([
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
            trendEvents,
          ),
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingLiveData(false);
        }
      }
    }

    const interaction = InteractionManager.runAfterInteractions(() => {
      void loadLiveTrends();
    });

    return () => {
      isCancelled = true;
      interaction.cancel();
    };
  }, [
    isDemoMode,
    rangeEnd,
    rangeStart,
    repository.isHydrated,
    repository.lastUpdatedAt,
  ]);

  const flatItems: TrendListItem[] = React.useMemo(() => {
    const items: TrendListItem[] = [];
    for (const group of groups) {
      items.push({ type: "groupHeader", key: `header-${group.key}`, group });
      for (const entry of group.series) {
        if (!hiddenSeriesKeys.has(entry.key)) {
          items.push({ type: "chart", key: entry.key, series: entry });
        }
      }
    }
    return items;
  }, [groups, hiddenSeriesKeys]);

  const isAndroid = Platform.OS === "android";

  const renderItem = React.useCallback(
    ({ item }: { item: TrendListItem }) => {
      if (item.type === "groupHeader") {
        return (
          <View style={styles.groupBlock}>
            <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>
              {item.group.label}
            </Text>
            {item.group.series.length > 1 ? (
              <View style={styles.seriesToggleRow}>
                {item.group.series.map((entry) => (
                  <Pressable
                    key={entry.key}
                    onPress={() =>
                      setHiddenSeriesKeys((current) => {
                        const next = new Set(current);
                        if (next.has(entry.key)) {
                          next.delete(entry.key);
                        } else {
                          next.add(entry.key);
                        }
                        return next;
                      })
                    }
                    style={[
                      styles.seriesToggle,
                      {
                        borderColor: palette.border,
                        opacity: hiddenSeriesKeys.has(entry.key) ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.seriesToggleLabel,
                        { color: palette.textSecondary },
                      ]}
                    >
                      {entry.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        );
      }

      return (
        <View style={styles.sectionBlock}>
          <TrendChartCard series={item.series} />
        </View>
      );
    },
    [palette, hiddenSeriesKeys],
  );

  const listHeader = React.useMemo(
    () => (
      <>
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

        <Text style={[styles.helper, { color: palette.mutedForeground }]}>
          {formatDateRangeLabel(rangeStart, rangeEnd)}
        </Text>

        {range === "custom" ? (
          <DateRangePickerRow
            end={customRange.end}
            onChange={setCustomRange}
            start={customRange.start}
          />
        ) : null}
      </>
    ),
    [range, palette, rangeStart, rangeEnd, customRange],
  );

  return (
    <ScreenShell
      scrollable={false}
      subtitle="How your days connect"
      title="Trends"
    >
      {isDemoMode || hasLiveTrendData ? (
        <FlatList
          contentContainerStyle={{
            paddingBottom: isAndroid ? 0 : Layout.tabBarHeight + Spacing["4xl"],
          }}
          data={flatItems}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={listHeader}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <>
          {listHeader}
          <EmptyState
            body={emptyBody}
            iconName="analytics-outline"
            title={emptyTitle}
          />
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  groupBlock: {
    marginBottom: Spacing.md,
  },
  groupLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.3,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
  },
  helper: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  rangeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionBlock: {
    marginBottom: Spacing.lg,
  },
  seriesToggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  seriesToggle: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  seriesToggleLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
});

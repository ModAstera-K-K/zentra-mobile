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
import { TrendSurfaceCard } from "@/components/zentra/TrendSurfaceCard";
import { Chip } from "@/components/ui/Chip";
import { Colors, Fonts, FontSizes, Layout, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppStore, useRepositoryStore } from "@/stores";
import { useIsFocused } from "@react-navigation/native";
import type {
  TrendRange,
  TrendSeries,
  TrendSeriesGroup,
  TrendSurface,
} from "@/types/zentra";
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
import {
  buildLiveTrendSeries,
  buildLiveTrendSurfaces,
  groupTrendSeries,
} from "@/utils/live-trends";
import {
  buildDemoTrendSurfaces,
  buildTrendSeries,
  createDemoCollectors,
} from "@/utils/mock-data";
import { startPerfTimer } from "@/utils/perf";
import { useShallow } from "zustand/react/shallow";

type TrendListItem =
  | { type: "groupHeader"; key: string; group: TrendSeriesGroup }
  | { type: "surface"; key: string; surface: TrendSurface }
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
  const isFocused = useIsFocused();
  const [range, setRange] = React.useState<TrendRange>("30d");
  const [customRange, setCustomRange] = React.useState(() => {
    const end = toISODate(new Date());
    return { start: shiftISODate(end, -13), end };
  });
  const [liveSeries, setLiveSeries] = React.useState<TrendSeries[]>([]);
  const [liveSurfaces, setLiveSurfaces] = React.useState<TrendSurface[]>([]);
  const [isLoadingLiveData, setIsLoadingLiveData] = React.useState(false);
  const [hiddenSeriesKeys, setHiddenSeriesKeys] = React.useState<Set<string>>(
    new Set(),
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
  const lastLoadedRangeRef = React.useRef<{
    start: string;
    end: string;
    dataVersion: string | null;
  } | null>(null);
  const collectors = useAppStore((state) => state.collectors);
  const dataMode = useAppStore((state) => state.dataMode);
  const repository = useRepositoryStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      todayDataUpdatedAt: state.todayDataUpdatedAt,
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
  const surfaces = React.useMemo(
    () =>
      isDemoMode
        ? buildDemoTrendSurfaces(range, demoCollectors, true)
        : liveSurfaces,
    [isDemoMode, range, demoCollectors, liveSurfaces],
  );
  const hasCollectors = Object.values(collectors).some(
    (collector) => collector.enabled,
  );
  const hasLiveTrendData = series.length > 0 || surfaces.length > 0;
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
    if (!isFocused) {
      focusReadyStopRef.current?.({ ready: false });
      focusReadyStopRef.current = null;
      return;
    }

    focusReadyStopRef.current?.({ replaced: true });
    focusReadyStopRef.current = startPerfTimer("trends.focus_to_ready", {
      dataMode,
      range,
      screen: "trends",
    });
  }, [dataMode, isFocused, range]);

  React.useEffect(() => {
    if (
      !isFocused ||
      !repository.isHydrated ||
      isDemoMode ||
      isLoadingLiveData
    ) {
      return;
    }

    if (!focusReadyStopRef.current) {
      return;
    }

    focusReadyStopRef.current({
      rangeEnd,
      rangeStart,
      seriesCount: series.length,
      surfaceCount: surfaces.length,
    });
    focusReadyStopRef.current = null;
  }, [
    isDemoMode,
    isFocused,
    isLoadingLiveData,
    rangeEnd,
    rangeStart,
    repository.isHydrated,
    series.length,
    surfaces.length,
  ]);

  React.useEffect(() => {
    if (isDemoMode || !repository.isHydrated || !isFocused) {
      return;
    }

    // Skip reload if range and data version are unchanged (e.g. simple re-focus)
    const prev = lastLoadedRangeRef.current;
    if (
      prev &&
      prev.start === rangeStart &&
      prev.end === rangeEnd &&
      prev.dataVersion === repository.todayDataUpdatedAt
    ) {
      return;
    }

    let isCancelled = false;

    async function loadLiveTrends(): Promise<void> {
      setIsLoadingLiveData(true);
      const stopLoad = startPerfTimer("trends.load_live_range", {
        rangeEnd,
        rangeStart,
        screen: "trends",
      });
      let nextSeriesCount = 0;
      let nextSurfaceCount = 0;

      try {
        const [aggregates, trendEvents] = await Promise.all([
          getDailyAggregatesForRange(rangeStart, rangeEnd),
          getEventsForRange(rangeStart, rangeEnd),
        ]);

        // Guard before CPU-intensive computation — switching tabs sets isCancelled
        // but the check used to sit after buildLiveTrendSeries, which is O(N_days × N_events).
        if (isCancelled) {
          return;
        }

        const nextSeries = buildLiveTrendSeries(
          aggregates,
          { start: rangeStart, end: rangeEnd },
          trendEvents,
        );
        const nextSurfaces = buildLiveTrendSurfaces(trendEvents);
        nextSeriesCount = nextSeries.length;
        nextSurfaceCount = nextSurfaces.length;

        if (isCancelled) {
          return;
        }

        setLiveSeries(nextSeries);
        setLiveSurfaces(nextSurfaces);
        lastLoadedRangeRef.current = {
          start: rangeStart,
          end: rangeEnd,
          dataVersion: repository.todayDataUpdatedAt,
        };
      } finally {
        stopLoad({
          cancelled: isCancelled,
          seriesCount: nextSeriesCount,
          surfaceCount: nextSurfaceCount,
        });

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
    isFocused,
    rangeEnd,
    rangeStart,
    repository.isHydrated,
    repository.todayDataUpdatedAt,
  ]);

  const flatItems: TrendListItem[] = React.useMemo(() => {
    const items: TrendListItem[] = [];
    for (const group of groups) {
      items.push({ type: "groupHeader", key: `header-${group.key}`, group });
      for (const surface of surfaces) {
        if (surface.group === group.key) {
          items.push({
            type: "surface",
            key: `surface-${surface.key}`,
            surface,
          });
        }
      }
      for (const entry of group.series) {
        if (!hiddenSeriesKeys.has(entry.key)) {
          items.push({ type: "chart", key: entry.key, series: entry });
        }
      }
    }
    return items;
  }, [groups, hiddenSeriesKeys, surfaces]);

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

      if (item.type === "surface") {
        return (
          <View style={styles.sectionBlock}>
            <TrendSurfaceCard surface={item.surface} />
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
          style={styles.list}
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
  list: {
    flex: 1,
  },
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

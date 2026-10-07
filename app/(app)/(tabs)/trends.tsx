import { ActiveMinutesRefreshStatus } from "@/components/zentra/ActiveMinutesRefreshStatus";
import { useTabPerformance } from "@/hooks/use-tab-performance";
import { InsightsSection } from "@/components/zentra/InsightsSection";
import React from "react";
import {
  FlatList,
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
  ActivityScoreMaxima,
  DailyAggregateRecord,
  TrendRange,
  TrendSeries,
  TrendSeriesGroup,
  TrendSurface,
  ZentraEventRecord,
} from "@/types/zentra";
import {
  getActivityHistoryRevision,
  loadActivityHistory,
  type ActivityHistory,
} from "@/utils/activity-cache";
import {
  startActivityCacheSession,
  type ActivityCacheSession,
} from "@/utils/activity-cache-session";
import {
  buildActivityScoreMaxima,
  mergeActivityScoreMaxima,
  type ActivityScoreInput,
} from "@/utils/activity-intensity";
import {
  enumerateISODateRange,
  formatDateRangeLabel,
  getDateRangeForTrendRange,
  isValidISODate,
  parseISODate,
  shiftISODate,
  toISODate,
} from "@/utils/dates";
import {
  getDailyAggregatesForRange,
  getEventsCarriedIntoDay,
  getEventsOfTypeForRange,
  getRepositoryRevision,
} from "@/utils/event-repository";
import {
  GROUP_LABELS,
  GROUP_ORDER,
  buildLiveTrendSeries,
  buildLiveTrendSurfaces,
  buildTrendCompositeValues,
  groupTrendSeries,
} from "@/utils/live-trends";
import {
  buildTrendDaySummary,
  type TrendDaySummary,
} from "@/utils/trend-day-summary";
import { buildUnifiedTimelineAsync } from "@/utils/unified-timeline";
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

/** The few per-record reads a range still needs; everything else is per-day. */
interface TrendRangeRecords {
  aggregates: DailyAggregateRecord[];
  sleepEvents: ZentraEventRecord[];
  exerciseEvents: ZentraEventRecord[];
  /** Yesterday's records still running at midnight, when the range includes today. */
  carriedIntoToday: ZentraEventRecord[];
}

interface TrendTodayPart {
  scopeKey: string;
  summary: TrendDaySummary;
  samples: ActivityScoreInput[];
  maxima: ActivityScoreMaxima;
}

interface LiveTrends {
  series: TrendSeries[];
  surfaces: TrendSurface[];
}

const EMPTY_SERIES: TrendSeries[] = [];
const EMPTY_SURFACES: TrendSurface[] = [];

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
  useTabPerformance("trends");
  const [range, setRange] = React.useState<TrendRange>("30d");
  const [customRange, setCustomRange] = React.useState(() => {
    const end = toISODate(new Date());
    return { start: shiftISODate(end, -13), end };
  });
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(false);
  // The scope whose load failed, so the screen stops saying it is loading.
  const [failedScopeKey, setFailedScopeKey] = React.useState<string | null>(
    null,
  );
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
  const collectors = useAppStore((state) => state.collectors);
  const dataMode = useAppStore((state) => state.dataMode);
  const repository = useRepositoryStore(
    useShallow((state) => ({
      dataEpoch: state.dataEpoch,
      isHydrated: state.isHydrated,
      todayDataUpdatedAt: state.todayDataUpdatedAt,
      todayEvents: state.todayEvents,
    })),
  );
  const isDemoMode = dataMode === "demo";
  const demoCollectors = React.useMemo(
    () => createDemoCollectors(collectors),
    [collectors],
  );

  const rangeSelection: { start: string; end: string } =
    range === "custom" ? customRange : getDateRangeForTrendRange(range);

  // Check if user entered a range that is valid
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

  // Re-derived when the repository refreshes so the date advances at midnight.
  const today = React.useMemo(
    () => toISODate(new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repository.todayDataUpdatedAt],
  );

  // What is loaded for the selected range. New data inside it does not change
  // the scope; it only moves a revision, which queues another pass.
  const scope = React.useMemo(() => {
    if (isDemoMode) return null;
    const yesterday = shiftISODate(today, -1);
    return {
      key: `${repository.dataEpoch}:${rangeStart}:${rangeEnd}:${today}`,
      rangeStart,
      rangeEnd,
      today,
      // The day before the range: its records run into the first day and
      // count toward the range-wide labels and cards, as they always have.
      loadStart: shiftISODate(rangeStart, -1),
      // Stored days end yesterday; today is summarized from the live records.
      historyEnd: rangeEnd < yesterday ? rangeEnd : yesterday,
      includesToday: rangeStart <= today && rangeEnd >= today,
    };
  }, [isDemoMode, rangeEnd, rangeStart, repository.dataEpoch, today]);

  // A range is assembled from stored per-day summaries and hourly samples
  // (shared with the Today pattern), today's live records, and two small
  // reads of sleep and exercise records. It used to read every raw record in
  // the range, and start over whenever one was written.
  const [loadedHistory, setLoadedHistory] = React.useState<{
    scopeKey: string;
    history: ActivityHistory;
  } | null>(null);
  const [loadedRecords, setLoadedRecords] = React.useState<{
    scopeKey: string;
    records: TrendRangeRecords;
  } | null>(null);
  const [todayPart, setTodayPart] = React.useState<TrendTodayPart | null>(null);
  const history =
    scope && loadedHistory?.scopeKey === scope.key
      ? loadedHistory.history
      : null;
  const records =
    scope && loadedRecords?.scopeKey === scope.key
      ? loadedRecords.records
      : null;
  const currentToday =
    scope?.includesToday && todayPart?.scopeKey === scope.key
      ? todayPart
      : null;

  const sessionsRef = React.useRef<{
    history: ActivityCacheSession;
    records: ActivityCacheSession;
  } | null>(null);
  const revisionsRef = React.useRef<{
    scopeKey: string;
    history: string;
    records: string;
  } | null>(null);
  const loadTimerRef = React.useRef<ReturnType<typeof startPerfTimer> | null>(
    null,
  );

  React.useEffect(() => {
    if (!scope || !repository.isHydrated || !isFocused) return;
    const {
      key: scopeKey,
      historyEnd,
      includesToday,
      loadStart,
      rangeEnd: end,
      rangeStart: start,
      today: day,
    } = scope;

    loadTimerRef.current = startPerfTimer("trends.load_live_range", {
      rangeEnd: end,
      rangeStart: start,
      screen: "trends",
    });
    // Neither session is cancelled by a write: each pass only redoes what
    // changed, and a write mid-pass queues one more once writes pause.
    const sessions = {
      history: startActivityCacheSession({
        load: (signal, onProgress) =>
          loadActivityHistory(
            loadStart,
            historyEnd,
            loadStart,
            signal,
            onProgress,
            // Each report re-renders the charts: once a second is plenty.
            { trends: true, visibleProgressIntervalMs: 1000 },
          ),
        onHistory: (next, _revision, final) => {
          setLoadedHistory({ scopeKey, history: next });
          if (final) setFailedScopeKey(null);
        },
        onLoading: setIsLoadingHistory,
        // Keep the last successful range visible; the next change retries.
        onError: () => setFailedScopeKey(scopeKey),
      }),
      records: startActivityCacheSession<TrendRangeRecords>({
        load: async () => {
          const [aggregates, sleepEvents, exerciseEvents, carriedIntoToday] =
            await Promise.all([
              getDailyAggregatesForRange(start, end),
              getEventsOfTypeForRange("sleep_inferred", loadStart, end),
              getEventsOfTypeForRange("exercise_session", loadStart, end),
              includesToday ? getEventsCarriedIntoDay(day) : [],
            ]);
          return { aggregates, sleepEvents, exerciseEvents, carriedIntoToday };
        },
        onHistory: (next) => setLoadedRecords({ scopeKey, records: next }),
        onError: () => setFailedScopeKey(scopeKey),
      }),
    };
    sessionsRef.current = sessions;
    const known = revisionsRef.current;
    if (known?.scopeKey === scopeKey) {
      sessions.history.noteRevision(known.history);
      sessions.records.noteRevision(known.records);
    }

    return () => {
      sessions.history.stop();
      sessions.records.stop();
      if (sessionsRef.current === sessions) sessionsRef.current = null;
      setIsLoadingHistory(false);
    };
  }, [isFocused, repository.isHydrated, scope]);

  React.useEffect(() => {
    if (!scope || !repository.isHydrated || !isFocused) return;
    let isCancelled = false;
    const { key: scopeKey, historyEnd, loadStart, rangeEnd: end } = scope;
    void Promise.all([
      // Moves when a stored day in the range goes stale.
      getActivityHistoryRevision(loadStart, historyEnd),
      // Moves on any write in the range, including today's.
      getRepositoryRevision(loadStart, end),
    ])
      .then(([historyRevision, recordsRevision]) => {
        if (isCancelled) return;
        revisionsRef.current = {
          scopeKey,
          history: historyRevision,
          records: recordsRevision,
        };
        sessionsRef.current?.history.noteRevision(historyRevision);
        sessionsRef.current?.records.noteRevision(recordsRevision);
      })
      .catch(() => undefined);
    return () => {
      isCancelled = true;
    };
  }, [isFocused, repository.isHydrated, repository.todayDataUpdatedAt, scope]);

  // Today is not a stored day yet: summarize it from the records the
  // repository already holds, plus whatever ran in from last night.
  const carriedIntoToday = records?.carriedIntoToday;
  React.useEffect(() => {
    if (!scope?.includesToday || !repository.isHydrated || !isFocused) return;
    const controller = new AbortController();
    const { key: scopeKey, today: day } = scope;
    const events = repository.todayEvents;
    void buildUnifiedTimelineAsync(
      carriedIntoToday?.length ? [...carriedIntoToday, ...events] : events,
      {
        startTimestamp: parseISODate(day).toISOString(),
        endTimestamp: parseISODate(shiftISODate(day, 1)).toISOString(),
        resolution: "hour",
      },
      controller.signal,
      undefined,
      { labels: false },
    )
      .then((buckets) => {
        if (controller.signal.aborted) return;
        setTodayPart({
          scopeKey,
          summary: buildTrendDaySummary(day, events),
          samples: buckets,
          maxima: buildActivityScoreMaxima(buckets),
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [
    carriedIntoToday,
    isFocused,
    repository.isHydrated,
    repository.todayEvents,
    scope,
  ]);

  const assembled = React.useMemo<LiveTrends | null>(() => {
    if (!scope || !history || !records) return null;
    if (scope.includesToday && !currentToday) return null;
    // Nothing stored for the range yet (the first open): wait for the first
    // days rather than draw every chart empty.
    if (!history.visibleComplete && !history.trendsByDate.size) return null;
    const days = new Map(history.trendsByDate);
    const samples = new Map(history.samplesByDate);
    let maxima = history.maxima;
    if (currentToday) {
      days.set(scope.today, currentToday.summary);
      samples.set(scope.today, currentToday.samples);
      maxima = mergeActivityScoreMaxima(maxima, currentToday.maxima);
    }
    const inputs = {
      days,
      sleepEvents: records.sleepEvents,
      exerciseEvents: records.exerciseEvents,
    };
    return {
      series: buildLiveTrendSeries(
        records.aggregates,
        { start: scope.rangeStart, end: scope.rangeEnd },
        inputs,
        buildTrendCompositeValues(
          enumerateISODateRange(scope.rangeStart, scope.rangeEnd),
          samples,
          maxima,
        ),
      ),
      surfaces: buildLiveTrendSurfaces(inputs),
    };
  }, [currentToday, history, records, scope]);

  // The previous range stays on screen until the selected one has its first
  // result, which is one read of stored days away.
  const [shownLive, setShownLive] = React.useState<{
    epoch: number;
    live: LiveTrends;
  } | null>(null);
  React.useEffect(() => {
    if (assembled)
      setShownLive({ epoch: repository.dataEpoch, live: assembled });
  }, [assembled, repository.dataEpoch]);
  const live =
    assembled ??
    (shownLive?.epoch === repository.dataEpoch ? shownLive.live : null);
  const isLoadingLiveData =
    !isDemoMode && !assembled && failedScopeKey !== scope?.key;
  // Days of the range still being scored; their points are gaps until then.
  // A day or two refreshing after new data is too brief to announce.
  const pendingDays =
    history && isLoadingHistory && history.visibleRemaining > 2
      ? history.visibleRemaining
      : 0;

  React.useEffect(() => {
    if (!assembled || !loadTimerRef.current) return;
    loadTimerRef.current({
      cancelled: false,
      seriesCount: assembled.series.length,
      surfaceCount: assembled.surfaces.length,
    });
    loadTimerRef.current = null;
  }, [assembled]);

  const series = React.useMemo(
    () =>
      isDemoMode
        ? buildTrendSeries(range, demoCollectors, true)
        : (live?.series ?? EMPTY_SERIES),
    [isDemoMode, range, demoCollectors, live],
  );
  const surfaces = React.useMemo(
    () =>
      isDemoMode
        ? buildDemoTrendSurfaces(range, demoCollectors, true)
        : (live?.surfaces ?? EMPTY_SURFACES),
    [isDemoMode, range, demoCollectors, live],
  );
  const hasCollectors = Object.values(collectors).some(
    (collector) => collector.enabled,
  );
  const hasLiveTrendData = series.length > 0 || surfaces.length > 0;
  const groups = React.useMemo(() => {
    const seriesGroups = groupTrendSeries(series);
    const coveredKeys = new Set(seriesGroups.map((g) => g.key));
    const surfaceOnlyKeys = new Set(
      surfaces.map((s) => s.group).filter((key) => !coveredKeys.has(key)),
    );
    if (surfaceOnlyKeys.size === 0) {
      return seriesGroups;
    }
    const extra: TrendSeriesGroup[] = [...surfaceOnlyKeys].map((key) => ({
      key,
      label: GROUP_LABELS[key],
      series: [],
    }));
    return [...seriesGroups, ...extra].sort(
      (a, b) => GROUP_ORDER.indexOf(a.key) - GROUP_ORDER.indexOf(b.key),
    );
  }, [series, surfaces]);
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
                    accessibilityRole="button"
                    accessibilityLabel={`${entry.label} chart`}
                    accessibilityState={{
                      selected: !hiddenSeriesKeys.has(entry.key),
                    }}
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
        <InsightsSection />
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
        {pendingDays > 0 ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.helper, { color: palette.mutedForeground }]}
          >
            {`Loading ${pendingDays} more day${pendingDays === 1 ? "" : "s"} of this range...`}
          </Text>
        ) : null}

        {range === "custom" ? (
          <DateRangePickerRow
            end={customRange.end}
            onChange={setCustomRange}
            start={customRange.start}
          />
        ) : null}
      </>
    ),
    [range, palette, rangeStart, rangeEnd, customRange, pendingDays],
  );

  return (
    <ScreenShell
      scrollable={false}
      subtitle="How your days connect"
      title="Trends"
    >
      <ActiveMinutesRefreshStatus
        enabled={!isDemoMode && repository.isHydrated}
        start={rangeStart}
        end={rangeEnd}
      />
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
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
    marginBottom: Spacing.md,
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
    marginBottom: Layout.sectionGap,
  },
  seriesToggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  seriesToggle: {
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  seriesToggleLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
});

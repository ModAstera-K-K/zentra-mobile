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
import type { InlineStatusProps } from "@/components/ui/InlineStatus";
import { Colors, Fonts, FontSizes, Layout, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppStore, useRepositoryStore } from "@/stores";
import { useIsFocused } from "@react-navigation/native";
import type {
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
import type { ActivityScoreInput } from "@/utils/activity-intensity";
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
  getStoredDayRevision,
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
import {
  hasLoadFailure,
  noteLoadResult,
  type LoadFailures,
} from "@/utils/load-failures";
import { keepUnchanged } from "@/utils/keep-unchanged";
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
  // React Compiler has never compiled this screen. Opting in is its own change,
  // to be measured on a device.
  "use no memo";
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
  // Which of the range's two loads failed, so the screen stops saying it is
  // loading. Each is cleared only by its own success.
  const [loadFailures, setLoadFailures] = React.useState<LoadFailures<
    "history" | "records"
  > | null>(null);
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
      todayDate: state.todayDate,
      todayEvents: state.todayEvents,
    })),
  );
  const isDemoMode = dataMode === "demo";
  const demoCollectors = React.useMemo(
    () => createDemoCollectors(collectors),
    [collectors],
  );

  // The store's day, so ranges and today's records move to a new day together.
  const today = repository.todayDate;

  const rangeSelection: { start: string; end: string } =
    range === "custom" ? customRange : getDateRangeForTrendRange(range, today);

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
        ? shiftISODate(today, -13)
        : rangeSelection.start;
  const rangeEnd =
    range === "custom" && validCustom
      ? customRange.end
      : range === "custom"
        ? today
        : rangeSelection.end;

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
  // The revisions the loaded range already reflects. A session started for the
  // same range begins from them, so returning to the tab with nothing changed
  // runs no load.
  const handledRef = React.useRef<{
    scopeKey: string;
    history?: string;
    records?: string;
  } | null>(null);
  const [loadRetry, setLoadRetry] = React.useState(0);
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
    const handled =
      handledRef.current?.scopeKey === scopeKey ? handledRef.current : null;
    const noteHandled = (load: "history" | "records", revision: string) => {
      handledRef.current = {
        ...(handledRef.current?.scopeKey === scopeKey ? handledRef.current : {}),
        scopeKey,
        [load]: revision,
      };
    };
    // Neither session is cancelled by a write: each pass only redoes what
    // changed, and a write mid-pass queues one more once writes pause.
    const sessions = {
      history: startActivityCacheSession({
        handled: handled?.history,
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
        onHistory: (next, revision, final) => {
          setLoadedHistory({ scopeKey, history: next });
          if (!final) return;
          noteHandled("history", revision);
          setLoadFailures((current) =>
            noteLoadResult(current, scopeKey, "history", false),
          );
        },
        onLoading: setIsLoadingHistory,
        // Keep the last successful range visible; the next change retries.
        onError: () =>
          setLoadFailures((current) =>
            noteLoadResult(current, scopeKey, "history", true),
          ),
      }),
      records: startActivityCacheSession<TrendRangeRecords>({
        handled: handled?.records,
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
        onHistory: (next, revision) => {
          setLoadedRecords({ scopeKey, records: next });
          noteHandled("records", revision);
          setLoadFailures((current) =>
            noteLoadResult(current, scopeKey, "records", false),
          );
        },
        onError: () =>
          setLoadFailures((current) =>
            noteLoadResult(current, scopeKey, "records", true),
          ),
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
  }, [isFocused, loadRetry, repository.isHydrated, scope]);

  React.useEffect(() => {
    if (!scope || !repository.isHydrated || !isFocused) return;
    let isCancelled = false;
    const { key: scopeKey, historyEnd, loadStart, rangeEnd: end } = scope;
    void Promise.all([
      // Moves when a stored day in the range goes stale.
      getActivityHistoryRevision(loadStart, historyEnd),
      // Moves on a write the range's aggregates, sleep or exercise records
      // can depend on, including today's. Light, network and heart-rate
      // readings change none of them.
      getStoredDayRevision(loadStart, end),
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
  }, [
    isFocused,
    loadRetry,
    repository.isHydrated,
    repository.todayDataUpdatedAt,
    scope,
  ]);

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

  const lastAssembledRef = React.useRef<LiveTrends | null>(null);
  const assembled = React.useMemo<LiveTrends | null>(() => {
    if (!scope || !history || !records) return null;
    if (scope.includesToday && !currentToday) return null;
    // Nothing stored for the range yet (the first open): wait for the first
    // days rather than draw every chart empty.
    if (!history.visibleComplete && !history.trendsByDate.size) return null;
    const days = new Map(history.trendsByDate);
    const samples = new Map(history.samplesByDate);
    if (currentToday) {
      days.set(scope.today, currentToday.summary);
      samples.set(scope.today, currentToday.samples);
    }
    const inputs = {
      days,
      sleepEvents: records.sleepEvents,
      exerciseEvents: records.exerciseEvents,
    };
    const previous = lastAssembledRef.current;
    const next = {
      series: buildLiveTrendSeries(
        records.aggregates,
        { start: scope.rangeStart, end: scope.rangeEnd },
        inputs,
        // Scaled by the selected days alone. The loaded window also holds the
        // day before the range, which must not set the scale.
        buildTrendCompositeValues(
          enumerateISODateRange(scope.rangeStart, scope.rangeEnd),
          samples,
        ),
      ),
      surfaces: buildLiveTrendSurfaces(inputs),
    };
    // A rebuild usually changes a point or two, or nothing. Charts whose
    // series came out the same keep the object they had, so they are not
    // drawn again and keep the point the user selected.
    const series = keepUnchanged(previous?.series, next.series, (entry) => entry.key);
    const surfaces = keepUnchanged(previous?.surfaces, next.surfaces, (entry) => entry.key);
    const kept =
      previous && series === previous.series && surfaces === previous.surfaces
        ? previous
        : { series, surfaces };
    lastAssembledRef.current = kept;
    return kept;
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
    !isDemoMode && !assembled && !hasLoadFailure(loadFailures, scope?.key);
  // Days of the range still being scored; their points are gaps until then.
  // A day or two refreshing after new data is too brief to announce.
  const pendingDays =
    history && isLoadingHistory && history.visibleRemaining > 2
      ? history.visibleRemaining
      : 0;
  // The charts on screen belong to the range selected before this one.
  const showsPreviousRange = !isDemoMode && !assembled && !!live;
  const loadFailed = !isDemoMode && hasLoadFailure(loadFailures, scope?.key);
  const retryLoad = React.useCallback(() => {
    handledRef.current = null;
    setLoadFailures(null);
    setLoadRetry((count) => count + 1);
  }, []);
  // What the end of the date line says. It is one line that is always there,
  // so none of these moves the charts.
  const rangeStatus = React.useMemo<InlineStatusProps | null>(
    () =>
      loadFailed
        ? {
            accessibilityLabel: showsPreviousRange
              ? "This range could not be loaded. Showing the previous range."
              : "This range could not be loaded. Showing the last result.",
            action: { label: "Retry", onPress: retryLoad },
            label: "Couldn't load",
          }
        : showsPreviousRange
          ? {
              accessibilityLabel:
                "Loading this range. Showing the previous range.",
              busy: true,
              label: "Loading range",
            }
          : pendingDays > 0
            ? {
                accessibilityLabel: `Loading ${pendingDays} more day${pendingDays === 1 ? "" : "s"} of this range`,
                busy: true,
                label: `${pendingDays} more day${pendingDays === 1 ? "" : "s"} loading`,
              }
            : null,
    [loadFailed, pendingDays, retryLoad, showsPreviousRange],
  );

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

      // Charts left over from the previous range are dimmed until the
      // selected one has loaded; they keep their place.
      const block = showsPreviousRange
        ? [styles.sectionBlock, styles.previousRange]
        : styles.sectionBlock;
      if (item.type === "surface") {
        return (
          <View style={block}>
            <TrendSurfaceCard surface={item.surface} />
          </View>
        );
      }

      return (
        <View style={block}>
          <TrendChartCard series={item.series} />
        </View>
      );
    },
    [palette, hiddenSeriesKeys, showsPreviousRange],
  );

  const refreshesActiveMinutes = !isDemoMode && repository.isHydrated;
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

        {/* One line that is always there: the range, then whatever is
            still loading for it. */}
        <View style={styles.rangeLine}>
          <Text
            numberOfLines={1}
            style={[styles.rangeLabel, { color: palette.mutedForeground }]}
          >
            {formatDateRangeLabel(rangeStart, rangeEnd)}
          </Text>
          <ActiveMinutesRefreshStatus
            before={rangeStatus}
            enabled={refreshesActiveMinutes}
            end={rangeEnd}
            start={rangeStart}
          />
        </View>

        {range === "custom" ? (
          <DateRangePickerRow
            end={customRange.end}
            onChange={setCustomRange}
            start={customRange.start}
          />
        ) : null}
      </>
    ),
    [
      range,
      palette,
      rangeStart,
      rangeEnd,
      customRange,
      rangeStatus,
      refreshesActiveMinutes,
    ],
  );

  const listEmpty = React.useMemo(
    () => (
      <EmptyState
        body={emptyBody}
        iconName="analytics-outline"
        title={emptyTitle}
      />
    ),
    [emptyBody, emptyTitle],
  );

  return (
    <ScreenShell
      scrollable={false}
      subtitle="How your days connect"
      title="Trends"
    >
      {/* The list is always there, so the header keeps its place whether or
          not there is anything to chart yet. */}
      <FlatList
        contentContainerStyle={{
          paddingBottom: isAndroid ? 0 : Layout.tabBarHeight + Spacing["4xl"],
        }}
        data={flatItems}
        keyExtractor={(item) => item.key}
        ListEmptyComponent={listEmpty}
        ListHeaderComponent={listHeader}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
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
  rangeLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
    minHeight: 20,
  },
  rangeLabel: {
    flexShrink: 1,
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
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
  previousRange: {
    opacity: 0.45,
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

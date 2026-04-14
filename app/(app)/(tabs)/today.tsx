import React from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  InteractionManager,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ActivityPatternCard } from "@/components/zentra/ActivityPatternCard";
import { ActivityStrip } from "@/components/zentra/ActivityStrip";
import { CompletenessCard } from "@/components/zentra/CompletenessCard";
import { DetailSheet } from "@/components/zentra/DetailSheet";
import { EmptyState } from "@/components/zentra/EmptyState";
import { MetricCard } from "@/components/zentra/MetricCard";
import { PilotLight } from "@/components/zentra/PilotLight";
import { RecentSignalFeed } from "@/components/zentra/RecentSignalFeed";
import { ScreenShell } from "@/components/zentra/ScreenShell";
import { SignalSummaryCard } from "@/components/zentra/SignalSummaryCard";
import { SleepEstimateCard } from "@/components/zentra/SleepEstimateCard";
import { Card } from "@/components/ui/Card";
import { Colors, Fonts, FontSizes, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppStore, useRepositoryStore, useSignalStore } from "@/stores";
import type {
  ActivityNormalizationWindow,
  ActivityPatternCell,
  DashboardMetric,
  PermissionStatus,
  ZentraEventRecord,
} from "@/types/zentra";
import type {
  TodayDetailPayload,
  TodayRecentSignalRow,
  TodaySummaryMetric,
} from "@/utils/today-visualization";
import { getActivityNormalizationRange } from "@/utils/activity-intensity";
import { formatScreenDate, shiftISODate } from "@/utils/dates";
import {
  buildCollectorStatuses,
  buildLiveDashboardMetrics,
  buildLiveSleepEstimate,
} from "@/utils/device-signals";
import { buildActivityPatternDetailPayload } from "@/utils/activity-pattern-detail";
import { buildDemoTimelineEvents } from "@/utils/demo-timeline-events";
import {
  getEventsForRange,
  getRepositoryDateBounds,
} from "@/utils/event-repository";
import { useIsFocused } from "@react-navigation/native";
import {
  buildMonthlyActivityPattern,
  buildUnifiedDailyTimeline,
} from "@/utils/unified-timeline";
import { getActivityRecognitionPermissionStatusAsync } from "@/utils/native/zentra-native-signals";
import {
  buildTodayDerivedEvents,
  buildRecentSignalDetailPayload,
  buildRecentSignalRows,
  buildSignalHealthSummary,
  buildTodayMetricDetailPayload,
  buildTodaySecondaryMetrics,
} from "@/utils/today-visualization";
import {
  buildDashboardMetrics,
  buildSleepEstimate,
  createDemoCollectors,
} from "@/utils/mock-data";
import { startPerfTimer, timeSyncOperation } from "@/utils/perf";
import { useShallow } from "zustand/react/shallow";

function getActivityNormalizationLabel(
  window: ActivityNormalizationWindow,
): string {
  switch (window) {
    case "month":
      return "rolling month";
    case "all":
      return "all-time history";
    default:
      return "rolling year";
  }
}

type TodaySectionKey =
  | "pattern"
  | "metrics"
  | "activityStrip"
  | "secondaryMetrics"
  | "sleep"
  | "recentSignals"
  | "completeness";

export default function TodayScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const isFocused = useIsFocused();
  const collectors = useAppStore((state) => state.collectors);
  const activityNormalizationWindow = useAppStore(
    (state) => state.activityNormalizationWindow,
  );
  const dataMode = useAppStore((state) => state.dataMode);
  const repository = useRepositoryStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      todayDataUpdatedAt: state.todayDataUpdatedAt,
      todaySnapshot: state.todaySnapshot,
      todayAggregate: state.todayAggregate,
      todayEvents: state.todayEvents,
      latestSleepEvent: state.latestSleepEvent,
      diagnostics: state.diagnostics,
    })),
  );
  const refreshTodayData = useRepositoryStore(
    (state) => state.refreshTodayData,
  );
  const signals = useSignalStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      stepCount: state.stepCount,
      stepSupported: state.stepSupported,
      stepPermissionStatus: state.stepPermissionStatus,
      stepLastUpdatedAt: state.stepLastUpdatedAt,
      batterySupported: state.batterySupported,
      batteryLevel: state.batteryLevel,
      batteryStateLabel: state.batteryStateLabel,
      lowPowerMode: state.lowPowerMode,
      batteryLastUpdatedAt: state.batteryLastUpdatedAt,
      locationSupported: state.locationSupported,
      locationPermissionStatus: state.locationPermissionStatus,
      locationServicesEnabled: state.locationServicesEnabled,
      locationSamples: state.locationSamples,
      locationLastUpdatedAt: state.locationLastUpdatedAt,
      ambientLightSupported: state.ambientLightSupported,
      ambientLightLux: state.ambientLightLux,
      ambientLightLastUpdatedAt: state.ambientLightLastUpdatedAt,
    })),
  );
  const isDemoMode = dataMode === "demo";
  const demoCollectors = React.useMemo(
    () => createDemoCollectors(collectors),
    [collectors],
  );
  const [activityPermissionStatus, setActivityPermissionStatus] =
    React.useState<PermissionStatus>("not_requested");
  const [selectedDetail, setSelectedDetail] =
    React.useState<TodayDetailPayload | null>(null);
  const [historicalPatternEvents, setHistoricalPatternEvents] = React.useState<
    ZentraEventRecord[]
  >([]);
  const [hasLoadedPattern, setHasLoadedPattern] = React.useState(false);
  const [isLoadingPatternHistory, setIsLoadingPatternHistory] =
    React.useState(false);
  const [isRefreshingTodayData, setIsRefreshingTodayData] =
    React.useState(false);
  const focusReadyStopRef = React.useRef<
    | ((
        endContext?: Record<
          string,
          string | number | boolean | null | undefined
        >,
      ) => void)
    | null
  >(null);
  const todayAnchor = React.useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
    // Re-derive when the repository refreshes so the anchor advances at midnight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository.todayDataUpdatedAt]);

  React.useEffect(() => {
    if (!isFocused) {
      focusReadyStopRef.current?.({ ready: false });
      focusReadyStopRef.current = null;
      return;
    }

    focusReadyStopRef.current?.({ replaced: true });
    focusReadyStopRef.current = startPerfTimer("today.focus_to_ready", {
      dataMode,
      screen: "today",
    });
  }, [dataMode, isFocused]);

  React.useEffect(() => {
    if (!isFocused) {
      return;
    }

    const hasEnabledCollectors = Object.values(collectors).some(
      (collector) => collector.enabled,
    );

    const readyForFirstPaint =
      (isDemoMode || repository.isHydrated) &&
      hasEnabledCollectors &&
      (isDemoMode || hasLoadedPattern);

    if (!readyForFirstPaint || !focusReadyStopRef.current) {
      return;
    }

    focusReadyStopRef.current({
      events: repository.todayEvents.length,
      hasCollectors: hasEnabledCollectors,
      hasLoadedPattern,
      ready: true,
    });
    focusReadyStopRef.current = null;
  }, [
    collectors,
    hasLoadedPattern,
    isDemoMode,
    isFocused,
    repository.isHydrated,
    repository.todayEvents.length,
  ]);

  React.useEffect(() => {
    if (isDemoMode || !collectors.activity.enabled) {
      setActivityPermissionStatus("not_requested");
      return;
    }

    void getActivityRecognitionPermissionStatusAsync().then(
      setActivityPermissionStatus,
    );
  }, [collectors.activity.enabled, isDemoMode]);

  React.useEffect(() => {
    if (isDemoMode || !repository.isHydrated || !isFocused) {
      return;
    }

    let isCancelled = false;

    async function loadPatternHistoryEvents(): Promise<void> {
      setIsLoadingPatternHistory(true);
      const stopLoadPattern = startPerfTimer("today.load_pattern_history", {
        normalizationWindow: activityNormalizationWindow,
        screen: "today",
        todayAnchor,
      });

      try {
        const bounds = await getRepositoryDateBounds();
        const range = getActivityNormalizationRange(
          todayAnchor,
          activityNormalizationWindow,
          bounds?.start,
        );
        const historicalEnd = shiftISODate(todayAnchor, -1);

        if (range.start > historicalEnd) {
          if (!isCancelled) {
            setHistoricalPatternEvents([]);
            setHasLoadedPattern(true);
          }

          stopLoadPattern({
            eventCount: 0,
            rangeStart: range.start,
            reason: "empty_range",
          });
          setIsLoadingPatternHistory(false);
          return;
        }

        const events = await getEventsForRange(range.start, historicalEnd);

        if (!isCancelled) {
          setHistoricalPatternEvents(events);
          setHasLoadedPattern(true);
        }

        stopLoadPattern({
          eventCount: events.length,
          rangeStart: range.start,
          reason: "loaded",
        });
        setIsLoadingPatternHistory(false);
      } catch {
        stopLoadPattern({ reason: "error" });
        setIsLoadingPatternHistory(false);
        // keep previous data on failure
      }
    }

    const interaction = InteractionManager.runAfterInteractions(() => {
      void loadPatternHistoryEvents();
    });

    return () => {
      isCancelled = true;
      interaction.cancel();
    };
  }, [
    isDemoMode,
    isFocused,
    repository.isHydrated,
    todayAnchor,
    activityNormalizationWindow,
  ]);

  // Heartbeat: refresh dashboard on a 30-second interval and when the app
  // returns to the foreground so cards stay current even if a collector
  // callback was missed.
  React.useEffect(() => {
    if (isDemoMode || !repository.isHydrated || !isFocused) {
      return;
    }

    let interval: ReturnType<typeof setInterval> | null = null;
    let isRefreshing = false;

    async function runRefresh(): Promise<void> {
      if (isRefreshing) {
        return;
      }

      isRefreshing = true;
      setIsRefreshingTodayData(true);
      const stopRefresh = startPerfTimer("today.refresh_today_data", {
        screen: "today",
      });

      try {
        await refreshTodayData();
        stopRefresh({ result: "ok" });
      } catch {
        stopRefresh({ result: "error" });
      } finally {
        isRefreshing = false;
        setIsRefreshingTodayData(false);
      }
    }

    function startInterval(): void {
      if (interval) {
        return;
      }

      interval = setInterval(() => {
        void runRefresh();
      }, 30_000);
    }

    function stopInterval(): void {
      if (!interval) {
        return;
      }

      clearInterval(interval);
      interval = null;
    }

    if (AppState.currentState === "active") {
      startInterval();
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        startInterval();
        void runRefresh();
        return;
      }

      stopInterval();
    });

    return () => {
      stopInterval();
      subscription.remove();
    };
  }, [isDemoMode, isFocused, repository.isHydrated, refreshTodayData]);

  const metrics = React.useMemo(
    () =>
      isDemoMode
        ? buildDashboardMetrics(demoCollectors, true)
        : buildLiveDashboardMetrics(
            collectors,
            signals,
            repository.todaySnapshot,
            repository.todayAggregate,
            repository.todayEvents,
          ),
    [
      isDemoMode,
      demoCollectors,
      collectors,
      signals,
      repository.todaySnapshot,
      repository.todayAggregate,
      repository.todayEvents,
    ],
  );
  const sleepEstimate = React.useMemo(
    () =>
      isDemoMode
        ? buildSleepEstimate(demoCollectors, true)
        : buildLiveSleepEstimate(repository.latestSleepEvent),
    [isDemoMode, demoCollectors, repository.latestSleepEvent],
  );
  const visibleCollectors = React.useMemo(
    () =>
      isDemoMode
        ? Object.values(demoCollectors).filter((collector) => collector.enabled)
        : buildCollectorStatuses(collectors, signals, repository.diagnostics, {
            hasLatestSleepEstimate: Boolean(repository.latestSleepEvent),
            permissionStatusByCollector: {
              activity: collectors.activity.enabled
                ? activityPermissionStatus
                : "not_requested",
            },
          }).filter((collector) => collector.enabled),
    [
      isDemoMode,
      demoCollectors,
      collectors,
      signals,
      repository.diagnostics,
      repository.latestSleepEvent,
      activityPermissionStatus,
    ],
  );
  const hasCollectors = Object.values(collectors).some(
    (collector) => collector.enabled,
  );
  const derivedTodayEvents = React.useMemo(
    () => buildTodayDerivedEvents(repository.todayEvents),
    [repository.todayEvents],
  );
  const secondaryMetrics: TodaySummaryMetric[] = React.useMemo(
    () =>
      isDemoMode
        ? []
        : buildTodaySecondaryMetrics(
            repository.todayAggregate,
            repository.todaySnapshot,
            repository.todayEvents,
            derivedTodayEvents,
          ),
    [
      derivedTodayEvents,
      isDemoMode,
      repository.todayAggregate,
      repository.todaySnapshot,
      repository.todayEvents,
    ],
  );
  const recentSignals: TodayRecentSignalRow[] = React.useMemo(
    () =>
      isDemoMode
        ? []
        : buildRecentSignalRows(repository.todayEvents, derivedTodayEvents),
    [derivedTodayEvents, isDemoMode, repository.todayEvents],
  );
  const signalHealthSummary = React.useMemo(
    () =>
      isDemoMode
        ? null
        : buildSignalHealthSummary(
            repository.todayAggregate,
            visibleCollectors,
            repository.todayEvents,
          ),
    [
      isDemoMode,
      repository.todayAggregate,
      visibleCollectors,
      repository.todayEvents,
    ],
  );
  const demoPatternEvents = React.useMemo(
    () => buildDemoTimelineEvents(demoCollectors),
    [demoCollectors],
  );
  const patternSourceEvents = React.useMemo(
    () =>
      isDemoMode
        ? demoPatternEvents
        : [...historicalPatternEvents, ...(repository.todayEvents ?? [])],
    [
      isDemoMode,
      demoPatternEvents,
      historicalPatternEvents,
      repository.todayEvents,
    ],
  );
  const dailyRhythmBuckets = React.useMemo(
    () =>
      timeSyncOperation(
        "today.compute_daily_rhythm",
        () =>
          buildUnifiedDailyTimeline(
            isDemoMode ? demoPatternEvents : (repository.todayEvents ?? []),
            todayAnchor,
            "hour",
            patternSourceEvents,
          ),
        {
          eventCount: isDemoMode
            ? demoPatternEvents.length
            : (repository.todayEvents ?? []).length,
          normalizationEventCount: patternSourceEvents.length,
          screen: "today",
        },
      ),
    [
      isDemoMode,
      demoPatternEvents,
      repository.todayEvents,
      todayAnchor,
      patternSourceEvents,
    ],
  );
  const monthCells = React.useMemo(
    () =>
      timeSyncOperation(
        "today.compute_month_pattern",
        () =>
          buildMonthlyActivityPattern(
            patternSourceEvents,
            todayAnchor,
            "hour",
            patternSourceEvents,
          ),
        {
          eventCount: patternSourceEvents.length,
          screen: "today",
        },
      ),
    [patternSourceEvents, todayAnchor],
  );

  const handleSelectPatternCell = React.useCallback(
    (cell: ActivityPatternCell) => {
      setSelectedDetail(
        buildActivityPatternDetailPayload(cell, patternSourceEvents),
      );
    },
    [patternSourceEvents],
  );

  const handleSelectMetric = React.useCallback(
    (metric: DashboardMetric) => {
      setSelectedDetail(
        buildTodayMetricDetailPayload(metric, {
          todayAggregate: repository.todayAggregate,
          todayEvents: repository.todayEvents,
          todaySnapshot: repository.todaySnapshot,
        }),
      );
    },
    [
      repository.todayAggregate,
      repository.todayEvents,
      repository.todaySnapshot,
    ],
  );

  const handleSelectSecondaryMetric = React.useCallback(
    (metric: (typeof secondaryMetrics)[number]) => {
      setSelectedDetail(
        buildTodayMetricDetailPayload(metric, {
          todayAggregate: repository.todayAggregate,
          todayEvents: repository.todayEvents,
          todaySnapshot: repository.todaySnapshot,
        }),
      );
    },
    [
      repository.todayAggregate,
      repository.todayEvents,
      repository.todaySnapshot,
    ],
  );

  const handleSelectRecentSignal = React.useCallback(
    (row: TodayRecentSignalRow) => {
      setSelectedDetail(
        buildRecentSignalDetailPayload(
          row.event,
          repository.todayEvents,
          derivedTodayEvents,
        ),
      );
    },
    [derivedTodayEvents, repository.todayEvents],
  );

  const introTitle = isDemoMode
    ? "Welcome"
    : hasCollectors
      ? "Welcome back."
      : "Hey, welcome.";
  const introBody = isDemoMode
    ? "Sample signals are flowing. This is what Zentra looks like with real data."
    : hasCollectors
      ? "Signals are coming in from your phone."
      : "Nothing's running yet — head to Settings and turn on a collector to start.";

  const sections = React.useMemo(() => {
    const items: TodaySectionKey[] = [
      "pattern",
      "metrics",
      "activityStrip",
      "sleep",
      "recentSignals",
      "completeness",
    ];

    if (secondaryMetrics.length) {
      items.splice(3, 0, "secondaryMetrics");
    }

    return items;
  }, [secondaryMetrics.length]);

  const renderSection = React.useCallback(
    ({ item }: { item: TodaySectionKey }) => {
      switch (item) {
        case "pattern":
          return (
            <View style={styles.sectionBlock}>
              {!hasLoadedPattern && !isDemoMode ? (
                <Card>
                  <View style={styles.patternLoading}>
                    <ActivityIndicator
                      color={palette.mutedForeground}
                      size="small"
                    />
                    <Text
                      style={[
                        styles.patternLoadingText,
                        { color: palette.textSecondary },
                      ]}
                    >
                      Preparing pattern...
                    </Text>
                  </View>
                </Card>
              ) : (
                <>
                  <ActivityPatternCard
                    cells={monthCells}
                    normalizationLabel={getActivityNormalizationLabel(
                      activityNormalizationWindow,
                    )}
                    onSelectCell={handleSelectPatternCell}
                  />
                  {isLoadingPatternHistory && !isDemoMode ? (
                    <View style={styles.patternRefreshingRow}>
                      <ActivityIndicator
                        color={palette.mutedForeground}
                        size="small"
                      />
                      <Text
                        style={[
                          styles.patternRefreshingText,
                          { color: palette.textSecondary },
                        ]}
                      >
                        Refreshing pattern...
                      </Text>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          );
        case "metrics":
          return (
            <View style={styles.metricGrid}>
              {metrics.map((metric) => (
                <View key={metric.key} style={styles.metricCell}>
                  <MetricCard metric={metric} onPress={handleSelectMetric} />
                </View>
              ))}
            </View>
          );
        case "activityStrip":
          return (
            <View style={styles.sectionBlock}>
              <ActivityStrip buckets={dailyRhythmBuckets} />
            </View>
          );
        case "secondaryMetrics":
          return (
            <View style={styles.sectionBlock}>
              <SignalSummaryCard
                metrics={secondaryMetrics}
                onSelectMetric={handleSelectSecondaryMetric}
              />
            </View>
          );
        case "sleep":
          return (
            <View style={styles.sectionBlock}>
              <SleepEstimateCard sleepEstimate={sleepEstimate} />
            </View>
          );
        case "recentSignals":
          return (
            <View style={styles.sectionBlock}>
              <RecentSignalFeed
                onSelectRow={handleSelectRecentSignal}
                rows={recentSignals}
              />
            </View>
          );
        case "completeness":
          return (
            <View style={styles.sectionBlock}>
              <CompletenessCard
                collectors={visibleCollectors}
                summary={signalHealthSummary ?? undefined}
              />
            </View>
          );
        default:
          return null;
      }
    },
    [
      activityNormalizationWindow,
      dailyRhythmBuckets,
      handleSelectMetric,
      handleSelectPatternCell,
      handleSelectRecentSignal,
      handleSelectSecondaryMetric,
      hasLoadedPattern,
      isDemoMode,
      isLoadingPatternHistory,
      metrics,
      monthCells,
      palette.mutedForeground,
      palette.textSecondary,
      recentSignals,
      secondaryMetrics,
      signalHealthSummary,
      sleepEstimate,
      visibleCollectors,
    ],
  );

  return (
    <ScreenShell
      scrollable={false}
      subtitle={formatScreenDate(new Date())}
      title="Today"
    >
      <View style={styles.introWrap}>
        <Card elevated style={styles.introCard}>
          <View style={styles.introHeader}>
            <View style={styles.introCopy}>
              <Text style={[styles.introTitle, { color: palette.foreground }]}>
                {introTitle}
              </Text>
              <Text
                style={[styles.introBody, { color: palette.textSecondary }]}
              >
                {introBody}
              </Text>
            </View>
            <View style={styles.introStatus}>
              <PilotLight size={12} />
              <Text
                style={[styles.introMeta, { color: palette.textSecondary }]}
              >
                {isDemoMode
                  ? "Demo"
                  : hasCollectors
                    ? `${visibleCollectors.length} on`
                    : "Idle"}
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {(!repository.isHydrated && !isDemoMode) || !hasCollectors ? (
        <EmptyState
          body="Head to Settings and turn on a collector. Zentra will start reading your signals quietly in the background."
          iconName="radio-outline"
          title="Nothing here yet"
        />
      ) : (
        <>
          {isRefreshingTodayData && !isDemoMode ? (
            <Card style={styles.processingCard}>
              <View style={styles.processingRow}>
                <ActivityIndicator
                  color={palette.mutedForeground}
                  size="small"
                />
                <Text
                  style={[
                    styles.processingText,
                    { color: palette.textSecondary },
                  ]}
                >
                  Refreshing today...
                </Text>
              </View>
            </Card>
          ) : null}
          <FlatList
            contentContainerStyle={styles.listContent}
            data={sections}
            keyExtractor={(item) => item}
            renderItem={renderSection}
            showsVerticalScrollIndicator={false}
            style={styles.list}
          />
        </>
      )}
      <DetailSheet
        onClose={() => setSelectedDetail(null)}
        payload={selectedDetail}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  introBody: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  introCard: {
    minHeight: 92,
    paddingVertical: Spacing.lg,
  },
  introCopy: {
    flex: 1,
    gap: Spacing.xs,
    minWidth: 0,
  },
  introHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
    justifyContent: "space-between",
  },
  introMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  introStatus: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  introTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSizes.lg,
    lineHeight: 24,
  },
  introWrap: {
    marginBottom: Spacing.lg,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: Spacing.sm,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  metricCell: {
    height: 228,
    width: "48%",
  },
  patternLoading: {
    alignItems: "center",
    gap: Spacing.sm,
    justifyContent: "center",
    minHeight: 120,
  },
  patternLoadingText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  patternRefreshingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  patternRefreshingText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  processingCard: {
    marginBottom: Spacing.md,
  },
  processingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  processingText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  sectionBlock: {
    marginBottom: Spacing.lg,
  },
});

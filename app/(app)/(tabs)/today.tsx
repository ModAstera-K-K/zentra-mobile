import React from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  InteractionManager,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ActivityPatternCard } from "@/components/zentra/ActivityPatternCard";
import { ActivityStrip } from "@/components/zentra/ActivityStrip";
import { BackgroundStatusCard } from "@/components/zentra/BackgroundStatusCard";
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
import { Colors, Fonts, FontSizes, Layout, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppStore, useRepositoryStore, useSignalStore } from "@/stores";
import type {
  ActivityNormalizationWindow,
  ActivityPatternCell,
  CollectorState,
  DashboardMetric,
  PermissionStatus,
  UnifiedTimelineBucket,
  ZentraEventRecord,
} from "@/types/zentra";
import type {
  TodayDerivedEvents,
  TodayDetailPayload,
  TodayRecentSignalRow,
  TodaySignalHealthSummary,
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
  buildNormalizationMaxima,
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
  | "backgroundStatus"
  | "secondaryMetrics"
  | "sleep"
  | "recentSignals"
  | "completeness";

// ---------------------------------------------------------------------------
// Memo'd section components — each isolates its own re-renders
// ---------------------------------------------------------------------------

const PatternSection = React.memo(function PatternSection({
  activityNormalizationWindow: window,
  cells,
  hasLoadedPattern,
  isDemoMode,
  isLoadingPatternHistory,
  mutedForeground,
  onSelectCell,
  textSecondary,
}: {
  activityNormalizationWindow: ActivityNormalizationWindow;
  cells: ActivityPatternCell[];
  hasLoadedPattern: boolean;
  isDemoMode: boolean;
  isLoadingPatternHistory: boolean;
  mutedForeground: string;
  onSelectCell: (cell: ActivityPatternCell) => void;
  textSecondary: string;
}) {
  if (!hasLoadedPattern && !isDemoMode) {
    return (
      <View style={styles.sectionBlock}>
        <Card>
          <View style={styles.patternLoading}>
            <ActivityIndicator color={mutedForeground} size="small" />
            <Text style={[styles.patternLoadingText, { color: textSecondary }]}>
              Preparing pattern...
            </Text>
          </View>
        </Card>
      </View>
    );
  }
  return (
    <View style={styles.sectionBlock}>
      <ActivityPatternCard
        cells={cells}
        normalizationLabel={getActivityNormalizationLabel(window)}
        onSelectCell={onSelectCell}
      />
      {isLoadingPatternHistory && !isDemoMode ? (
        <View style={styles.patternRefreshingRow}>
          <ActivityIndicator color={mutedForeground} size="small" />
          <Text
            style={[styles.patternRefreshingText, { color: textSecondary }]}
          >
            Refreshing pattern...
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const MetricsSection = React.memo(function MetricsSection({
  metrics,
  onPress,
}: {
  metrics: DashboardMetric[];
  onPress: (metric: DashboardMetric) => void;
}) {
  return (
    <View style={styles.metricGrid}>
      {metrics.map((metric) => (
        <View key={metric.key} style={styles.metricCell}>
          <MetricCard metric={metric} onPress={onPress} />
        </View>
      ))}
    </View>
  );
});

const ActivityStripSection = React.memo(function ActivityStripSection({
  buckets,
}: {
  buckets: UnifiedTimelineBucket[];
}) {
  return (
    <View style={styles.sectionBlock}>
      <ActivityStrip buckets={buckets} />
    </View>
  );
});

const SecondaryMetricsSection = React.memo(function SecondaryMetricsSection({
  metrics,
  onSelectMetric,
}: {
  metrics: TodaySummaryMetric[];
  onSelectMetric: (metric: TodaySummaryMetric) => void;
}) {
  return (
    <View style={styles.sectionBlock}>
      <SignalSummaryCard metrics={metrics} onSelectMetric={onSelectMetric} />
    </View>
  );
});

const SleepSection = React.memo(function SleepSection({
  sleepEstimate,
}: {
  sleepEstimate: ReturnType<typeof buildLiveSleepEstimate>;
}) {
  return (
    <View style={styles.sectionBlock}>
      <SleepEstimateCard sleepEstimate={sleepEstimate} />
    </View>
  );
});

const RecentSignalsSection = React.memo(function RecentSignalsSection({
  onSelectRow,
  rows,
}: {
  onSelectRow: (row: TodayRecentSignalRow) => void;
  rows: TodayRecentSignalRow[];
}) {
  return (
    <View style={styles.sectionBlock}>
      <RecentSignalFeed onSelectRow={onSelectRow} rows={rows} />
    </View>
  );
});

const CompletenessSection = React.memo(function CompletenessSection({
  collectors,
  summary,
}: {
  collectors: CollectorState[];
  summary: TodaySignalHealthSummary | null;
}) {
  return (
    <View style={styles.sectionBlock}>
      <CompletenessCard
        collectors={collectors}
        summary={summary ?? undefined}
      />
    </View>
  );
});

const BackgroundStatusSection = React.memo(function BackgroundStatusSection({
  backgroundTaskRegistrationCheckedAt,
  backgroundTaskRegistrationMessage,
  backgroundTaskRegistrationStatus,
  bufferedActivityQueueDepth,
  lastBackgroundTaskFailureAt,
  lastBackgroundTaskFailureMessage,
  lastBackgroundTaskSuccessAt,
  lastReconcileRunAt,
}: {
  backgroundTaskRegistrationCheckedAt: string | null;
  backgroundTaskRegistrationMessage: string | null;
  backgroundTaskRegistrationStatus: string | null;
  bufferedActivityQueueDepth: number;
  lastBackgroundTaskFailureAt: string | null;
  lastBackgroundTaskFailureMessage: string | null;
  lastBackgroundTaskSuccessAt: string | null;
  lastReconcileRunAt: string | null;
}) {
  return (
    <View style={styles.sectionBlock}>
      <BackgroundStatusCard
        backgroundTaskRegistrationCheckedAt={
          backgroundTaskRegistrationCheckedAt
        }
        backgroundTaskRegistrationMessage={backgroundTaskRegistrationMessage}
        backgroundTaskRegistrationStatus={backgroundTaskRegistrationStatus}
        bufferedActivityQueueDepth={bufferedActivityQueueDepth}
        lastBackgroundTaskFailureAt={lastBackgroundTaskFailureAt}
        lastBackgroundTaskFailureMessage={lastBackgroundTaskFailureMessage}
        lastBackgroundTaskSuccessAt={lastBackgroundTaskSuccessAt}
        lastReconcileRunAt={lastReconcileRunAt}
      />
    </View>
  );
});

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
      backgroundTaskRegistrationCheckedAt:
        state.backgroundTaskRegistrationCheckedAt,
      backgroundTaskRegistrationMessage:
        state.backgroundTaskRegistrationMessage,
      backgroundTaskRegistrationStatus: state.backgroundTaskRegistrationStatus,
      todayDataUpdatedAt: state.todayDataUpdatedAt,
      todaySnapshot: state.todaySnapshot,
      todayAggregate: state.todayAggregate,
      todayEvents: state.todayEvents,
      latestSleepEvent: state.latestSleepEvent,
      diagnostics: state.diagnostics,
      lastBackgroundTaskFailureAt: state.lastBackgroundTaskFailureAt,
      lastBackgroundTaskFailureMessage: state.lastBackgroundTaskFailureMessage,
      lastBackgroundTaskSuccessAt: state.lastBackgroundTaskSuccessAt,
      lastReconcileRunAt: state.lastReconcileRunAt,
      bufferedActivityQueueDepth: state.bufferedActivityQueueDepth,
    })),
  );
  const refreshTodayData = useRepositoryStore(
    (state) => state.refreshTodayData,
  );
  // Split signal subscriptions: slow-changing permission/capability fields vs
  // fast-changing sensor values. This prevents every step/lux/battery tick from
  // re-queuing the expensive metrics and visibleCollectors effects.
  const signalMeta = useSignalStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      stepSupported: state.stepSupported,
      stepPermissionStatus: state.stepPermissionStatus,
      batterySupported: state.batterySupported,
      locationSupported: state.locationSupported,
      locationPermissionStatus: state.locationPermissionStatus,
      locationServicesEnabled: state.locationServicesEnabled,
      ambientLightSupported: state.ambientLightSupported,
    })),
  );
  const signalValues = useSignalStore(
    useShallow((state) => ({
      stepCount: state.stepCount,
      stepLastUpdatedAt: state.stepLastUpdatedAt,
      batteryLevel: state.batteryLevel,
      batteryStateLabel: state.batteryStateLabel,
      lowPowerMode: state.lowPowerMode,
      batteryLastUpdatedAt: state.batteryLastUpdatedAt,
      locationSamples: state.locationSamples,
      locationLastUpdatedAt: state.locationLastUpdatedAt,
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
  const lastFetchedAnchorRef = React.useRef<string | null>(null);
  const lastFetchedWindowRef = React.useRef<ActivityNormalizationWindow | null>(
    null,
  );
  const patternSourceEventsRef = React.useRef<ZentraEventRecord[]>([]);
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

    // Invalidate cached pattern when the repository ingests new data so the
    // activity pattern re-fetches after a Health Connect import or any other
    // collector that writes historical events.  Also invalidated by
    // pull-to-refresh via setHasLoadedPattern(false).
    if (
      hasLoadedPattern &&
      lastFetchedAnchorRef.current === todayAnchor &&
      lastFetchedWindowRef.current === activityNormalizationWindow
    ) {
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
            lastFetchedAnchorRef.current = todayAnchor;
            lastFetchedWindowRef.current = activityNormalizationWindow;
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
          lastFetchedAnchorRef.current = todayAnchor;
          lastFetchedWindowRef.current = activityNormalizationWindow;
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
    hasLoadedPattern,
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

  const [isPullRefreshing, setIsPullRefreshing] = React.useState(false);
  const handlePullRefresh = React.useCallback(async () => {
    setIsPullRefreshing(true);
    try {
      await refreshTodayData();
      setHasLoadedPattern(false);
    } finally {
      setIsPullRefreshing(false);
    }
  }, [refreshTodayData]);

  const [metrics, setMetrics] = React.useState<DashboardMetric[]>([]);
  const [visibleCollectors, setVisibleCollectors] = React.useState<
    CollectorState[]
  >([]);
  const [derivedTodayEvents, setDerivedTodayEvents] =
    React.useState<TodayDerivedEvents | null>(null);
  const [secondaryMetrics, setSecondaryMetrics] = React.useState<
    TodaySummaryMetric[]
  >([]);
  const [recentSignals, setRecentSignals] = React.useState<
    TodayRecentSignalRow[]
  >([]);
  const [signalHealthSummary, setSignalHealthSummary] =
    React.useState<TodaySignalHealthSummary | null>(null);

  // Defer expensive dashboard metrics computation until after interactions.
  // Only re-triggers on permission/capability changes, not sensor ticks.
  React.useEffect(() => {
    const interaction = InteractionManager.runAfterInteractions(() => {
      const result = isDemoMode
        ? buildDashboardMetrics(demoCollectors, true)
        : buildLiveDashboardMetrics(
            collectors,
            { ...signalMeta, ...signalValues },
            repository.todaySnapshot,
            repository.todayAggregate,
            repository.todayEvents,
          );
      setMetrics(result);
    });
    return () => interaction.cancel();
  }, [
    isDemoMode,
    demoCollectors,
    collectors,
    signalMeta,
    repository.todaySnapshot,
    repository.todayAggregate,
    repository.todayEvents,
    // signalValues is intentionally omitted — metrics only needs permission/
    // capability fields (signalMeta). Including signalValues would re-trigger
    // this effect on every sensor tick (step, lux, battery).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);
  const sleepEstimate = React.useMemo(
    () =>
      isDemoMode
        ? buildSleepEstimate(demoCollectors, true)
        : buildLiveSleepEstimate(repository.latestSleepEvent),
    [isDemoMode, demoCollectors, repository.latestSleepEvent],
  );
  // Defer visible collectors computation until after interactions.
  // Depends on both signal slices since collector labels show sensor values.
  React.useEffect(() => {
    const interaction = InteractionManager.runAfterInteractions(() => {
      const result = isDemoMode
        ? Object.values(demoCollectors).filter((collector) => collector.enabled)
        : buildCollectorStatuses(
            collectors,
            { ...signalMeta, ...signalValues },
            repository.diagnostics,
            {
              hasLatestSleepEstimate: Boolean(repository.latestSleepEvent),
              permissionStatusByCollector: {
                activity: collectors.activity.enabled
                  ? activityPermissionStatus
                  : "not_requested",
              },
            },
          ).filter((collector) => collector.enabled);
      setVisibleCollectors(result);
    });
    return () => interaction.cancel();
  }, [
    isDemoMode,
    demoCollectors,
    collectors,
    signalMeta,
    signalValues,
    repository.diagnostics,
    repository.latestSleepEvent,
    activityPermissionStatus,
  ]);
  const hasCollectors = Object.values(collectors).some(
    (collector) => collector.enabled,
  );
  // Defer derived events and downstream computations until after interactions
  React.useEffect(() => {
    const interaction = InteractionManager.runAfterInteractions(() => {
      if (isDemoMode) {
        setDerivedTodayEvents(null);
        setSecondaryMetrics([]);
        setRecentSignals([]);
        setSignalHealthSummary(null);
        return;
      }
      const derived = buildTodayDerivedEvents(repository.todayEvents);
      setDerivedTodayEvents(derived);
      setSecondaryMetrics(
        buildTodaySecondaryMetrics(
          repository.todayAggregate,
          repository.todaySnapshot,
          repository.todayEvents,
          derived,
        ),
      );
      setRecentSignals(buildRecentSignalRows(repository.todayEvents, derived));
    });
    return () => interaction.cancel();
  }, [
    isDemoMode,
    repository.todayAggregate,
    repository.todaySnapshot,
    repository.todayEvents,
  ]);

  // Defer signal health summary (depends on visibleCollectors computed above)
  React.useEffect(() => {
    const interaction = InteractionManager.runAfterInteractions(() => {
      if (isDemoMode) {
        setSignalHealthSummary(null);
        return;
      }
      setSignalHealthSummary(
        buildSignalHealthSummary(
          repository.todayAggregate,
          visibleCollectors,
          repository.todayEvents,
        ),
      );
    });
    return () => interaction.cancel();
  }, [
    isDemoMode,
    repository.todayAggregate,
    visibleCollectors,
    repository.todayEvents,
  ]);
  const demoPatternEvents = React.useMemo(
    () => buildDemoTimelineEvents(demoCollectors),
    [demoCollectors],
  );
  const patternSourceEvents = React.useMemo(() => {
    const next = isDemoMode
      ? demoPatternEvents
      : [...historicalPatternEvents, ...(repository.todayEvents ?? [])];

    // Reference-stable: return previous array if contents are unchanged
    const prev = patternSourceEventsRef.current;
    if (
      prev.length === next.length &&
      prev.length > 0 &&
      prev[prev.length - 1]?.id === next[next.length - 1]?.id
    ) {
      return prev;
    }

    patternSourceEventsRef.current = next;
    return next;
  }, [
    isDemoMode,
    demoPatternEvents,
    historicalPatternEvents,
    repository.todayEvents,
  ]);
  const [dailyRhythmBuckets, setDailyRhythmBuckets] = React.useState<
    UnifiedTimelineBucket[]
  >([]);
  const [monthCells, setMonthCells] = React.useState<ActivityPatternCell[]>([]);
  const lastRhythmKeyRef = React.useRef<string | null>(null);
  const lastMonthKeyRef = React.useRef<string | null>(null);

  const normalizationMaxima = React.useMemo(
    () => buildNormalizationMaxima(patternSourceEvents, "hour"),
    [patternSourceEvents],
  );

  React.useEffect(() => {
    const key = `${todayAnchor}|${patternSourceEvents.length}|${patternSourceEvents.at(-1)?.id ?? ""}`;
    if (key === lastRhythmKeyRef.current) return;

    const todayEventsForCompute = isDemoMode
      ? demoPatternEvents
      : (repository.todayEvents ?? []);

    const interaction = InteractionManager.runAfterInteractions(() => {
      const result = timeSyncOperation(
        "today.compute_daily_rhythm",
        () =>
          buildUnifiedDailyTimeline(
            todayEventsForCompute,
            todayAnchor,
            "hour",
            patternSourceEvents,
            normalizationMaxima,
          ),
        {
          eventCount: todayEventsForCompute.length,
          normalizationEventCount: patternSourceEvents.length,
          screen: "today",
        },
      );
      lastRhythmKeyRef.current = key;
      setDailyRhythmBuckets(result);
    });

    return () => interaction.cancel();
  }, [
    isDemoMode,
    demoPatternEvents,
    todayAnchor,
    patternSourceEvents,
    normalizationMaxima,
    repository.todayEvents,
  ]);

  React.useEffect(() => {
    const key = `${todayAnchor}|${patternSourceEvents.length}|${patternSourceEvents.at(-1)?.id ?? ""}`;
    if (key === lastMonthKeyRef.current) return;

    const interaction = InteractionManager.runAfterInteractions(() => {
      const result = timeSyncOperation(
        "today.compute_month_pattern",
        () =>
          buildMonthlyActivityPattern(
            patternSourceEvents,
            todayAnchor,
            "hour",
            patternSourceEvents,
            normalizationMaxima,
          ),
        {
          eventCount: patternSourceEvents.length,
          screen: "today",
        },
      );
      lastMonthKeyRef.current = key;
      setMonthCells(result);
    });

    return () => interaction.cancel();
  }, [patternSourceEvents, todayAnchor, normalizationMaxima]);

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
          derivedTodayEvents ?? undefined,
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
  const introMessage =
    isRefreshingTodayData && !isDemoMode
      ? "Refreshing today..."
      : isDemoMode
        ? "Sample signals are flowing."
        : hasCollectors
          ? "Signals are coming in from your phone."
          : "Nothing's running yet — head to Settings to start.";
  const totalCollectorCount = Object.keys(collectors).length;
  const statusLabel = isDemoMode
    ? "Demo"
    : hasCollectors
      ? `${visibleCollectors.length}/${totalCollectorCount}`
      : "Idle";

  const sections = React.useMemo(() => {
    const items: TodaySectionKey[] = [
      "pattern",
      "metrics",
      "activityStrip",
      "sleep",
      "backgroundStatus",
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
            <PatternSection
              activityNormalizationWindow={activityNormalizationWindow}
              cells={monthCells}
              hasLoadedPattern={hasLoadedPattern}
              isDemoMode={isDemoMode}
              isLoadingPatternHistory={isLoadingPatternHistory}
              mutedForeground={palette.mutedForeground}
              onSelectCell={handleSelectPatternCell}
              textSecondary={palette.textSecondary}
            />
          );
        case "metrics":
          return (
            <MetricsSection metrics={metrics} onPress={handleSelectMetric} />
          );
        case "activityStrip":
          return <ActivityStripSection buckets={dailyRhythmBuckets} />;
        case "secondaryMetrics":
          return (
            <SecondaryMetricsSection
              metrics={secondaryMetrics}
              onSelectMetric={handleSelectSecondaryMetric}
            />
          );
        case "sleep":
          return <SleepSection sleepEstimate={sleepEstimate} />;
        case "backgroundStatus":
          return (
            <BackgroundStatusSection
              backgroundTaskRegistrationCheckedAt={
                repository.backgroundTaskRegistrationCheckedAt
              }
              backgroundTaskRegistrationMessage={
                repository.backgroundTaskRegistrationMessage
              }
              backgroundTaskRegistrationStatus={
                repository.backgroundTaskRegistrationStatus
              }
              bufferedActivityQueueDepth={repository.bufferedActivityQueueDepth}
              lastBackgroundTaskFailureAt={
                repository.lastBackgroundTaskFailureAt
              }
              lastBackgroundTaskFailureMessage={
                repository.lastBackgroundTaskFailureMessage
              }
              lastBackgroundTaskSuccessAt={
                repository.lastBackgroundTaskSuccessAt
              }
              lastReconcileRunAt={repository.lastReconcileRunAt}
            />
          );
        case "recentSignals":
          return (
            <RecentSignalsSection
              onSelectRow={handleSelectRecentSignal}
              rows={recentSignals}
            />
          );
        case "completeness":
          return (
            <CompletenessSection
              collectors={visibleCollectors}
              summary={signalHealthSummary}
            />
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
      repository.backgroundTaskRegistrationCheckedAt,
      repository.backgroundTaskRegistrationMessage,
      repository.backgroundTaskRegistrationStatus,
      repository.bufferedActivityQueueDepth,
      repository.lastBackgroundTaskFailureAt,
      repository.lastBackgroundTaskFailureMessage,
      repository.lastBackgroundTaskSuccessAt,
      repository.lastReconcileRunAt,
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
      subtitleAccessory={
        <View style={styles.subtitleAccessory}>
          <Text style={[styles.introTitle, { color: palette.foreground }]}>
            {introTitle}
          </Text>
        </View>
      }
      title="Today"
      titleAccessory={
        <View style={styles.titleAccessory}>
          <View style={styles.titleAccessoryLeft}>
            {isRefreshingTodayData && !isDemoMode ? (
              <ActivityIndicator color={palette.mutedForeground} size="small" />
            ) : null}
            <Text
              style={[styles.introMessage, { color: palette.textSecondary }]}
              numberOfLines={1}
            >
              {introMessage}
            </Text>
          </View>
          <View style={styles.titleAccessoryRight}>
            <Text
              style={[styles.statusLabel, { color: palette.textSecondary }]}
            >
              {statusLabel}
            </Text>
            <PilotLight size={10} />
          </View>
        </View>
      }
    >
      {(!repository.isHydrated && !isDemoMode) || !hasCollectors ? (
        <EmptyState
          body="Head to Settings and turn on a collector. Zentra will start reading your signals quietly in the background."
          iconName="radio-outline"
          title="Nothing here yet"
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={sections}
          keyExtractor={(item) => item}
          refreshControl={
            <RefreshControl
              refreshing={isPullRefreshing}
              onRefresh={handlePullRefresh}
            />
          }
          renderItem={renderSection}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
      )}
      <DetailSheet
        onClose={() => setSelectedDetail(null)}
        payload={selectedDetail}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  introMessage: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
  },
  introTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSizes.sm,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 0,
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
  sectionBlock: {
    marginBottom: Spacing.lg,
  },
  statusLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  subtitleAccessory: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
    marginLeft: Spacing.md,
  },
  titleAccessory: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  titleAccessoryLeft: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: Spacing.sm,
  },
  titleAccessoryRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
});

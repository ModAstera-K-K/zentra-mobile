import { activeEvidenceRows } from "@/utils/active-evidence";
import { useActiveMinutesRefresh } from "@/hooks/use-active-minutes-refresh";
import { useSleepSummary } from "@/hooks/use-sleep-summary";
import { loadNormalizationMaxima } from "@/utils/activity-cache";
import { useTabPerformance } from "@/hooks/use-tab-performance";
import { InsightsSection } from "@/components/zentra/InsightsSection";
import React from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  InteractionManager,
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
import { MetricGrid } from "@/components/zentra/MetricGrid";
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
  ReconcileOutcome,
  ReconcileTrigger,
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
  getRepositoryRevision,
} from "@/utils/event-repository";
import { useIsFocused } from "@react-navigation/native";
import {
  buildNormalizationMaximaAsync,
  buildMonthlyActivityPatternAsync,
  buildUnifiedTimelineAsync,
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
import { startPerfTimer } from "@/utils/perf";
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
  | "insights"
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
  if ((!hasLoadedPattern && !isDemoMode) || !cells.length) {
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
  backgroundCollectionServiceCheckedAt,
  backgroundCollectionServiceState,
  backgroundTaskRegistrationCheckedAt,
  backgroundTaskRegistrationMessage,
  backgroundTaskRegistrationStatus,
  bufferedActivityQueueDepth,
  lastBackgroundReconcileAt,
  lastBackgroundTaskFailureAt,
  lastBackgroundTaskFailureMessage,
  lastBackgroundTaskSuccessAt,
  lastForegroundResumeReconcileAt,
  lastHealthSyncWindowEndAt,
  lastNativeIngestionCount,
  lastReconcileBoundedReason,
  lastReconcileDurationMs,
  lastReconcileFailureMessage,
  lastReconcileFinishedAt,
  lastReconcileOutcome,
  lastReconcileRunAt,
  lastReconcileStartedAt,
  lastReconcileTrigger,
}: {
  backgroundCollectionServiceCheckedAt: string | null;
  backgroundCollectionServiceState: string | null;
  backgroundTaskRegistrationCheckedAt: string | null;
  backgroundTaskRegistrationMessage: string | null;
  backgroundTaskRegistrationStatus: string | null;
  bufferedActivityQueueDepth: number;
  lastBackgroundReconcileAt: string | null;
  lastBackgroundTaskFailureAt: string | null;
  lastBackgroundTaskFailureMessage: string | null;
  lastBackgroundTaskSuccessAt: string | null;
  lastForegroundResumeReconcileAt: string | null;
  lastHealthSyncWindowEndAt: string | null;
  lastNativeIngestionCount: number | null;
  lastReconcileBoundedReason: string | null;
  lastReconcileDurationMs: number | null;
  lastReconcileFailureMessage: string | null;
  lastReconcileFinishedAt: string | null;
  lastReconcileOutcome: ReconcileOutcome | null;
  lastReconcileRunAt: string | null;
  lastReconcileStartedAt: string | null;
  lastReconcileTrigger: ReconcileTrigger | null;
}) {
  return (
    <View style={styles.sectionBlock}>
      <BackgroundStatusCard
        backgroundCollectionServiceCheckedAt={
          backgroundCollectionServiceCheckedAt
        }
        backgroundCollectionServiceState={backgroundCollectionServiceState}
        backgroundTaskRegistrationCheckedAt={
          backgroundTaskRegistrationCheckedAt
        }
        backgroundTaskRegistrationMessage={backgroundTaskRegistrationMessage}
        backgroundTaskRegistrationStatus={backgroundTaskRegistrationStatus}
        bufferedActivityQueueDepth={bufferedActivityQueueDepth}
        lastBackgroundReconcileAt={lastBackgroundReconcileAt}
        lastBackgroundTaskFailureAt={lastBackgroundTaskFailureAt}
        lastBackgroundTaskFailureMessage={lastBackgroundTaskFailureMessage}
        lastBackgroundTaskSuccessAt={lastBackgroundTaskSuccessAt}
        lastForegroundResumeReconcileAt={lastForegroundResumeReconcileAt}
        lastHealthSyncWindowEndAt={lastHealthSyncWindowEndAt}
        lastNativeIngestionCount={lastNativeIngestionCount}
        lastReconcileBoundedReason={lastReconcileBoundedReason}
        lastReconcileDurationMs={lastReconcileDurationMs}
        lastReconcileFailureMessage={lastReconcileFailureMessage}
        lastReconcileFinishedAt={lastReconcileFinishedAt}
        lastReconcileOutcome={lastReconcileOutcome}
        lastReconcileRunAt={lastReconcileRunAt}
        lastReconcileStartedAt={lastReconcileStartedAt}
        lastReconcileTrigger={lastReconcileTrigger}
      />
    </View>
  );
});

export default function TodayScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const isFocused = useIsFocused();
  useTabPerformance("today");
  const collectors = useAppStore((state) => state.collectors);
  const activityNormalizationWindow = useAppStore(
    (state) => state.activityNormalizationWindow,
  );
  const dataMode = useAppStore((state) => state.dataMode);
  const repository = useRepositoryStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      backgroundCollectionServiceCheckedAt:
        state.backgroundCollectionServiceCheckedAt,
      backgroundCollectionServiceState: state.backgroundCollectionServiceState,
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
      lastBackgroundReconcileAt: state.lastBackgroundReconcileAt,
      lastBackgroundTaskFailureAt: state.lastBackgroundTaskFailureAt,
      lastBackgroundTaskFailureMessage: state.lastBackgroundTaskFailureMessage,
      lastBackgroundTaskSuccessAt: state.lastBackgroundTaskSuccessAt,
      lastForegroundResumeReconcileAt: state.lastForegroundResumeReconcileAt,
      lastHealthSyncWindowEndAt: state.lastHealthSyncWindowEndAt,
      lastNativeIngestionCount: state.lastNativeIngestionCount,
      lastReconcileBoundedReason: state.lastReconcileBoundedReason,
      lastReconcileDurationMs: state.lastReconcileDurationMs,
      lastReconcileFailureMessage: state.lastReconcileFailureMessage,
      lastReconcileFinishedAt: state.lastReconcileFinishedAt,
      lastReconcileOutcome: state.lastReconcileOutcome,
      lastReconcileRunAt: state.lastReconcileRunAt,
      lastReconcileStartedAt: state.lastReconcileStartedAt,
      lastReconcileTrigger: state.lastReconcileTrigger,
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
  const activeRefresh = useActiveMinutesRefresh(
    !isDemoMode && repository.isHydrated,
  );
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
  const [monthCells, setMonthCells] = React.useState<ActivityPatternCell[]>([]);
  const [hasLoadedPattern, setHasLoadedPattern] = React.useState(false);
  const [isComputingPattern, setIsComputingPattern] = React.useState(false);
  const [isLoadingPatternHistory, setIsLoadingPatternHistory] =
    React.useState(false);
  const [isRefreshingTodayData, setIsRefreshingTodayData] =
    React.useState(false);
  const latestSignalValuesRef = React.useRef(signalValues);
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

  React.useEffect(() => {
    latestSignalValuesRef.current = signalValues;
  }, [signalValues]);
  const lastFetchedWindowRef = React.useRef<string | null>(null);
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
      monthCells.length > 0;

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
    monthCells.length,
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
            lastFetchedWindowRef.current = `${activityNormalizationWindow}:${repository.todayDataUpdatedAt}`;
          }

          stopLoadPattern({
            eventCount: 0,
            rangeStart: range.start,
            reason: "empty_range",
          });
          if (!isCancelled) setIsLoadingPatternHistory(false);
          return;
        }

        const visibleStart =
          range.start < shiftISODate(todayAnchor, -28)
            ? shiftISODate(todayAnchor, -28)
            : range.start;
        const historyRevision = await getRepositoryRevision(
          visibleStart,
          historicalEnd,
        );
        const historyKey = `${activityNormalizationWindow}:${historyRevision}`;
        if (
          lastFetchedWindowRef.current === historyKey &&
          lastFetchedAnchorRef.current === todayAnchor
        ) {
          stopLoadPattern({ reason: "cached" });
          return;
        }
        if (isCancelled) return;
        setIsLoadingPatternHistory(true);
        const events = await getEventsForRange(visibleStart, historicalEnd);

        if (!isCancelled) {
          setHistoricalPatternEvents(events);
          setHasLoadedPattern(true);
          lastFetchedAnchorRef.current = todayAnchor;
          lastFetchedWindowRef.current = historyKey;
        }

        stopLoadPattern({
          eventCount: events.length,
          rangeStart: range.start,
          reason: "loaded",
        });
        if (!isCancelled) setIsLoadingPatternHistory(false);
      } catch {
        stopLoadPattern({ reason: "error" });
        if (!isCancelled) setIsLoadingPatternHistory(false);
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
    repository.todayDataUpdatedAt,
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
            { ...signalMeta, ...latestSignalValuesRef.current },
            repository.todaySnapshot,
            repository.todayAggregate,
            repository.todayEvents,
          );
      setMetrics(
        result.map((metric) =>
          metric.key === "activeMinutes" && !isDemoMode
            ? {
                ...metric,
                detail: activeRefresh.error
                  ? `Update unavailable: ${activeRefresh.error}. Cached coverage may be incomplete.`
                  : activeRefresh.updating
                    ? `${metric.detail} Updating…`
                    : metric.detail,
              }
            : metric,
        ),
      );
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
    activeRefresh.error,
    activeRefresh.updating,
    // signalValues is intentionally omitted — metrics only needs permission/
    // capability fields (signalMeta). Including signalValues would re-trigger
    // this effect on every sensor tick (step, lux, battery).
  ]);
  const liveSleepSummary = useSleepSummary(!isDemoMode);
  const sleepEstimate = React.useMemo(
    () =>
      isDemoMode ? buildSleepEstimate(demoCollectors, true) : liveSleepSummary,
    [isDemoMode, demoCollectors, liveSleepSummary],
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
  const patternVersionRef = React.useRef(0);
  const patternSourceEvents = React.useMemo(() => {
    const next = isDemoMode
      ? demoPatternEvents
      : [...historicalPatternEvents, ...(repository.todayEvents ?? [])];

    patternVersionRef.current++;
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
  const lastRhythmKeyRef = React.useRef<string | null>(null);
  const lastMonthKeyRef = React.useRef<string | null>(null);

  const normalizationInputRef = React.useRef<string | null>(null);
  const [normalizationMaxima, setNormalizationMaxima] = React.useState<Awaited<
    ReturnType<typeof buildNormalizationMaximaAsync>
  > | null>(null);
  React.useEffect(() => {
    if (!isFocused) return;
    const inputKey = `${todayAnchor}:${activityNormalizationWindow}:${repository.todayDataUpdatedAt}:${isDemoMode}`;
    if (normalizationInputRef.current === inputKey) return;
    const controller = new AbortController();
    const interaction = InteractionManager.runAfterInteractions(() => {
      void (
        isDemoMode
          ? buildNormalizationMaximaAsync(demoPatternEvents, controller.signal)
          : loadNormalizationMaxima(
              activityNormalizationWindow === "all"
                ? "1970-01-01"
                : getActivityNormalizationRange(
                    todayAnchor,
                    activityNormalizationWindow,
                  ).start,
              todayAnchor,
              controller.signal,
            )
      )
        .then((value) => {
          if (!controller.signal.aborted) {
            normalizationInputRef.current = inputKey;
            setNormalizationMaxima(value);
          }
        })
        .catch(() => undefined);
    });
    return () => {
      controller.abort();
      interaction.cancel();
    };
  }, [
    isFocused,
    demoPatternEvents,
    isDemoMode,
    todayAnchor,
    activityNormalizationWindow,
    repository.todayDataUpdatedAt,
  ]);

  React.useEffect(() => {
    if (!isFocused || !normalizationMaxima) return;
    const key = `${todayAnchor}|${activityNormalizationWindow}|${repository.todayDataUpdatedAt}|${isDemoMode}|${patternVersionRef.current}|${Object.values(normalizationMaxima).join(",")}`;
    if (key === lastRhythmKeyRef.current) return;

    const todayEventsForCompute = isDemoMode
      ? demoPatternEvents
      : (repository.todayEvents ?? []);

    const controller = new AbortController();
    const interaction = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        const result = await buildUnifiedTimelineAsync(
          todayEventsForCompute,
          {
            startTimestamp: new Date(`${todayAnchor}T00:00:00`).toISOString(),
            endTimestamp: new Date(
              `${shiftISODate(todayAnchor, 1)}T00:00:00`,
            ).toISOString(),
            resolution: "hour",
          },
          controller.signal,
          normalizationMaxima,
        );
        if (controller.signal.aborted) return;
        lastRhythmKeyRef.current = key;
        setDailyRhythmBuckets(result);
      })().catch(() => undefined);
    });

    return () => {
      controller.abort();
      interaction.cancel();
    };
  }, [
    isDemoMode,
    demoPatternEvents,
    todayAnchor,
    patternSourceEvents,
    normalizationMaxima,
    isFocused,
    activityNormalizationWindow,
    repository.todayDataUpdatedAt,
    repository.todayEvents,
  ]);

  React.useEffect(() => {
    if (
      !isFocused ||
      !normalizationMaxima ||
      (!isDemoMode && !hasLoadedPattern)
    )
      return;
    const normalizationKey = `${todayAnchor}:${activityNormalizationWindow}:${repository.todayDataUpdatedAt}:${isDemoMode}`;
    if (normalizationInputRef.current !== normalizationKey) return;
    const key = `${todayAnchor}|${activityNormalizationWindow}|${repository.todayDataUpdatedAt}|${isDemoMode}|${patternVersionRef.current}|${Object.values(normalizationMaxima).join(",")}`;
    if (key === lastMonthKeyRef.current) return;

    setIsComputingPattern(true);
    const controller = new AbortController();
    const interaction = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        const result = await buildMonthlyActivityPatternAsync(
          patternSourceEvents,
          todayAnchor,
          "hour",
          patternSourceEvents,
          normalizationMaxima,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        lastMonthKeyRef.current = key;
        setMonthCells(result);
      })()
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) setIsComputingPattern(false);
        });
    });

    return () => {
      controller.abort();
      interaction.cancel();
    };
  }, [
    patternSourceEvents,
    hasLoadedPattern,
    todayAnchor,
    normalizationMaxima,
    isFocused,
    isDemoMode,
    activityNormalizationWindow,
    repository.todayDataUpdatedAt,
  ]);

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
      const payload = buildTodayMetricDetailPayload(metric, {
        todayAggregate: repository.todayAggregate,
        todayEvents: repository.todayEvents,
        todaySnapshot: repository.todaySnapshot,
      });
      setSelectedDetail(payload);
      if (
        metric.key === "activeMinutes" &&
        repository.todayAggregate?.activeSummary
      ) {
        void activeEvidenceRows(repository.todayAggregate.activeSummary)
          .then((rows) => {
            setSelectedDetail((current) =>
              current === payload ? { ...payload, rows } : current,
            );
          })
          .catch(() => undefined);
      }
    },
    [
      repository.todayAggregate,
      repository.todayEvents,
      repository.todaySnapshot,
    ],
  );

  const handleSelectSecondaryMetric = React.useCallback(
    (metric: (typeof secondaryMetrics)[number]) => {
      const payload = buildTodayMetricDetailPayload(metric, {
        todayAggregate: repository.todayAggregate,
        todayEvents: repository.todayEvents,
        todaySnapshot: repository.todaySnapshot,
      });
      setSelectedDetail(payload);
      if (
        metric.key === "activeMinutes" &&
        repository.todayAggregate?.activeSummary
      ) {
        void activeEvidenceRows(repository.todayAggregate.activeSummary)
          .then((rows) => {
            setSelectedDetail((current) =>
              current === payload ? { ...payload, rows } : current,
            );
          })
          .catch(() => undefined);
      }
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
      "insights",
      "sleep",
      "backgroundStatus",
      "recentSignals",
      "completeness",
    ];

    if (secondaryMetrics.length) {
      items.splice(4, 0, "secondaryMetrics");
    }

    return items;
  }, [secondaryMetrics.length]);

  const renderSection = React.useCallback(
    ({ item }: { item: TodaySectionKey }) => {
      switch (item) {
        case "insights":
          return <InsightsSection limit={3} />;
        case "pattern":
          return (
            <PatternSection
              activityNormalizationWindow={activityNormalizationWindow}
              cells={monthCells}
              hasLoadedPattern={hasLoadedPattern}
              isDemoMode={isDemoMode}
              isLoadingPatternHistory={
                isLoadingPatternHistory || isComputingPattern
              }
              mutedForeground={palette.mutedForeground}
              onSelectCell={handleSelectPatternCell}
              textSecondary={palette.textSecondary}
            />
          );
        case "metrics":
          return (
            <MetricGrid metrics={metrics} onPress={handleSelectMetric} />
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
              backgroundCollectionServiceCheckedAt={
                repository.backgroundCollectionServiceCheckedAt
              }
              backgroundCollectionServiceState={
                repository.backgroundCollectionServiceState
              }
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
              lastBackgroundReconcileAt={repository.lastBackgroundReconcileAt}
              lastBackgroundTaskFailureAt={
                repository.lastBackgroundTaskFailureAt
              }
              lastBackgroundTaskFailureMessage={
                repository.lastBackgroundTaskFailureMessage
              }
              lastBackgroundTaskSuccessAt={
                repository.lastBackgroundTaskSuccessAt
              }
              lastForegroundResumeReconcileAt={
                repository.lastForegroundResumeReconcileAt
              }
              lastHealthSyncWindowEndAt={repository.lastHealthSyncWindowEndAt}
              lastNativeIngestionCount={repository.lastNativeIngestionCount}
              lastReconcileBoundedReason={repository.lastReconcileBoundedReason}
              lastReconcileDurationMs={repository.lastReconcileDurationMs}
              lastReconcileFailureMessage={
                repository.lastReconcileFailureMessage
              }
              lastReconcileFinishedAt={repository.lastReconcileFinishedAt}
              lastReconcileOutcome={repository.lastReconcileOutcome}
              lastReconcileRunAt={repository.lastReconcileRunAt}
              lastReconcileStartedAt={repository.lastReconcileStartedAt}
              lastReconcileTrigger={repository.lastReconcileTrigger}
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
      isComputingPattern,
      metrics,
      monthCells,
      palette.mutedForeground,
      palette.textSecondary,
      recentSignals,
      repository.backgroundCollectionServiceCheckedAt,
      repository.backgroundCollectionServiceState,
      repository.backgroundTaskRegistrationCheckedAt,
      repository.backgroundTaskRegistrationMessage,
      repository.backgroundTaskRegistrationStatus,
      repository.bufferedActivityQueueDepth,
      repository.lastBackgroundReconcileAt,
      repository.lastBackgroundTaskFailureAt,
      repository.lastBackgroundTaskFailureMessage,
      repository.lastForegroundResumeReconcileAt,
      repository.lastHealthSyncWindowEndAt,
      repository.lastNativeIngestionCount,
      repository.lastReconcileBoundedReason,
      repository.lastReconcileDurationMs,
      repository.lastReconcileFailureMessage,
      repository.lastReconcileFinishedAt,
      repository.lastReconcileOutcome,
      repository.lastBackgroundTaskSuccessAt,
      repository.lastReconcileRunAt,
      repository.lastReconcileStartedAt,
      repository.lastReconcileTrigger,
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
  patternLoading: {
    alignItems: "center",
    gap: Spacing.sm,
    justifyContent: "center",
    minHeight: 120,
  },
  patternLoadingText: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
  patternRefreshingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  patternRefreshingText: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
  sectionBlock: {
    marginBottom: Layout.sectionGap,
  },
  statusLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
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

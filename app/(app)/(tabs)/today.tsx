import { activeEvidenceRows } from "@/utils/active-evidence";
import { useActiveMinutesRefresh } from "@/hooks/use-active-minutes-refresh";
import { useSleepSummary } from "@/hooks/use-sleep-summary";
import {
  getActivityHistoryRevision,
  loadActivityHistory,
  type ActivityHistory,
} from "@/utils/activity-cache";
import {
  startActivityCacheSession,
  type ActivityCacheSession,
} from "@/utils/activity-cache-session";
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
import {
  ActivityStrip,
  type ActivityStripNote,
} from "@/components/zentra/ActivityStrip";
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
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Colors, Fonts, FontSizes, Layout, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppStore, useRepositoryStore, useSignalStore } from "@/stores";
import type {
  ActivityNormalizationWindow,
  ActivityPatternCell,
  ActivityScoreMaxima,
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
import {
  buildActivityScoreMaxima,
  getActivityNormalizationRange,
  mergeActivityScoreMaxima,
} from "@/utils/activity-intensity";
import { formatScreenDate, shiftISODate, toISODate } from "@/utils/dates";
import {
  loadTodayPatternSnapshot,
  saveTodayPatternSnapshot,
  type TodayPatternSnapshot,
} from "@/utils/today-pattern-snapshot";
import {
  buildCollectorStatuses,
  buildLiveDashboardMetrics,
  buildLiveSleepEstimate,
} from "@/utils/device-signals";
import { buildActivityPatternDetailPayload } from "@/utils/activity-pattern-detail";
import { buildDemoTimelineEvents } from "@/utils/demo-timeline-events";
import {
  getEventsCarriedIntoDay,
  getEventsOverlappingDay,
} from "@/utils/event-repository";
import { useIsFocused } from "@react-navigation/native";
import {
  assembleMonthlyActivityPattern,
  carryPatternCellsForward,
  buildNormalizationMaximaAsync,
  buildPatternDayCellFromSamples,
  buildPatternDayCellsAsync,
  buildUnifiedTimelineAsync,
  getMonthlyPatternGrid,
  patternDayCellsByDate,
  rescoreTimeline,
  restoreSavedPattern,
  type ActivityPatternDayCell,
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
import { repositoryEpoch } from "@/utils/repository-session";
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

const NO_PENDING_DATES: ReadonlySet<string> = new Set();

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
  error,
  hasLoadedPattern,
  isDemoMode,
  mutedForeground,
  onRetry,
  onSelectCell,
  statusLabel,
  textSecondary,
}: {
  activityNormalizationWindow: ActivityNormalizationWindow;
  cells: ActivityPatternCell[];
  error: string | null;
  hasLoadedPattern: boolean;
  isDemoMode: boolean;
  mutedForeground: string;
  onRetry: () => void;
  onSelectCell: (cell: ActivityPatternCell) => void;
  /** Shown under the grid while it is still being brought up to date. */
  statusLabel: string | null;
  textSecondary: string;
}) {
  if (((!hasLoadedPattern && !isDemoMode) || !cells.length) && error) {
    return (
      <View style={styles.sectionBlock}>
        <Card>
          <View accessibilityLiveRegion="polite" style={styles.patternLoading}>
            <Text style={[styles.patternLoadingText, { color: textSecondary }]}>
              {error} The pattern can&apos;t be shown yet.
            </Text>
            <Button onPress={onRetry} variant="outline">
              Try again
            </Button>
          </View>
        </Card>
      </View>
    );
  }
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
      {error ? (
        <View
          accessibilityLiveRegion="polite"
          style={styles.patternRefreshingRow}
        >
          <Text
            style={[
              styles.patternRefreshingText,
              styles.patternErrorText,
              { color: textSecondary },
            ]}
          >
            {error} Showing the last result.
          </Text>
          <Button onPress={onRetry} variant="ghost">
            Try again
          </Button>
        </View>
      ) : statusLabel ? (
        <View style={styles.patternRefreshingRow}>
          <ActivityIndicator color={mutedForeground} size="small" />
          <Text
            style={[styles.patternRefreshingText, { color: textSecondary }]}
          >
            {statusLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
});


const ActivityStripSection = React.memo(function ActivityStripSection({
  buckets,
  error,
  note,
  onRetry,
}: {
  buckets: UnifiedTimelineBucket[];
  error: string | null;
  note: ActivityStripNote | null;
  onRetry: () => void;
}) {
  return (
    <View style={styles.sectionBlock}>
      <ActivityStrip
        buckets={buckets}
        error={error}
        note={note}
        onRetry={onRetry}
      />
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

  React.useEffect(() => {
    latestSignalValuesRef.current = signalValues;
  }, [signalValues]);
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
    if (isDemoMode || !collectors.activity.enabled) {
      setActivityPermissionStatus("not_requested");
      return;
    }

    void getActivityRecognitionPermissionStatusAsync().then(
      setActivityPermissionStatus,
    );
  }, [collectors.activity.enabled, isDemoMode]);

  // Wiping local data advances this; anything read before it is discarded.
  const dataEpoch = useRepositoryStore((state) => state.dataEpoch);
  // Failures surface in the cards with a retry instead of a permanent spinner.
  const [historyError, setHistoryError] = React.useState<string | null>(null);
  const [patternComputeError, setPatternComputeError] = React.useState<
    string | null
  >(null);
  const [rhythmError, setRhythmError] = React.useState<string | null>(null);
  const [patternRetry, setPatternRetry] = React.useState(0);

  // What the stored history is loaded for. New data inside it does not change
  // the scope; it only moves the revision, which queues another pass.
  const historyScope = React.useMemo(() => {
    if (isDemoMode) return null;
    const maximaStart =
      activityNormalizationWindow === "all"
        ? "1970-01-01"
        : getActivityNormalizationRange(
            todayAnchor,
            activityNormalizationWindow,
          ).start;
    return {
      anchor: todayAnchor,
      key: `${dataEpoch}:${todayAnchor}:${activityNormalizationWindow}`,
      maximaStart,
    };
  }, [activityNormalizationWindow, dataEpoch, isDemoMode, todayAnchor]);

  const historySessionRef = React.useRef<ActivityCacheSession | null>(null);
  const [latestHistoryRevision, setLatestHistoryRevision] = React.useState<{
    revision: string;
    scopeKey: string;
  } | null>(null);
  const latestHistoryRevisionRef = React.useRef(latestHistoryRevision);
  latestHistoryRevisionRef.current = latestHistoryRevision;
  // Identifies the newest stored revision seen for the current scope. A
  // loaded history is current when it carries the same key.
  const historyKey =
    historyScope && latestHistoryRevision?.scopeKey === historyScope.key
      ? `${historyScope.key}:${latestHistoryRevision.revision}`
      : null;

  React.useEffect(() => {
    if (!historyScope || !repository.isHydrated || !isFocused) {
      return;
    }

    let isCancelled = false;
    const { anchor, key: scopeKey, maximaStart } = historyScope;

    // The normalization window always contains the pattern grid, so one
    // revision covers both. It moves with the stored days' own staleness
    // rule, which also counts later sleep records that settle their nights.
    void getActivityHistoryRevision(maximaStart, shiftISODate(anchor, -1))
      .then((revision) => {
        if (isCancelled) return;
        setLatestHistoryRevision((current) =>
          current?.scopeKey === scopeKey && current.revision === revision
            ? current
            : { revision, scopeKey },
        );
        historySessionRef.current?.noteRevision(revision);
      })
      .catch(() => {
        if (!isCancelled)
          setHistoryError("Couldn't check your stored activity history.");
      });

    return () => {
      isCancelled = true;
    };
  }, [
    historyScope,
    isFocused,
    patternRetry,
    repository.isHydrated,
    repository.todayDataUpdatedAt,
  ]);

  // Past days come from per-day stored hourly samples, not raw events. The
  // session shows what is stored at once, rescores only the days that changed,
  // and is never restarted by new data: a reconcile after a long absence writes
  // past days in bursts, and restarting on each one kept the pattern loading
  // for as long as the writes went on.
  const [loadedHistory, setLoadedHistory] = React.useState<{
    anchor: string;
    epoch: number;
    history: ActivityHistory;
    key: string;
  } | null>(null);
  const activityHistory =
    loadedHistory?.epoch === dataEpoch ? loadedHistory : null;
  React.useEffect(() => {
    if (!historyScope || !repository.isHydrated || !isFocused) return;

    const { anchor, key: scopeKey, maximaStart } = historyScope;
    const epoch = repositoryEpoch();
    const session = startActivityCacheSession({
      load: (signal, onProgress) => {
        const stopLoadPattern = startPerfTimer("today.load_pattern_history", {
          screen: "today",
          todayAnchor: anchor,
        });
        return loadActivityHistory(
          maximaStart,
          shiftISODate(anchor, -1),
          getMonthlyPatternGrid(anchor)[0],
          signal,
          onProgress,
        ).then(
          (history) => {
            stopLoadPattern({
              days: history.samplesByDate.size,
              reason: "loaded",
            });
            return history;
          },
          (error) => {
            stopLoadPattern({
              reason:
                signal.aborted || epoch !== repositoryEpoch()
                  ? "cancelled"
                  : "error",
            });
            throw error;
          },
        );
      },
      onHistory: (history, revision, final) => {
        setLoadedHistory({
          anchor,
          epoch,
          history,
          key: `${scopeKey}:${revision}`,
        });
        if (final) setHistoryError(null);
      },
      onLoading: setIsLoadingPatternHistory,
      onError: () => {
        // A wipe mid-load is not a failure: the new epoch starts a new session.
        if (epoch === repositoryEpoch())
          setHistoryError("Couldn't load your activity history.");
      },
    });
    historySessionRef.current = session;
    const known = latestHistoryRevisionRef.current;
    if (known?.scopeKey === scopeKey) session.noteRevision(known.revision);

    return () => {
      session.stop();
      if (historySessionRef.current === session)
        historySessionRef.current = null;
      setIsLoadingPatternHistory(false);
    };
  }, [historyScope, isFocused, patternRetry, repository.isHydrated]);

  // Records from yesterday still running at midnight (sleep, long sessions)
  // shape today's cell, as they did when the grid was built from raw events.
  const [loadedCarried, setLoadedCarried] = React.useState<{
    anchor: string;
    epoch: number;
    events: ZentraEventRecord[];
  } | null>(null);
  const carriedIntoToday =
    loadedCarried?.epoch === dataEpoch ? loadedCarried : null;
  const loadedCarriedKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!historyScope || !isFocused || !historyKey) return;
    if (loadedCarriedKeyRef.current === historyKey) return;
    let isCancelled = false;
    const epoch = repositoryEpoch();
    const { anchor } = historyScope;
    void getEventsCarriedIntoDay(anchor)
      .then((events) => {
        if (isCancelled || epoch !== repositoryEpoch()) return;
        loadedCarriedKeyRef.current = historyKey;
        setLoadedCarried({ anchor, epoch, events });
      })
      .catch(() => {
        if (!isCancelled && epoch === repositoryEpoch())
          setHistoryError("Couldn't load last night's records for today.");
      });
    return () => {
      isCancelled = true;
    };
  }, [historyScope, isFocused, historyKey, patternRetry]);

  const [loadedSnapshot, setLoadedSnapshot] = React.useState<{
    epoch: number;
    snapshot: TodayPatternSnapshot;
  } | null>(null);
  React.useEffect(() => {
    let isCancelled = false;
    void loadTodayPatternSnapshot().then((value) => {
      if (!isCancelled) setLoadedSnapshot(value);
    });
    return () => {
      isCancelled = true;
    };
  }, []);
  const patternSnapshot =
    loadedSnapshot?.epoch === dataEpoch ? loadedSnapshot.snapshot : null;
  // A grid saved on an earlier day still gives the scale, and the days it
  // shares with today's grid, until the stored history has loaded.
  const usableSnapshot =
    !isDemoMode && patternSnapshot?.window === activityNormalizationWindow
      ? patternSnapshot
      : null;

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

  const [demoMaxima, setDemoMaxima] =
    React.useState<ActivityScoreMaxima | null>(null);
  React.useEffect(() => {
    if (!isFocused || !isDemoMode) return;
    const controller = new AbortController();
    const interaction = InteractionManager.runAfterInteractions(() => {
      void buildNormalizationMaximaAsync(demoPatternEvents, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setDemoMaxima(value);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setPatternComputeError("Couldn't calculate the sample pattern.");
        });
    });
    return () => {
      controller.abort();
      interaction.cancel();
    };
  }, [isFocused, isDemoMode, demoPatternEvents, patternRetry]);

  const todayTimelineEvents = React.useMemo(
    () => (isDemoMode ? demoPatternEvents : (repository.todayEvents ?? [])),
    [isDemoMode, demoPatternEvents, repository.todayEvents],
  );
  // Today's values carry the epoch of the events they were computed from, so
  // one computed before a wipe is neither shown nor saved after it.
  const [loadedRawTimeline, setLoadedRawTimeline] = React.useState<{
    anchor: string;
    buckets: UnifiedTimelineBucket[];
    epoch: number;
  } | null>(null);
  const todayRawTimeline =
    loadedRawTimeline?.epoch === dataEpoch ? loadedRawTimeline : null;
  const lastTodayTimelineInputRef = React.useRef<{
    anchor: string;
    epoch: number;
    events: ZentraEventRecord[];
  } | null>(null);
  React.useEffect(() => {
    if (!isFocused) return;
    const lastInput = lastTodayTimelineInputRef.current;
    if (
      lastInput?.anchor === todayAnchor &&
      lastInput.epoch === dataEpoch &&
      lastInput.events === todayTimelineEvents
    )
      return;

    const controller = new AbortController();
    const interaction = InteractionManager.runAfterInteractions(() => {
      void buildUnifiedTimelineAsync(
        todayTimelineEvents,
        {
          startTimestamp: new Date(`${todayAnchor}T00:00:00`).toISOString(),
          endTimestamp: new Date(
            `${shiftISODate(todayAnchor, 1)}T00:00:00`,
          ).toISOString(),
          resolution: "hour",
        },
        controller.signal,
      )
        .then((buckets) => {
          if (controller.signal.aborted) return;
          lastTodayTimelineInputRef.current = {
            anchor: todayAnchor,
            epoch: dataEpoch,
            events: todayTimelineEvents,
          };
          setLoadedRawTimeline({
            anchor: todayAnchor,
            buckets,
            epoch: dataEpoch,
          });
          setRhythmError(null);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setRhythmError("Couldn't calculate today's rhythm.");
        });
    });

    return () => {
      controller.abort();
      interaction.cancel();
    };
  }, [dataEpoch, isFocused, patternRetry, todayAnchor, todayTimelineEvents]);

  const todayMaxima = todayRawTimeline
    ? buildActivityScoreMaxima(todayRawTimeline.buckets)
    : null;
  // Final normalization: the stored window (up to yesterday) plus today.
  // While days are still being scored, the last saved window is folded in so
  // the scale does not creep as they land.
  const combinedMaximaCandidate = isDemoMode
    ? demoMaxima
    : activityHistory && todayMaxima
      ? mergeActivityScoreMaxima(
          !activityHistory.history.complete && usableSnapshot
            ? mergeActivityScoreMaxima(
                activityHistory.history.maxima,
                usableSnapshot.maxima,
              )
            : activityHistory.history.maxima,
          todayMaxima,
        )
      : null;
  // Provisional normalization so the rhythm paints before history loads: last
  // session's window if this day has one, otherwise today on its own.
  const rhythmMaximaCandidate =
    combinedMaximaCandidate ??
    (todayMaxima && !isDemoMode
      ? usableSnapshot
        ? mergeActivityScoreMaxima(usableSnapshot.maxima, todayMaxima)
        : todayMaxima
      : null);
  // Keyed on values: a today refresh that leaves the maxima unchanged must not
  // re-score the grid.
  const combinedMaximaKey = combinedMaximaCandidate
    ? Object.values(combinedMaximaCandidate).join(",")
    : null;
  const combinedMaxima = React.useMemo(
    () => combinedMaximaCandidate,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [combinedMaximaKey],
  );
  const rhythmMaximaKey = rhythmMaximaCandidate
    ? Object.values(rhythmMaximaCandidate).join(",")
    : null;
  const rhythmMaxima = React.useMemo(
    () => rhythmMaximaCandidate,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rhythmMaximaKey],
  );

  const dailyRhythmBuckets = React.useMemo(
    () =>
      todayRawTimeline && rhythmMaxima
        ? rescoreTimeline(todayRawTimeline.buckets, rhythmMaxima)
        : [],
    [todayRawTimeline, rhythmMaxima],
  );

  // Demo data has no cache; its grid is still built from the sample events.
  const [demoHistoricalCells, setDemoHistoricalCells] = React.useState<{
    anchor: string;
    cells: Map<string, ActivityPatternDayCell>;
  } | null>(null);
  React.useEffect(() => {
    if (!isFocused || !isDemoMode || !combinedMaxima) return;
    const controller = new AbortController();
    const interaction = InteractionManager.runAfterInteractions(() => {
      void buildPatternDayCellsAsync(
        demoPatternEvents,
        getMonthlyPatternGrid(todayAnchor).filter((date) => date < todayAnchor),
        "hour",
        combinedMaxima,
        controller.signal,
      )
        .then((cells) => {
          if (!controller.signal.aborted)
            setDemoHistoricalCells({ anchor: todayAnchor, cells });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setPatternComputeError("Couldn't calculate the sample pattern.");
        });
    });

    return () => {
      controller.abort();
      interaction.cancel();
    };
  }, [
    combinedMaxima,
    demoPatternEvents,
    isDemoMode,
    isFocused,
    patternRetry,
    todayAnchor,
  ]);

  // 27 days x 24 hours of cached samples: cheap enough to score during render.
  const liveHistoricalCells = React.useMemo(() => {
    if (
      isDemoMode ||
      !combinedMaxima ||
      activityHistory?.anchor !== todayAnchor
    )
      return null;
    const { pendingDates, samplesByDate } = activityHistory.history;
    const cells = new Map<string, ActivityPatternDayCell>();
    for (const date of getMonthlyPatternGrid(todayAnchor)) {
      if (date >= todayAnchor) break;
      // A day still waiting for its first score is left out, not drawn empty.
      if (pendingDates.has(date)) continue;
      cells.set(
        date,
        buildPatternDayCellFromSamples(
          date,
          samplesByDate.get(date) ?? [],
          combinedMaxima,
        ),
      );
    }
    return { cells, pendingDates };
  }, [activityHistory, combinedMaxima, isDemoMode, todayAnchor]);
  const historicalCells = React.useMemo(
    () =>
      !isDemoMode
        ? liveHistoricalCells
        : demoHistoricalCells?.anchor === todayAnchor
          ? { cells: demoHistoricalCells.cells, pendingDates: NO_PENDING_DATES }
          : null,
    [demoHistoricalCells, isDemoMode, liveHistoricalCells, todayAnchor],
  );

  const todayCellEvents = React.useMemo(() => {
    if (isDemoMode) return demoPatternEvents;
    const carried =
      carriedIntoToday?.anchor === todayAnchor ? carriedIntoToday.events : [];
    return carried.length
      ? [...carried, ...todayTimelineEvents]
      : todayTimelineEvents;
  }, [
    carriedIntoToday,
    demoPatternEvents,
    isDemoMode,
    todayAnchor,
    todayTimelineEvents,
  ]);
  const [loadedTodayCell, setLoadedTodayCell] = React.useState<{
    anchor: string;
    cell: ActivityPatternDayCell;
    epoch: number;
  } | null>(null);
  const todayCell =
    loadedTodayCell?.epoch === dataEpoch ? loadedTodayCell : null;
  React.useEffect(() => {
    if (!isFocused || !combinedMaxima) return;
    const controller = new AbortController();
    const interaction = InteractionManager.runAfterInteractions(() => {
      void buildPatternDayCellsAsync(
        todayCellEvents,
        [todayAnchor],
        "hour",
        combinedMaxima,
        controller.signal,
      )
        .then((cells) => {
          const cell = cells.get(todayAnchor);
          if (controller.signal.aborted || !cell) return;
          setLoadedTodayCell({ anchor: todayAnchor, cell, epoch: dataEpoch });
          setPatternComputeError(null);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setPatternComputeError("Couldn't calculate today's activity.");
        });
    });

    return () => {
      controller.abort();
      interaction.cancel();
    };
  }, [
    combinedMaxima,
    dataEpoch,
    isFocused,
    patternRetry,
    todayAnchor,
    todayCellEvents,
  ]);

  const savedDayCells = React.useMemo(
    () =>
      usableSnapshot
        ? patternDayCellsByDate(usableSnapshot.cells, usableSnapshot.anchor)
        : null,
    [usableSnapshot],
  );
  const freshMonthCells = React.useMemo<ActivityPatternCell[] | null>(() => {
    if (!historicalCells || todayCell?.anchor !== todayAnchor) return null;
    const dayCells = new Map(historicalCells.cells);
    const pendingDates = new Set<string>();
    // A day not scored yet keeps its last saved cell if there is one.
    for (const date of historicalCells.pendingDates) {
      const saved = savedDayCells?.get(date);
      if (saved) dayCells.set(date, saved);
      else pendingDates.add(date);
    }
    dayCells.set(todayAnchor, todayCell.cell);
    return assembleMonthlyActivityPattern(todayAnchor, dayCells, pendingDates);
  }, [historicalCells, savedDayCells, todayAnchor, todayCell]);
  // Before the stored history arrives: the saved grid as it was, or carried
  // onto today's grid when it was saved on an earlier day.
  const snapshotCells = React.useMemo(
    () =>
      !usableSnapshot
        ? null
        : usableSnapshot.anchor === todayAnchor
          ? restoreSavedPattern(usableSnapshot.cells, usableSnapshot.anchor)
          : carryPatternCellsForward(
              todayAnchor,
              usableSnapshot.cells,
              usableSnapshot.anchor,
            ),
    [todayAnchor, usableSnapshot],
  );
  const monthCells = React.useMemo(
    () => freshMonthCells ?? snapshotCells ?? [],
    [freshMonthCells, snapshotCells],
  );
  const visibleHistoryCurrent =
    isDemoMode ||
    (activityHistory?.anchor === todayAnchor &&
      activityHistory.history.visibleComplete);
  // Cells that are all still loading are not "no pattern yet".
  const patternReady =
    monthCells.length > 0 &&
    (visibleHistoryCurrent || monthCells.some((cell) => cell.hasAnyData));
  // The older days only refine the scale; say so rather than "refreshing".
  const patternStatus =
    isDemoMode || !isLoadingPatternHistory
      ? null
      : visibleHistoryCurrent
        ? "Updating the scale from older history..."
        : "Refreshing pattern...";

  const retryPattern = React.useCallback(() => {
    loadedCarriedKeyRef.current = null;
    lastTodayTimelineInputRef.current = null;
    setHistoryError(null);
    setPatternComputeError(null);
    setRhythmError(null);
    setPatternRetry((value) => value + 1);
  }, []);
  const patternError = historyError ?? patternComputeError;

  // Until the stored window is fully loaded the rhythm is scored against a
  // stand-in baseline; say which one so a later rescale is not a surprise.
  const rhythmScaleNote = React.useMemo<ActivityStripNote | null>(() => {
    if (isDemoMode || !dailyRhythmBuckets.length) return null;
    if (activityHistory?.history.complete) return null;
    const basis = usableSnapshot
      ? "your last saved baseline"
      : activityHistory
        ? "the days loaded so far"
        : "today only";
    return historyError
      ? {
          busy: false,
          onRetry: retryPattern,
          text: `Provisional scale: history couldn't load, so this is scored against ${basis}.`,
        }
      : {
          busy: true,
          text: `Provisional scale: scored against ${basis} while your history loads.`,
        };
  }, [
    activityHistory,
    dailyRhythmBuckets.length,
    historyError,
    isDemoMode,
    retryPattern,
    usableSnapshot,
  ]);

  // Remember the grid so the next open paints at once. It is saved as soon as
  // the days it draws are current, without waiting for the older days that
  // only refine the scale: that fill can outlast the user's visit.
  const lastSnapshotSaveRef = React.useRef({ at: 0, complete: false });
  React.useEffect(() => {
    if (
      isDemoMode ||
      !freshMonthCells ||
      !combinedMaxima ||
      // Only current days at the current revision: never re-save a grid
      // computed before the data underneath it changed or was cleared.
      !activityHistory?.history.visibleComplete ||
      activityHistory.key !== historyKey
    )
      return;
    const { complete } = activityHistory.history;
    const last = lastSnapshotSaveRef.current;
    if (Date.now() - last.at < 60_000 && !(complete && !last.complete)) return;
    lastSnapshotSaveRef.current = { at: Date.now(), complete };
    void saveTodayPatternSnapshot(
      {
        anchor: todayAnchor,
        cells: freshMonthCells,
        maxima: combinedMaxima,
        window: activityNormalizationWindow,
      },
      activityHistory.epoch,
    );
  }, [
    activityHistory,
    activityNormalizationWindow,
    combinedMaxima,
    freshMonthCells,
    historyKey,
    isDemoMode,
    todayAnchor,
  ]);

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
      patternReady;

    if (!readyForFirstPaint || !focusReadyStopRef.current) {
      return;
    }

    focusReadyStopRef.current({
      events: repository.todayEvents.length,
      fromSnapshot: !freshMonthCells,
      hasCollectors: hasEnabledCollectors,
      ready: true,
    });
    focusReadyStopRef.current = null;
  }, [
    collectors,
    freshMonthCells,
    patternReady,
    isDemoMode,
    isFocused,
    repository.isHydrated,
    repository.todayEvents.length,
  ]);

  // Raw events for one day are only read when its detail sheet opens.
  const patternDetailRequestRef = React.useRef(0);
  const closeDetail = React.useCallback(() => {
    patternDetailRequestRef.current++;
    setSelectedDetail(null);
  }, []);
  const handleSelectPatternCell = React.useCallback(
    (cell: ActivityPatternCell) => {
      const request = ++patternDetailRequestRef.current;
      const date = toISODate(new Date(cell.startTimestamp));
      const events = isDemoMode
        ? Promise.resolve(demoPatternEvents)
        : date === todayAnchor
          ? Promise.resolve(todayCellEvents)
          : getEventsOverlappingDay(date);
      void events
        .then((value) => {
          if (request !== patternDetailRequestRef.current) return;
          setSelectedDetail(
            buildActivityPatternDetailPayload(
              cell,
              value,
              combinedMaxima ?? rhythmMaxima,
            ),
          );
        })
        .catch(() => undefined);
    },
    [
      combinedMaxima,
      demoPatternEvents,
      isDemoMode,
      rhythmMaxima,
      todayAnchor,
      todayCellEvents,
    ],
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
              error={patternError}
              hasLoadedPattern={patternReady}
              isDemoMode={isDemoMode}
              statusLabel={patternStatus}
              mutedForeground={palette.mutedForeground}
              onRetry={retryPattern}
              onSelectCell={handleSelectPatternCell}
              textSecondary={palette.textSecondary}
            />
          );
        case "metrics":
          return (
            <MetricGrid metrics={metrics} onPress={handleSelectMetric} />
          );
        case "activityStrip":
          return (
            <ActivityStripSection
              buckets={dailyRhythmBuckets}
              error={rhythmError}
              note={rhythmScaleNote}
              onRetry={retryPattern}
            />
          );
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
      isDemoMode,
      patternReady,
      patternStatus,
      metrics,
      monthCells,
      palette.mutedForeground,
      patternError,
      retryPattern,
      rhythmError,
      rhythmScaleNote,
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
      <DetailSheet onClose={closeDetail} payload={selectedDetail} />
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
  patternErrorText: {
    flex: 1,
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

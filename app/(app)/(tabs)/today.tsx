import React from "react";
import {
  ActivityIndicator,
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
  TodayDetailPayload,
  TodayRecentSignalRow,
  TodaySummaryMetric,
} from "@/utils/today-visualization";
import { formatScreenDate, getDateRangeForTrendRange } from "@/utils/dates";
import {
  buildCollectorStatuses,
  buildLiveDashboardMetrics,
  buildLiveSleepEstimate,
} from "@/utils/device-signals";
import { buildActivityPatternDetailPayload } from "@/utils/activity-pattern-detail";
import { buildDemoTimelineEvents } from "@/utils/demo-timeline-events";
import { getEventsForRange } from "@/utils/event-repository";
import {
  buildMonthlyActivityPattern,
  buildUnifiedDailyTimeline,
} from "@/utils/unified-timeline";
import { getActivityRecognitionPermissionStatusAsync } from "@/utils/native/zentra-native-signals";
import {
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
import type {
  ActivityPatternCell,
  PermissionStatus,
  ZentraEventRecord,
} from "@/types/zentra";
import { useShallow } from "zustand/react/shallow";

export default function TodayScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const collectors = useAppStore((state) => state.collectors);
  const dataMode = useAppStore((state) => state.dataMode);
  const repository = useRepositoryStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      lastUpdatedAt: state.lastUpdatedAt,
      todaySnapshot: state.todaySnapshot,
      todayAggregate: state.todayAggregate,
      todayEvents: state.todayEvents,
      latestSleepEvent: state.latestSleepEvent,
      diagnostics: state.diagnostics,
    })),
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
  const [overviewEvents, setOverviewEvents] = React.useState<
    ZentraEventRecord[]
  >([]);
  const [hasLoadedPattern, setHasLoadedPattern] = React.useState(false);

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
    if (isDemoMode || !repository.isHydrated) {
      return;
    }

    let isCancelled = false;
    const range = getDateRangeForTrendRange("7d");

    async function loadOverviewEvents(): Promise<void> {
      try {
        const events = await getEventsForRange(range.start, range.end);

        if (!isCancelled) {
          setOverviewEvents(events);
          setHasLoadedPattern(true);
        }
      } catch {
        // keep previous data on failure
      }
    }

    const interaction = InteractionManager.runAfterInteractions(() => {
      void loadOverviewEvents();
    });

    return () => {
      isCancelled = true;
      interaction.cancel();
    };
  }, [isDemoMode, repository.isHydrated, repository.lastUpdatedAt]);

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
  const secondaryMetrics: TodaySummaryMetric[] = React.useMemo(
    () =>
      isDemoMode
        ? []
        : buildTodaySecondaryMetrics(
            repository.todayAggregate,
            repository.todaySnapshot,
            repository.todayEvents,
          ),
    [
      isDemoMode,
      repository.todayAggregate,
      repository.todaySnapshot,
      repository.todayEvents,
    ],
  );
  const recentSignals: TodayRecentSignalRow[] = React.useMemo(
    () => (isDemoMode ? [] : buildRecentSignalRows(repository.todayEvents)),
    [isDemoMode, repository.todayEvents],
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
  const todayAnchor = React.useMemo(
    () => new Date().toISOString().slice(0, 10),
    [],
  );
  const demoPatternEvents = React.useMemo(
    () => buildDemoTimelineEvents(demoCollectors),
    [demoCollectors],
  );
  const patternSourceEvents = isDemoMode ? demoPatternEvents : overviewEvents;
  const dailyRhythmBuckets = React.useMemo(
    () =>
      buildUnifiedDailyTimeline(
        isDemoMode ? demoPatternEvents : (repository.todayEvents ?? []),
        todayAnchor,
        "hour",
      ),
    [isDemoMode, demoPatternEvents, repository.todayEvents, todayAnchor],
  );
  const monthCells = React.useMemo(
    () => buildMonthlyActivityPattern(patternSourceEvents, todayAnchor, "hour"),
    [patternSourceEvents, todayAnchor],
  );

  function handleSelectMetric(metric: (typeof metrics)[number]): void {
    setSelectedDetail(
      buildTodayMetricDetailPayload(metric, {
        todayAggregate: repository.todayAggregate,
        todayEvents: repository.todayEvents,
        todaySnapshot: repository.todaySnapshot,
      }),
    );
  }

  function handleSelectSecondaryMetric(
    metric: (typeof secondaryMetrics)[number],
  ): void {
    setSelectedDetail(
      buildTodayMetricDetailPayload(metric, {
        todayAggregate: repository.todayAggregate,
        todayEvents: repository.todayEvents,
        todaySnapshot: repository.todaySnapshot,
      }),
    );
  }

  const introTitle = isDemoMode
    ? "Welcome"
    : hasCollectors
      ? "Welcome back."
      : "Hey, welcome.";
  const introBody = isDemoMode
    ? "Sample signals are flowing. This is what Zentra looks like with real data."
    : hasCollectors
      ? "Your signals are coming in. Everything looks good."
      : "Nothing's running yet — head to Settings and turn on a collector to start.";

  return (
    <ScreenShell subtitle={formatScreenDate(new Date())} title="Today">
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
          title="Nothing here yet"
        />
      ) : (
        <>
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
                    Building your pattern…
                  </Text>
                </View>
              </Card>
            ) : (
              <ActivityPatternCard
                cells={monthCells}
                onSelectCell={(cell: ActivityPatternCell) =>
                  setSelectedDetail(
                    buildActivityPatternDetailPayload(
                      cell,
                      patternSourceEvents,
                    ),
                  )
                }
              />
            )}
          </View>
          <View style={styles.metricGrid}>
            {metrics.map((metric) => (
              <View key={metric.key} style={styles.metricCell}>
                <MetricCard
                  metric={metric}
                  onPress={() => handleSelectMetric(metric)}
                />
              </View>
            ))}
          </View>
          <View style={styles.sectionBlock}>
            <ActivityStrip buckets={dailyRhythmBuckets} />
          </View>
          {secondaryMetrics.length ? (
            <View style={styles.sectionBlock}>
              <SignalSummaryCard
                metrics={secondaryMetrics}
                onSelectMetric={handleSelectSecondaryMetric}
              />
            </View>
          ) : null}
          <View style={styles.sectionBlock}>
            <SleepEstimateCard sleepEstimate={sleepEstimate} />
          </View>
          <View style={styles.sectionBlock}>
            <RecentSignalFeed
              onSelectRow={(row) =>
                setSelectedDetail(
                  buildRecentSignalDetailPayload(
                    row.event,
                    repository.todayEvents,
                  ),
                )
              }
              rows={recentSignals}
            />
          </View>
          <View style={styles.sectionBlock}>
            <CompletenessCard
              collectors={visibleCollectors}
              summary={signalHealthSummary ?? undefined}
            />
          </View>
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
  sectionBlock: {
    marginBottom: Spacing.lg,
  },
});

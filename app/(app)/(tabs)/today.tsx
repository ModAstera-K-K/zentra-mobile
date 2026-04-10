import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActivityStrip } from '@/components/zentra/ActivityStrip';
import { CompletenessCard } from '@/components/zentra/CompletenessCard';
import { EmptyState } from '@/components/zentra/EmptyState';
import { MetricCard } from '@/components/zentra/MetricCard';
import { PilotLight } from '@/components/zentra/PilotLight';
import { ScreenLead } from '@/components/zentra/ScreenLead';
import { ScreenShell } from '@/components/zentra/ScreenShell';
import { SleepEstimateCard } from '@/components/zentra/SleepEstimateCard';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppStore, useRepositoryStore, useSignalStore } from '@/stores';
import { formatScreenDate } from '@/utils/dates';
import {
  buildCollectorStatuses,
  buildLiveDashboardMetrics,
  buildLiveSleepEstimate,
} from '@/utils/device-signals';
import {
  buildActivityHours,
  buildDashboardMetrics,
  buildSleepEstimate,
  createDemoCollectors,
} from '@/utils/mock-data';
import { useShallow } from 'zustand/react/shallow';

export default function TodayScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const collectors = useAppStore((state) => state.collectors);
  const dataMode = useAppStore((state) => state.dataMode);
  const repository = useRepositoryStore(useShallow((state) => ({
    isHydrated: state.isHydrated,
    todaySnapshot: state.todaySnapshot,
    todayAggregate: state.todayAggregate,
    latestSleepEvent: state.latestSleepEvent,
    diagnostics: state.diagnostics,
  })));
  const signals = useSignalStore(useShallow((state) => ({
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
  })));
  const demoCollectors = createDemoCollectors(collectors);
  const isDemoMode = dataMode === 'demo';
  const metrics = isDemoMode
    ? buildDashboardMetrics(demoCollectors, true)
    : buildLiveDashboardMetrics(collectors, signals, repository.todaySnapshot, repository.todayAggregate);
  const activityHours = isDemoMode ? buildActivityHours(demoCollectors, true) : [];
  const sleepEstimate = isDemoMode
    ? buildSleepEstimate(demoCollectors, true)
    : buildLiveSleepEstimate(repository.latestSleepEvent);
  const visibleCollectors = isDemoMode
    ? Object.values(demoCollectors).filter((collector) => collector.enabled)
    : buildCollectorStatuses(collectors, signals, repository.diagnostics).filter((collector) => collector.enabled);
  const hasCollectors = Object.values(collectors).some((collector) => collector.enabled);

  return (
    <ScreenShell subtitle={formatScreenDate(new Date())} title="Today">
      <ScreenLead
        body={isDemoMode
          ? 'Demo mode renders the same shell and sample signals across iPhone and Android for walkthroughs.'
          : hasCollectors
            ? 'Available signals surface in one shared layout. Unsupported capabilities stay labeled instead of disappearing.'
            : 'The interface stays ready before permissions are granted. Enable a collector in Settings to start the local record.'}
        eyebrow="Collection state"
        footer={(
          <View style={styles.leadFooter}>
            <Text style={[styles.leadMeta, { color: palette.textSecondary }]}>
              {isDemoMode ? 'Demo mode' : 'Live mode'}
            </Text>
            <Text style={[styles.leadMeta, { color: palette.textSecondary }]}>
              {hasCollectors
                ? `${visibleCollectors.length} collector${visibleCollectors.length === 1 ? '' : 's'} enabled`
                : 'No collectors enabled'}
            </Text>
          </View>
        )}
        title={isDemoMode
          ? 'Sample signals are filling the instrument.'
          : hasCollectors
            ? 'Live readings stay local and aligned across both platforms.'
            : 'The shell is ready before collection begins.'}
        trailing={<PilotLight size={14} />}
      />

      {(!repository.isHydrated && !isDemoMode) || !hasCollectors ? (
        <EmptyState
          body="Turn on a collector in Settings to start reading device signals. The app stays usable even before any permission is granted."
          title="No signals available yet"
        />
      ) : (
        <>
          <View style={styles.metricGrid}>
            {metrics.map((metric) => (
              <View key={metric.key} style={styles.metricCell}>
                <MetricCard metric={metric} />
              </View>
            ))}
          </View>
          <View style={styles.sectionBlock}>
            <ActivityStrip hours={activityHours} />
          </View>
          <View style={styles.sectionBlock}>
            <SleepEstimateCard sleepEstimate={sleepEstimate} />
          </View>
          <View style={styles.sectionBlock}>
            <CompletenessCard collectors={visibleCollectors} />
          </View>
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  leadFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  leadMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  metricCell: {
    height: 228,
    width: '48%',
  },
  sectionBlock: {
    marginBottom: Spacing.lg,
  },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActivityStrip } from '@/components/zentra/ActivityStrip';
import { CompletenessCard } from '@/components/zentra/CompletenessCard';
import { EmptyState } from '@/components/zentra/EmptyState';
import { MetricCard } from '@/components/zentra/MetricCard';
import { PilotLight } from '@/components/zentra/PilotLight';
import { ScreenShell } from '@/components/zentra/ScreenShell';
import { SleepEstimateCard } from '@/components/zentra/SleepEstimateCard';
import { Card } from '@/components/ui/Card';
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
      <Card elevated style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <Text style={[styles.heroMeta, { color: palette.textSecondary }]}>
              Active collection
            </Text>
            <Text style={[styles.heroTitle, { color: palette.foreground }]}>
              One quiet instrument, always watching.
            </Text>
            <Text style={[styles.heroBody, { color: palette.textSecondary }]}>
              {isDemoMode
                ? 'Demonstration mode is active. These values are illustrative and do not reflect this device.'
                : 'Live readings appear here when device access is available. Unsupported signals stay clearly marked.'}
            </Text>
          </View>
          <PilotLight size={12} />
        </View>
      </Card>

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
  heroCard: {
    marginBottom: Spacing.lg,
  },
  heroRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroCopy: {
    flex: 1,
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },
  heroMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSizes['2xl'],
    lineHeight: 32,
  },
  heroBody: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.base,
    lineHeight: 24,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  metricCell: {
    width: '48%',
  },
  sectionBlock: {
    marginBottom: Spacing.lg,
  },
});

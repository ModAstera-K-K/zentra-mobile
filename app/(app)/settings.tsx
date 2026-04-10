import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';

import { CollectorToggleCard } from '@/components/zentra/CollectorToggleCard';
import { ScreenShell } from '@/components/zentra/ScreenShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppearanceStore, useAppStore, useRepositoryStore, useSignalStore } from '@/stores';
import type { DataMode, ThemePreference } from '@/types/zentra';
import { buildCollectorStatuses } from '@/utils/device-signals';
import { useShallow } from 'zustand/react/shallow';

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark', 'sunrise'];
const DATA_MODE_OPTIONS: DataMode[] = ['live', 'demo'];

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const collectors = useAppStore((state) => state.collectors);
  const setCollectorEnabled = useAppStore((state) => state.setCollectorEnabled);
  const dataMode = useAppStore((state) => state.dataMode);
  const setDataMode = useAppStore((state) => state.setDataMode);
  const clearAllData = useAppStore((state) => state.clearAllData);
  const retryCollectors = useAppStore((state) => state.retryCollectors);
  const lastExportedAt = useAppStore((state) => state.lastExportedAt);
  const themePreference = useAppearanceStore((state) => state.themePreference);
  const setThemePreference = useAppearanceStore((state) => state.setThemePreference);
  const clearCapturedData = useSignalStore((state) => state.clearCapturedData);
  const clearRepositoryData = useRepositoryStore((state) => state.clearRepositoryData);
  const diagnostics = useRepositoryStore((state) => state.diagnostics);
  const diagnosticsHistory = useRepositoryStore((state) => state.diagnosticsHistory);
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
  const collectorStatuses = buildCollectorStatuses(collectors, signals, diagnostics);

  function confirmDelete(): void {
    Alert.alert(
      'Delete all local data?',
      'This clears captured local readings and export metadata stored on this device.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          style: 'destructive',
          text: 'Delete',
          onPress: () => {
            void clearAllData();
            void clearCapturedData();
            void clearRepositoryData();
          },
        },
      ],
    );
  }

  return (
    <ScreenShell settingsEnabled={false} subtitle="Controls and diagnostics" title="Settings">
      <Button onPress={() => router.back()} style={styles.backButton} variant="ghost">
        Back
      </Button>

      <Card style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>Appearance</Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((option) => (
            <Chip
              key={option}
              active={themePreference === option}
              label={option}
              onPress={() => void setThemePreference(option)}
            />
          ))}
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>Data source</Text>
        <View style={styles.themeRow}>
          {DATA_MODE_OPTIONS.map((option) => (
            <Chip
              key={option}
              active={dataMode === option}
              label={option}
              onPress={() => void setDataMode(option)}
            />
          ))}
        </View>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          {dataMode === 'demo'
            ? 'Demo mode shows illustrative dashboard, trends, and export data for presentations.'
            : 'Live mode reads supported on-device signals and leaves unsupported surfaces empty.'}
        </Text>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>Collectors</Text>
        <View style={styles.column}>
          {collectorStatuses.map((collector) => (
            <CollectorToggleCard
              collector={collector}
              key={collector.key}
              onValueChange={(value) => void setCollectorEnabled(collector.key, value)}
            />
          ))}
        </View>
      </Card>

      <Card elevated style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>Data controls</Text>
        <View style={styles.actionRow}>
          <Button onPress={confirmDelete} variant="outline">Delete all data</Button>
          <Button onPress={() => void retryCollectors()} variant="outline">Retry collectors</Button>
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>Diagnostics</Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Schema version 1
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          App version {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last export {lastExportedAt ? new Date(lastExportedAt).toLocaleString() : 'No export yet'}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Current data mode {dataMode}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Repository diagnostics {diagnostics.length ? `${diagnostics.length} collector(s) with stored status` : 'No stored collector activity yet'}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Live signals currently supported in this build: steps, battery state, foreground location, ambient light, and native Activity or Health Connect once the Android dev client is rebuilt.
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Sunrise mode uses a local 06:00–18:00 daylight heuristic in this preview shell.
        </Text>
        <View style={styles.diagnosticsColumn}>
          {diagnosticsHistory.slice(0, 10).map((entry) => (
            <View key={entry.id} style={[styles.diagnosticItem, { borderBottomColor: palette.border }]}>
              <Text style={[styles.diagnosticKey, { color: palette.foreground }]}>
                {entry.collectorKey}
              </Text>
              <Text style={[styles.detail, { color: palette.textSecondary }]}>
                {entry.status} · {entry.message ?? 'No message'} · failures {entry.consecutiveFailures}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.md,
    paddingHorizontal: 0,
  },
  section: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  themeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  column: {
    gap: Spacing.md,
  },
  actionRow: {
    gap: Spacing.sm,
  },
  detail: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  diagnosticsColumn: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  diagnosticItem: {
    borderBottomWidth: 1,
    gap: 2,
    paddingBottom: Spacing.sm,
  },
  diagnosticKey: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
});

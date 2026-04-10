import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/zentra/EmptyState';
import { HeatmapCard } from '@/components/zentra/HeatmapCard';
import { ScreenShell } from '@/components/zentra/ScreenShell';
import { TrendChartCard } from '@/components/zentra/TrendChartCard';
import { Chip } from '@/components/ui/Chip';
import { Card } from '@/components/ui/Card';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppStore } from '@/stores';
import type { TrendRange } from '@/types/zentra';
import { buildHeatmap, buildTrendSeries, createDemoCollectors } from '@/utils/mock-data';

const RANGE_OPTIONS: { label: string; value: TrendRange }[] = [
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: 'Custom', value: 'custom' },
];

export default function TrendsScreen() {
  const [range, setRange] = React.useState<TrendRange>('30d');
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const collectors = useAppStore((state) => state.collectors);
  const dataMode = useAppStore((state) => state.dataMode);
  const demoCollectors = createDemoCollectors(collectors);
  const isDemoMode = dataMode === 'demo';
  const series = isDemoMode ? buildTrendSeries(range, demoCollectors, true) : [];
  const heatmap = isDemoMode ? buildHeatmap(demoCollectors, true) : [];
  const hasCollectors = Object.values(collectors).some((collector) => collector.enabled);
  const emptyTitle = hasCollectors ? 'Collecting data' : 'No trend data yet';
  const emptyBody = hasCollectors
    ? 'Come back later once Zentra has gathered enough on-device history to show patterns here.'
    : 'Turn on one or more collectors in Settings to start building trend history.';

  return (
    <ScreenShell subtitle="Long-view patterns" title="Trends">
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

      {range === 'custom' ? (
        <View style={styles.sectionBlock}>
          <Card style={styles.customCard}>
            <Text style={[styles.customTitle, { color: palette.foreground }]}>
              Custom range preview
            </Text>
            <Text style={[styles.customBody, { color: palette.textSecondary }]}>
              This shell uses a rolling 14-day custom window until native date pickers are added in the next pass.
            </Text>
          </Card>
        </View>
      ) : null}

      {isDemoMode ? (
        <>
          {series.map((entry) => (
            <View key={entry.key} style={styles.sectionBlock}>
              <TrendChartCard series={entry} />
            </View>
          ))}
          <View style={styles.sectionBlock}>
            <HeatmapCard cells={heatmap} />
          </View>
        </>
      ) : (
        <EmptyState
          body={emptyBody}
          title={emptyTitle}
        />
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  customCard: {
    marginBottom: 0,
  },
  customTitle: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
    marginBottom: Spacing.sm,
  },
  customBody: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  sectionBlock: {
    marginBottom: Spacing.lg,
  },
});

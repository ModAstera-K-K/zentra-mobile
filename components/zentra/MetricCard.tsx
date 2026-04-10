import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Colors, Fonts, FontSizes, Spacing, type AppPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { DashboardMetric } from '@/types/zentra';

interface MetricCardProps {
  metric: DashboardMetric;
  onPress?: () => void;
}

function getToneColor(metric: DashboardMetric, palette: AppPalette): string {
  switch (metric.tone) {
    case 'physical':
      return palette.signalPhysical;
    case 'human':
      return palette.signalHuman;
    case 'cool':
      return palette.signalCool;
    default:
      return palette.primary;
  }
}

export function MetricCard({ metric, onPress }: MetricCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const accent = getToneColor(metric, palette);

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: palette.textSecondary }]}>{metric.label}</Text>
        <View style={[styles.accent, { backgroundColor: accent }]} />
      </View>
      <Text style={[styles.value, { color: accent }]}>
        {metric.value}
      </Text>
      <View style={[styles.rule, { backgroundColor: palette.border }]} />
      <Text style={[styles.detail, { color: palette.textSecondary }]}>
        {metric.detail}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    height: '100%',
    gap: Spacing.sm,
    paddingBottom: Spacing['2xl'],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  accent: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  value: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes['2xl'],
    marginTop: Spacing.xs,
  },
  rule: {
    height: 1,
    marginVertical: Spacing.sm,
  },
  detail: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginTop: 'auto',
  },
});

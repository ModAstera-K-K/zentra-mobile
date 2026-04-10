import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Card } from '@/components/ui/Card';
import { BorderRadius, Colors, Fonts, FontSizes, Spacing, type AppPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { DashboardMetric } from '@/types/zentra';

interface MetricCardProps {
  metric: DashboardMetric;
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

export function MetricCard({ metric }: MetricCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const accent = getToneColor(metric, palette);

  return (
    <Card style={styles.card}>
      <LinearGradient
        colors={[palette.halo, 'transparent']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.gradient}
      />
      <Text style={[styles.label, { color: palette.textSecondary }]}>
        {metric.label}
      </Text>
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
    gap: Spacing.sm,
    minHeight: 164,
    position: 'relative',
  },
  gradient: {
    borderRadius: BorderRadius.xl,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
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
  },
});

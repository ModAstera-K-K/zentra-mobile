import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { TodaySummaryMetric } from '@/utils/today-visualization';

interface SignalSummaryCardProps {
  metrics: TodaySummaryMetric[];
  onSelectMetric?: (metric: TodaySummaryMetric) => void;
}

export function SignalSummaryCard({ metrics, onSelectMetric }: SignalSummaryCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <Card elevated>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>Signal summary</Text>
      <View style={styles.grid}>
        {metrics.map((metric) => {
          const accent = metric.tone === 'physical'
            ? palette.signalPhysical
            : metric.tone === 'human'
              ? palette.signalHuman
              : metric.tone === 'cool'
                ? palette.signalCool
                : palette.primary;

          return (
            <Pressable
              key={metric.key}
              onPress={onSelectMetric ? () => onSelectMetric(metric) : undefined}
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: palette.card,
                  borderColor: palette.border,
                },
                pressed && styles.tilePressed,
              ]}
            >
              <View style={styles.metricHeader}>
                <Text style={[styles.metricLabel, { color: palette.textSecondary }]}>
                  {metric.label}
                </Text>
                <View style={[styles.dot, { backgroundColor: accent }]} />
              </View>
              <Text
                numberOfLines={1}
                style={[styles.metricValue, { color: accent }]}
              >
                {metric.value}
              </Text>
              <Text style={[styles.metricDetail, { color: palette.textSecondary }]}>
                {metric.detail}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  dot: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.3,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  metricDetail: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  metricHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.lg,
  },
  tile: {
    borderRadius: 18,
    borderWidth: 1,
    gap: Spacing.sm,
    minHeight: 128,
    padding: Spacing.md,
    width: '48%',
  },
  tilePressed: {
    opacity: 0.92,
  },
});

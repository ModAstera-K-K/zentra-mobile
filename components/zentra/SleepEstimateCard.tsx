import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { SleepEstimate } from '@/types/zentra';

interface SleepEstimateCardProps {
  sleepEstimate: SleepEstimate;
}

export function SleepEstimateCard({ sleepEstimate }: SleepEstimateCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <Card elevated>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        Sleep estimate
      </Text>
      <View style={styles.row}>
        <View>
          <Text style={[styles.label, { color: palette.mutedForeground }]}>Start</Text>
          <Text style={[styles.value, { color: palette.signalHuman }]}>{sleepEstimate.startLabel}</Text>
        </View>
        <View>
          <Text style={[styles.label, { color: palette.mutedForeground }]}>End</Text>
          <Text style={[styles.value, { color: palette.signalHuman }]}>{sleepEstimate.endLabel}</Text>
        </View>
        <View>
          <Text style={[styles.label, { color: palette.mutedForeground }]}>Duration</Text>
          <Text style={[styles.value, { color: palette.primary }]}>{sleepEstimate.durationLabel}</Text>
        </View>
      </View>
      <Text style={[styles.detail, { color: palette.textSecondary }]}>
        {sleepEstimate.detail}
      </Text>
      <Text style={[styles.meta, { color: palette.mutedForeground }]}>
        {sleepEstimate.available
          ? `Confidence ${Math.round(sleepEstimate.confidence * 100)}%`
          : 'Unavailable in this build'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.4,
    marginBottom: Spacing.lg,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  value: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.xl,
  },
  detail: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  meta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    marginTop: Spacing.md,
    textTransform: 'uppercase',
  },
});

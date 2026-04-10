import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Card } from '@/components/ui/Card';
import { Colors, Fonts, FontSizes, Spacing, type AppPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { TrendSeries } from '@/types/zentra';
import { buildChartCoordinates, buildPolylinePoints } from '@/utils/charts';

interface TrendChartCardProps {
  series: TrendSeries;
}

function getSeriesColor(series: TrendSeries, palette: AppPalette): string {
  switch (series.tone) {
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

export function TrendChartCard({ series }: TrendChartCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const stroke = getSeriesColor(series, palette);
  const coordinates = buildChartCoordinates(series.points, 280, 96);
  const polyline = buildPolylinePoints(coordinates);

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>{series.label}</Text>
      <View style={styles.metaRow}>
        <Text style={[styles.metric, { color: stroke }]}>
          {series.points.at(-1)?.value ?? 0}
          <Text style={[styles.unit, { color: palette.textSecondary }]}> {series.unit}</Text>
        </Text>
        <Text style={[styles.change, { color: palette.textSecondary }]}>
          Variability {series.variability}%
        </Text>
      </View>
      <Svg height={108} width="100%" viewBox="0 0 280 108">
        <Polyline
          fill="none"
          points={polyline}
          stroke={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
        />
        {coordinates.map((coordinate) => (
          <Circle
            key={`${coordinate.x}-${coordinate.y}`}
            cx={coordinate.x}
            cy={coordinate.y}
            fill={palette.background}
            r={4}
            stroke={stroke}
            strokeWidth={2}
          />
        ))}
      </Svg>
      <View style={styles.labelsRow}>
        <Text style={[styles.caption, { color: palette.mutedForeground }]}>
          {series.points[0]?.label}
        </Text>
        <Text style={[styles.caption, { color: palette.mutedForeground }]}>
          {series.points.at(-1)?.label}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
  },
  metaRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  metric: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes['2xl'],
  },
  unit: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.sm,
  },
  change: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  caption: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
  },
});

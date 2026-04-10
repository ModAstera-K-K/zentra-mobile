import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Colors, Fonts, FontSizes, Spacing, type AppPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ActivityHour } from '@/types/zentra';
import { EmptyState } from '@/components/zentra/EmptyState';

interface ActivityStripProps {
  hours: ActivityHour[];
}

function getBarColor(kind: ActivityHour['kind'], palette: AppPalette): string {
  switch (kind) {
    case 'movement':
      return palette.signalPhysical;
    case 'screen':
      return palette.signalCool;
    default:
      return palette.signalHuman;
  }
}

export function ActivityStrip({ hours }: ActivityStripProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  if (!hours.length) {
    return (
      <EmptyState
        body="Activity bands will render once activity recognition is enabled."
        title="No movement strip yet"
      />
    );
  }

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        Hour-by-hour activity
      </Text>
      <View style={styles.row}>
        {hours.map((hour) => (
          <View key={hour.label} style={styles.item}>
            <View
              style={[
                styles.bar,
                {
                  backgroundColor: getBarColor(hour.kind, palette),
                  height: 24 + hour.intensity,
                },
              ]}
            />
            <Text style={[styles.hourLabel, { color: palette.mutedForeground }]}>
              {hour.hour}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.3,
    marginBottom: Spacing.lg,
    textTransform: 'uppercase',
  },
  row: {
    alignItems: 'flex-end',
    columnGap: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  item: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.sm,
  },
  bar: {
    borderRadius: 999,
    minHeight: 18,
    width: '100%',
  },
  hourLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
  },
});

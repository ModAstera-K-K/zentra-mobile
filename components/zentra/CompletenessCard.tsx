import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Colors, Fonts, FontSizes, Spacing, type AppPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CollectorState } from '@/types/zentra';

interface CompletenessCardProps {
  collectors: CollectorState[];
}

function getHealthColor(health: CollectorState['health'], palette: AppPalette): string {
  switch (health) {
    case 'healthy':
      return palette.signalPhysical;
    case 'degraded':
      return palette.primary;
    default:
      return palette.mutedForeground;
  }
}

export function CompletenessCard({ collectors }: CompletenessCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        Data completeness
      </Text>
      <View style={styles.column}>
        {collectors.map((collector) => (
          <View key={collector.key} style={[styles.item, { borderBottomColor: palette.border }]}>
            <View style={styles.itemCopy}>
              <Text style={[styles.label, { color: palette.foreground }]}>{collector.label}</Text>
              <Text style={[styles.detail, { color: palette.textSecondary }]}>{collector.lastRunLabel}</Text>
            </View>
            <Text style={[styles.status, { color: getHealthColor(collector.health, palette) }]}>
              {collector.health}
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
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
  },
  column: {
    gap: Spacing.sm,
  },
  item: {
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'space-between',
    paddingBottom: Spacing.sm,
  },
  itemCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  label: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
  },
  detail: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  status: {
    alignSelf: 'flex-start',
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    flexShrink: 0,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});

import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CollectorState } from '@/types/zentra';
import { formatCollectorPermissionStatusLabel } from '@/utils/collector-permission-status';

interface CollectorToggleCardProps {
  collector: CollectorState;
  onValueChange: (value: boolean) => void;
}

export function CollectorToggleCard({ collector, onValueChange }: CollectorToggleCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: palette.foreground }]}>{collector.label}</Text>
          <Text style={[styles.description, { color: palette.textSecondary }]}>
            {collector.description}
          </Text>
        </View>
        <Switch
          onValueChange={onValueChange}
          trackColor={{ false: palette.border, true: palette.primary }}
          thumbColor={collector.enabled ? palette.primaryForeground : palette.background}
          value={collector.enabled}
        />
      </View>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: palette.mutedForeground }]}>
          {collector.permissionLabel}
        </Text>
        <Text style={[styles.meta, { color: palette.textSecondary }]}>
          {formatCollectorPermissionStatusLabel(collector)}
        </Text>
      </View>
      <Text style={[styles.source, { color: palette.mutedForeground }]}>
        {collector.sourceLabel} · {collector.lastRunLabel}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  copy: {
    flex: 1,
    gap: Spacing.xs,
    paddingRight: Spacing.md,
  },
  title: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
  },
  description: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  source: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    marginTop: Spacing.sm,
  },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CollectorState } from '@/types/zentra';
import { formatCollectorPermissionStatusLabel } from '@/utils/collector-permission-status';

interface CollectorToggleCardProps {
  actionDisabled?: boolean;
  actionHelperText?: string;
  actionLabel?: string;
  actionPendingLabel?: string;
  collector: CollectorState;
  onActionPress?: () => void;
  onValueChange: (value: boolean) => void;
}

export function CollectorToggleCard({
  actionDisabled = false,
  actionHelperText,
  actionLabel,
  actionPendingLabel = 'Working…',
  collector,
  onActionPress,
  onValueChange,
}: CollectorToggleCardProps) {
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
        <Toggle
          accessibilityLabel={`Toggle ${collector.label}`}
          onValueChange={onValueChange}
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
      {actionLabel && onActionPress ? (
        <View style={styles.actionBlock}>
          {actionHelperText ? (
            <Text style={[styles.actionHelper, { color: palette.textSecondary }]}>
              {actionHelperText}
            </Text>
          ) : null}
          <Button
            disabled={actionDisabled}
            onPress={onActionPress}
            style={styles.actionButton}
            textStyle={styles.actionButtonText}
            variant="outline"
          >
            {actionDisabled ? actionPendingLabel : actionLabel}
          </Button>
        </View>
      ) : null}
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
    flexWrap: 'wrap',
    gap: Spacing.sm,
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
  actionBlock: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionHelper: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  actionButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  actionButtonText: {
    fontSize: FontSizes.sm,
  },
});

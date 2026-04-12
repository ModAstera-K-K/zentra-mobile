import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import type { AppIconName } from '@/constants/iconography';
import {
  getCollectorIcon,
  getPermissionStatusIcon,
  getPermissionStatusIconColor,
} from '@/constants/iconography';
import { Colors, Fonts, FontSizes, IconSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CollectorState } from '@/types/zentra';
import { buildCollectorTelemetryItems } from '@/utils/collector-telemetry';
import { formatCollectorPermissionStatusLabel } from '@/utils/collector-permission-status';

interface CollectorToggleCardProps {
  actionDisabled?: boolean;
  actionHelperText?: string;
  actionIconName?: AppIconName;
  actionLabel?: string;
  actionPendingLabel?: string;
  collector: CollectorState;
  onActionPress?: () => void;
  onValueChange: (value: boolean) => void;
}

export function CollectorToggleCard({
  actionDisabled = false,
  actionHelperText,
  actionIconName,
  actionLabel,
  actionPendingLabel = 'Working…',
  collector,
  onActionPress,
  onValueChange,
}: CollectorToggleCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const telemetryItems = React.useMemo(
    () => buildCollectorTelemetryItems(collector),
    [collector],
  );

  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Ionicons
              color={palette.foreground}
              name={getCollectorIcon(collector.key)}
              size={IconSizes.compact}
            />
            <Text style={[styles.title, { color: palette.foreground }]}>{collector.label}</Text>
          </View>
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
        <View style={styles.metaItem}>
          <Ionicons
            color={palette.mutedForeground}
            name="key-outline"
            size={IconSizes.inline}
          />
          <Text style={[styles.meta, { color: palette.mutedForeground }]}>
            {collector.permissionLabel}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons
            color={getPermissionStatusIconColor(collector.permissionStatus, palette)}
            name={getPermissionStatusIcon(collector.permissionStatus)}
            size={IconSizes.inline}
          />
          <Text style={[styles.meta, { color: palette.textSecondary }]}>
            {formatCollectorPermissionStatusLabel(collector)}
          </Text>
        </View>
      </View>
      <View style={styles.sourceRow}>
        <Ionicons
          color={palette.mutedForeground}
          name="hardware-chip-outline"
          size={IconSizes.inline}
        />
        <Text style={[styles.source, { color: palette.mutedForeground }]}>
          {collector.sourceLabel}
        </Text>
        <Ionicons
          color={palette.mutedForeground}
          name="time-outline"
          size={IconSizes.inline}
        />
        <Text style={[styles.source, { color: palette.mutedForeground }]}>
          {collector.lastRunLabel}
        </Text>
      </View>
      {telemetryItems.length ? (
        <View style={styles.telemetryRow}>
          {telemetryItems.map((item) => (
            <View
              key={`${collector.key}-${item.key}`}
              style={[
                styles.telemetryItem,
                {
                  backgroundColor: palette.elevated,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={[styles.telemetryLabel, { color: palette.mutedForeground }]}>
                {item.label}
              </Text>
              <Text style={[styles.telemetryValue, { color: palette.foreground }]}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {actionLabel && onActionPress ? (
        <View style={styles.actionBlock}>
          {actionHelperText ? (
            <Text style={[styles.actionHelper, { color: palette.textSecondary }]}>
              {actionHelperText}
            </Text>
          ) : null}
          <Button
            disabled={actionDisabled}
            leadingIconName={actionIconName}
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
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
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
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
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
  },
  sourceRow: {
    alignItems: 'center',
    columnGap: Spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.sm,
  },
  telemetryItem: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    minWidth: 108,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  telemetryLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  telemetryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  telemetryValue: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.sm,
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

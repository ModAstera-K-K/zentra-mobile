import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '@/components/ui/Card';
import {
  getEventSourceIcon,
  getEventTypeIcon,
  getMetricIconColor,
} from '@/constants/iconography';
import { Colors, Fonts, FontSizes, IconSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { TodayRecentSignalRow } from '@/utils/today-visualization';

interface RecentSignalFeedProps {
  onSelectRow: (row: TodayRecentSignalRow) => void;
  rows: TodayRecentSignalRow[];
}

export function RecentSignalFeed({ onSelectRow, rows }: RecentSignalFeedProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>Recent signals</Text>
      {rows.length ? (
        <View style={styles.column}>
          {rows.map((row, index) => {
            const accent = row.tone === 'physical'
              ? palette.signalPhysical
              : row.tone === 'human'
                ? palette.signalHuman
                : row.tone === 'cool'
                  ? palette.signalCool
                  : palette.primary;

            return (
              <Pressable
                key={row.id}
                onPress={() => onSelectRow(row)}
                style={({ pressed }) => [
                  styles.row,
                  { borderTopColor: index === 0 ? 'transparent' : palette.border },
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.rowHeader}>
                  <Text style={[styles.timestamp, { color: accent }]}>{row.timestampLabel}</Text>
                  <View style={styles.sourceRow}>
                    <Ionicons
                      color={palette.textSecondary}
                      name={getEventSourceIcon(row.event.source)}
                      size={IconSizes.inline}
                    />
                    <Text numberOfLines={1} style={[styles.source, { color: palette.textSecondary }]}>
                      {row.sourceLabel}
                    </Text>
                  </View>
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.titleBlock}>
                    <Ionicons
                      color={getMetricIconColor(row.tone, palette)}
                      name={getEventTypeIcon(row.event.dataType)}
                      size={IconSizes.compact}
                    />
                    <View style={styles.copy}>
                      <Text style={[styles.title, { color: palette.foreground }]}>{row.title}</Text>
                      <Text style={[styles.detail, { color: palette.textSecondary }]}>{row.detail}</Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={[styles.value, { color: accent }]}>{row.value}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={[styles.empty, { color: palette.textSecondary }]}>
          Waiting for the first stored event. As collectors write rows locally, they will appear here with source and timestamp context.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: Spacing.xs,
  },
  copy: {
    flex: 1,
    gap: Spacing.xs,
    minWidth: 0,
  },
  detail: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  empty: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 22,
  },
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.3,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
  },
  row: {
    borderTopWidth: 1,
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  rowBody: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'space-between',
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowPressed: {
    opacity: 0.92,
  },
  source: {
    flexShrink: 1,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.1,
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  sourceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: Spacing.xs,
    marginLeft: Spacing.md,
    minWidth: 0,
  },
  timestamp: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
  },
  titleBlock: {
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    minWidth: 0,
  },
  value: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.sm,
    maxWidth: '34%',
    textAlign: 'right',
  },
});

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Card } from "@/components/ui/Card";
import {
  getEventSourceIcon,
  getEventTypeIcon,
  getMetricIconColor,
} from "@/constants/iconography";
import {
  Colors,
  Fonts,
  FontSizes,
  IconSizes,
  Spacing,
} from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { TodayRecentSignalRow } from "@/utils/today-visualization";

interface RecentSignalFeedProps {
  onSelectRow: (row: TodayRecentSignalRow) => void;
  rows: TodayRecentSignalRow[];
}

export const RecentSignalFeed = React.memo(function RecentSignalFeed({
  onSelectRow,
  rows,
}: RecentSignalFeedProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const PAGE_SIZE = 3;

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleRows = rows.slice(0, visibleCount);
  const hasMoreRows = visibleCount < rows.length;

  React.useEffect(() => {
    setVisibleCount((current) => {
      if (!rows.length) {
        return PAGE_SIZE;
      }
      return Math.max(PAGE_SIZE, Math.min(current, rows.length));
    });
  }, [rows]);

  const handleViewMore = React.useCallback(() => {
    setVisibleCount((current) => Math.min(current + PAGE_SIZE, rows.length));
  }, [rows.length]);

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        Recent signals
      </Text>
      {rows.length ? (
        <View style={styles.column}>
          {visibleRows.map((row, index) => {
            const accent =
              row.tone === "physical"
                ? palette.signalPhysical
                : row.tone === "human"
                  ? palette.signalHuman
                  : row.tone === "cool"
                    ? palette.signalCool
                    : palette.primary;

            return (
              <Pressable
                key={row.id}
                onPress={() => onSelectRow(row)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderTopColor:
                      index === 0 ? "transparent" : palette.border,
                  },
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.rowHeader}>
                  <Text style={[styles.timestamp, { color: accent }]}>
                    {row.timestampLabel}
                  </Text>
                  <View style={styles.sourceRow}>
                    <Ionicons
                      color={palette.textSecondary}
                      name={getEventSourceIcon(row.event.source)}
                      size={IconSizes.inline}
                    />
                    <Text
                      numberOfLines={1}
                      style={[styles.source, { color: palette.textSecondary }]}
                    >
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
                      <Text
                        style={[styles.title, { color: palette.foreground }]}
                      >
                        {row.title}
                      </Text>
                      <Text
                        style={[
                          styles.detail,
                          { color: palette.textSecondary },
                        ]}
                      >
                        {row.detail}
                      </Text>
                    </View>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[styles.value, { color: accent }]}
                  >
                    {row.value}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {hasMoreRows ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleViewMore}
              style={({ pressed }) => [
                styles.viewMoreButton,
                pressed && styles.viewMoreButtonPressed,
              ]}
            >
              <Text style={[styles.viewMoreText, { color: palette.foreground }]}>
                View {Math.min(3, rows.length - visibleCount)} more
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.empty, { color: palette.textSecondary }]}>
          Waiting for the first stored event. As collectors write rows locally,
          they will appear here with source and timestamp context.
        </Text>
      )}
    </Card>
  );
});

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
    textTransform: "uppercase",
  },
  row: {
    borderTopWidth: 1,
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  rowBody: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: Spacing.md,
    justifyContent: "space-between",
  },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowPressed: {
    opacity: 0.92,
  },
  source: {
    flexShrink: 1,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.1,
    textAlign: "right",
    textTransform: "uppercase",
  },
  sourceRow: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: Spacing.xs,
    marginLeft: Spacing.md,
    minWidth: 0,
  },
  timestamp: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
  },
  titleBlock: {
    alignItems: "flex-start",
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    minWidth: 0,
  },
  value: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.sm,
    maxWidth: "34%",
    textAlign: "right",
  },
  viewMoreButton: {
    alignSelf: "flex-start",
    marginTop: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  viewMoreButtonPressed: {
    opacity: 0.9,
  },
  viewMoreText: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.sm,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
});

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { Colors, Fonts, FontSizes, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { HeatmapCell } from "@/types/zentra";
import { EmptyState } from "@/components/zentra/EmptyState";

interface HeatmapCardProps {
  cells: HeatmapCell[];
}

function getGroupedCells(cells: HeatmapCell[]): Record<string, HeatmapCell[]> {
  return cells.reduce<Record<string, HeatmapCell[]>>((result, cell) => {
    result[cell.dayLabel] = [...(result[cell.dayLabel] ?? []), cell];
    return result;
  }, {});
}

export function HeatmapCard({ cells }: HeatmapCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  if (!cells.length) {
    return (
      <EmptyState
        body="Keep the Activity collector on for a few days. Your pattern will start to take shape."
        iconName="grid-outline"
        title="Pattern still forming"
      />
    );
  }

  const grouped = getGroupedCells(cells);

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        Your activity pattern
      </Text>
      <View style={styles.grid}>
        {Object.entries(grouped).map(([dayLabel, dayCells]) => (
          <View key={dayLabel} style={styles.row}>
            <Text style={[styles.dayLabel, { color: palette.mutedForeground }]}>
              {dayLabel}
            </Text>
            <View style={styles.cellRow}>
              {dayCells.map((cell) => (
                <View
                  key={`${cell.dayLabel}-${cell.hourLabel}`}
                  style={[
                    styles.cell,
                    {
                      backgroundColor:
                        colorScheme === "light"
                          ? `rgba(47, 74, 58, ${0.12 + cell.value / 140})`
                          : `rgba(69, 123, 117, ${0.14 + cell.value / 140})`,
                      borderColor: palette.border,
                    },
                  ]}
                />
              ))}
            </View>
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
    letterSpacing: 1.2,
    marginBottom: Spacing.lg,
    textTransform: "uppercase",
  },
  grid: {
    gap: Spacing.sm,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  dayLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    width: 28,
  },
  cellRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: Spacing.xs,
  },
  cell: {
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
  },
});

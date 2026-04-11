import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { EmptyState } from "@/components/zentra/EmptyState";
import { Card } from "@/components/ui/Card";
import {
  BorderRadius,
  Colors,
  Fonts,
  FontSizes,
  Spacing,
} from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { ActivityPatternCell } from "@/types/zentra";
import { hexToRgba } from "@/utils/colors";

interface ActivityPatternCardProps {
  cells: ActivityPatternCell[];
  onSelectCell: (cell: ActivityPatternCell) => void;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getIntensityColor(
  colorScheme: "light" | "dark",
  dominantKind: ActivityPatternCell["dominantKind"],
  intensity: number,
  palette: (typeof Colors)["light"],
): string {
  const alpha = 0.16 + (intensity / 100) * 0.7;
  const base =
    dominantKind === "movement"
      ? palette.signalPhysical
      : dominantKind === "screen"
        ? palette.signalCool
        : palette.signalHuman;

  return colorScheme === "light"
    ? hexToRgba(base, Math.min(alpha, 0.82))
    : hexToRgba(base, Math.min(alpha + 0.04, 0.88));
}

function PatternCell({
  cell,
  size,
  onPress,
}: {
  cell: ActivityPatternCell;
  size: number;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  if (cell.placeholder) {
    return (
      <View
        style={[
          styles.patternCell,
          {
            backgroundColor: "transparent",
            borderColor: palette.border,
            borderStyle: "dashed",
            opacity: 0.35,
            width: size,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.patternLabel, { color: palette.mutedForeground }]}
        >
          {cell.label}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.patternCell,
        {
          backgroundColor: getIntensityColor(
            colorScheme,
            cell.dominantKind,
            cell.intensity,
            palette,
          ),
          borderColor: palette.border,
          width: size,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.patternLabel,
          {
            color: cell.hasAnyData ? palette.foreground : palette.textSecondary,
          },
        ]}
      >
        {cell.label}
      </Text>
    </Pressable>
  );
}

export function ActivityPatternCard({
  cells,
  onSelectCell,
}: ActivityPatternCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const { width } = useWindowDimensions();
  const totalGap = Spacing.sm * 6;
  const availableWidth = width - Spacing.lg * 2 - Spacing.xl * 2;
  const cellSize = Math.max(32, Math.floor((availableWidth - totalGap) / 7));

  if (!cells.length) {
    return (
      <EmptyState
        body="Keep your collectors on for a bit longer. The activity pattern needs stored signals before it can take shape."
        iconName="grid-outline"
        title="Pattern still forming"
      />
    );
  }

  if (!cells.some((cell) => cell.hasAnyData)) {
    return (
      <EmptyState
        body="Keep collecting for a few days and the rolling 4-week grid will start to form."
        iconName="calendar-outline"
        title="No monthly pattern yet"
      />
    );
  }

  return (
    <Card>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
          Activity pattern
        </Text>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((day) => (
          <Text
            key={day}
            style={[
              styles.weekdayLabel,
              { color: palette.mutedForeground, width: cellSize },
            ]}
          >
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.monthGrid}>
        {cells.map((cell) => (
          <PatternCell
            key={cell.id}
            cell={cell}
            onPress={() => onSelectCell(cell)}
            size={cellSize}
          />
        ))}
      </View>

      <Text style={[styles.footer, { color: palette.textSecondary }]}>
        Tap any square to inspect the selected day.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  description: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  footer: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginTop: Spacing.lg,
  },
  header: {
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  patternCell: {
    alignItems: "flex-start",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    justifyContent: "flex-end",
    minHeight: 64,
    padding: Spacing.sm,
  },
  patternLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.sm,
    letterSpacing: 0.4,
  },
  weekdayLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 0.6,
    textAlign: "center",
    textTransform: "uppercase",
  },
  weekdayRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
});

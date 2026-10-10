import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { EmptyState } from "@/components/zentra/EmptyState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { InlineStatusProps } from "@/components/ui/InlineStatus";
import { SectionHeading } from "@/components/ui/SectionHeading";
import {
  Colors,
  Fonts,
  FontSizes,
  Spacing,
} from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { ActivityPatternCell } from "@/types/zentra";
import { patternIntensityColor } from "@/utils/pattern-presentation";

interface ActivityPatternCardProps {
  cells: ActivityPatternCell[];
  normalizationLabel?: string;
  onSelectCell: (cell: ActivityPatternCell) => void;
  /** Shown in the heading in place of "4 weeks". */
  status?: InlineStatusProps | null;
  /** Draw the grid's outline with nothing in it while the pattern loads. */
  pending?: boolean;
  /** Shown inside that outline when the pattern could not be loaded. */
  failure?: { message: string; onRetry: () => void } | null;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Four weeks, the size of the grid once it has loaded.
const OUTLINE_CELLS = Array.from({ length: 28 }, (_, index) => index);

const PatternCell = React.memo(function PatternCell({
  cell,
  size,
  onSelectCell,
}: {
  cell: ActivityPatternCell;
  size: number;
  onSelectCell: (cell: ActivityPatternCell) => void;
}) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const handlePress = React.useCallback(() => {
    onSelectCell(cell);
  }, [cell, onSelectCell]);

  if (cell.placeholder) {
    return (
      <View
        style={[
          styles.patternCell,
          {
            backgroundColor: "transparent",
            borderColor: palette.border,
            borderStyle: "dashed",
            height: size,
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
      accessibilityRole="button"
      accessibilityLabel={`${cell.detailLabel}, ${cell.hasAnyData ? `relative intensity ${Math.round(cell.intensity)} out of 100` : "No records"}`}
      accessibilityHint="Opens the selected day"
      onPress={handlePress}
      style={[
        styles.patternCell,
        {
          backgroundColor: cell.hasAnyData ? patternIntensityColor(colorScheme, cell.intensity, palette) : "transparent",
          borderColor: palette.border,
          borderStyle: cell.hasAnyData ? "solid" : "dashed",
          height: size,
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
});

export const ActivityPatternCard = React.memo(function ActivityPatternCard({
  cells,
  normalizationLabel,
  onSelectCell,
  status,
  pending = false,
  failure,
}: ActivityPatternCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const { width } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = React.useState(0);
  const availableWidth = measuredWidth || width - Spacing.lg * 2;
  const cellSize = Math.max(24, Math.floor((availableWidth - 6 * 6) / 7));
  // The outline has the loaded grid's size, so nothing below it moves when
  // the pattern arrives.
  const outline = pending || !!failure;

  // Nothing is known about the pattern yet, so the empty states do not apply.
  if (!outline && !cells.length) {
    return (
      <EmptyState
        body="Keep your collectors on for a bit longer. The activity pattern needs stored signals before it can take shape."
        iconName="grid-outline"
        title="Pattern still forming"
      />
    );
  }

  if (!outline && !cells.some((cell) => cell.hasAnyData)) {
    return (
      <EmptyState
        body="Keep collecting for a few days and the rolling 4-week grid will start to form."
        iconName="calendar-outline"
        title="No monthly pattern yet"
      />
    );
  }

  return (
    <Card variant="open">
      <SectionHeading title="Activity pattern" meta="4 weeks" status={status} />

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

      <View style={styles.monthGrid} onLayout={event => setMeasuredWidth(event.nativeEvent.layout.width)}>
        {outline
          ? OUTLINE_CELLS.map((cell) => (
              <View
                key={cell}
                style={[
                  styles.patternCell,
                  styles.outlineCell,
                  {
                    backgroundColor: palette.elevated,
                    height: cellSize,
                    opacity: failure ? 0.4 : 1,
                    width: cellSize,
                  },
                ]}
              />
            ))
          : cells.map((cell) => (
              <PatternCell
                key={cell.id}
                cell={cell}
                onSelectCell={onSelectCell}
                size={cellSize}
              />
            ))}
        {failure ? (
          <View accessibilityLiveRegion="polite" style={styles.failure}>
            <Text style={[styles.failureText, { color: palette.foreground }]}>
              {failure.message}
            </Text>
            <Button onPress={failure.onRetry} variant="outline">
              Try again
            </Button>
          </View>
        ) : null}
      </View>

      <View style={[styles.key, outline && styles.waiting]}>
        <Text style={[styles.keyText, { color: palette.textSecondary }]}>Low</Text>
        {[0, 33, 67, 100].map(intensity => <View key={intensity} style={[styles.keySwatch, { backgroundColor: patternIntensityColor(colorScheme, intensity, palette) }]} />)}
        <Text style={[styles.keyText, { color: palette.textSecondary }]}>High</Text>
        <View style={[styles.keySwatch, { borderColor: palette.border, borderWidth: 1, borderStyle: "dashed", marginLeft: Spacing.sm }]} />
        <Text style={[styles.keyText, { color: palette.textSecondary }]}>No records</Text>
      </View>

      <Text style={[styles.footer, { color: palette.textSecondary }, outline && styles.waiting]}>
        {normalizationLabel
          ? `Intensity is normalized against your ${normalizationLabel}. Tap any square to inspect the selected day.`
          : "Tap any square to inspect the selected day."}
      </Text>
    </Card>
  );
});

const styles = StyleSheet.create({
  key: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: Spacing.md },
  keyText: { fontFamily: Fonts.body, fontSize: 11 },
  keySwatch: { width: 12, height: 12, borderRadius: 3 },
  waiting: { opacity: 0.4 },
  outlineCell: { borderWidth: 0 },
  failure: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    gap: Spacing.md,
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  failureText: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    textAlign: "center",
  },


  footer: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginTop: Spacing.lg,
  },

  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  patternCell: {
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 2,
  },
  patternLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    letterSpacing: 0,
  },
  weekdayLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
    textAlign: "center",
  },
  weekdayRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: Spacing.sm,
  },
});

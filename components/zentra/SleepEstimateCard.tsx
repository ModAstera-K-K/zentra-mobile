import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { Colors, Fonts, FontSizes, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { SleepEstimate } from "@/types/zentra";

interface SleepEstimateCardProps {
  sleepEstimate: SleepEstimate;
}

export const SleepEstimateCard = React.memo(function SleepEstimateCard({
  sleepEstimate,
}: SleepEstimateCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <Card elevated>
      <View style={styles.eyebrowRow}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
          Last night's rest
        </Text>
        {sleepEstimate.available ? (
          <View
            style={[
              styles.sourceBadge,
              {
                backgroundColor: sleepEstimate.isImported
                  ? palette.signalHuman + "18"
                  : palette.mutedForeground + "14",
                borderColor: sleepEstimate.isImported
                  ? palette.signalHuman + "30"
                  : palette.border,
              },
            ]}
          >
            <Text
              style={[
                styles.sourceLabel,
                {
                  color: sleepEstimate.isImported
                    ? palette.signalHuman
                    : palette.mutedForeground,
                },
              ]}
            >
              {sleepEstimate.isImported ? "Imported" : "Inferred"}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.row}>
        <View>
          <Text style={[styles.label, { color: palette.mutedForeground }]}>
            Start
          </Text>
          <Text style={[styles.value, { color: palette.signalHuman }]}>
            {sleepEstimate.startLabel}
          </Text>
        </View>
        <View>
          <Text style={[styles.label, { color: palette.mutedForeground }]}>
            End
          </Text>
          <Text style={[styles.value, { color: palette.signalHuman }]}>
            {sleepEstimate.endLabel}
          </Text>
        </View>
        <View>
          <Text style={[styles.label, { color: palette.mutedForeground }]}>
            Duration
          </Text>
          <Text style={[styles.value, { color: palette.primary }]}>
            {sleepEstimate.durationLabel}
          </Text>
        </View>
      </View>
      <Text style={[styles.detail, { color: palette.textSecondary }]}>
        {sleepEstimate.detail}
      </Text>
      <Text style={[styles.meta, { color: palette.mutedForeground }]}>
        {sleepEstimate.available
          ? `${Math.round(sleepEstimate.confidence * 100)}% confident · ${sleepEstimate.sourceLabel}`
          : "Unavailable in this build"}
      </Text>
    </Card>
  );
});

const styles = StyleSheet.create({
  eyebrowRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  sourceBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  sourceLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
  },
  value: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.xl,
  },
  detail: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  meta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    marginTop: Spacing.md,
    textTransform: "uppercase",
  },
});

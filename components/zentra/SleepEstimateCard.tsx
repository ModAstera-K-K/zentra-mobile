import React from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { RestAdjustmentControl } from "@/components/zentra/RestAdjustmentControl";
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
  const { fontScale } = useWindowDimensions();

  return (
    <Card>
      <View style={styles.eyebrowRow}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
          {sleepEstimate.isImported
            ? "Last night's sleep"
            : "Last night's estimated rest"}
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
              {sleepEstimate.isImported ? "Imported" : sleepEstimate.isAdjusted ? "Adjusted" : "Estimated"}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.row, fontScale >= 1.5 && styles.stacked]}>
        <View style={styles.stat}>
          <Text style={[styles.label, { color: palette.mutedForeground }]}>
            Start
          </Text>
          <Text style={[styles.value, { color: palette.signalHuman }]}>
            {sleepEstimate.startLabel}
          </Text>
        </View>
        <View style={[styles.stat, fontScale < 1.5 && styles.divided, { borderLeftColor: palette.divider }]}>
          <Text style={[styles.label, { color: palette.mutedForeground }]}>
            End
          </Text>
          <Text style={[styles.value, { color: palette.signalHuman }]}>
            {sleepEstimate.endLabel}
          </Text>
        </View>
        <View style={[styles.stat, fontScale < 1.5 && styles.divided, { borderLeftColor: palette.divider }]}>
          <Text style={[styles.label, { color: palette.mutedForeground }]}>
            {sleepEstimate.isImported || sleepEstimate.isAdjusted ? "Duration" : "Supported rest"}
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
          ? sleepEstimate.isImported
            ? sleepEstimate.sourceLabel
            : sleepEstimate.qualityLabel ?? `Estimated · ${sleepEstimate.sourceLabel}`
          : sleepEstimate.qualityLabel ?? "Insufficient evidence"}
      </Text>
      {sleepEstimate.coverageDetail ? <Text style={[styles.meta, { color: palette.mutedForeground }]}>{sleepEstimate.coverageDetail}</Text> : null}
      <RestAdjustmentControl estimate={sleepEstimate} />
    </Card>
  );
});

const styles = StyleSheet.create({
  stat: { flex: 1, minWidth: 0, gap: 4 },
  divided: { borderLeftWidth: 1, paddingLeft: Spacing.sm },
  stacked: { flexDirection: "column", gap: Spacing.lg },
  eyebrowRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    flex: 1,
    paddingRight: Spacing.sm,
    fontFamily: Fonts.bodyMedium,
    fontSize: 20,
    letterSpacing: 0,
  },
  sourceBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  sourceLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  label: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    marginBottom: Spacing.xs,
  },
  value: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 18,
  },
  detail: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  meta: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
    marginTop: Spacing.md,
  },
});

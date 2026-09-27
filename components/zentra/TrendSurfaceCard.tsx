import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { MetricDetailVisual } from "@/components/zentra/MetricDetailVisual";
import { Card } from "@/components/ui/Card";
import { Colors, Fonts, FontSizes, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { TrendSurface } from "@/types/zentra";

interface TrendSurfaceCardProps {
  surface: TrendSurface;
}

export const TrendSurfaceCard = React.memo(function TrendSurfaceCard({
  surface,
}: TrendSurfaceCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <Card variant="open">
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        {surface.title}
      </Text>
      {surface.valueLabel || surface.metaLabel ? (
        <View style={styles.metaRow}>
          <Text style={[styles.metric, { color: palette.foreground }]}>
            {surface.valueLabel ?? ""}
          </Text>
          <Text style={[styles.meta, { color: palette.textSecondary }]}>
            {surface.metaLabel ?? ""}
          </Text>
        </View>
      ) : null}
      <MetricDetailVisual tone={surface.tone} visual={surface.visual} />
      <Text style={[styles.summary, { color: palette.foreground }]}>
        {surface.summary}
      </Text>
      {surface.coverageLabel ? (
        <Text
          style={[styles.coverageLabel, { color: palette.mutedForeground }]}
        >
          {surface.coverageLabel}
        </Text>
      ) : null}
      {surface.sourceLabel ? (
        <Text style={[styles.sourceLabel, { color: palette.mutedForeground }]}>
          {surface.sourceLabel}
        </Text>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  coverageLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 18,
    marginTop: Spacing.sm,
  },
  eyebrow: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 20,
    letterSpacing: 0,
    marginBottom: Spacing.md,
  },
  meta: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
  metaRow: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  metric: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.xl,
  },
  sourceLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
    marginTop: Spacing.xs,
  },
  summary: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.base,
    lineHeight: 22,
    marginTop: Spacing.md,
  },
});

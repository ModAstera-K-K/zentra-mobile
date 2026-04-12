import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Card } from "@/components/ui/Card";
import {
  getMetricIcon,
  getMetricIconColor,
  isMetricIconKey,
} from "@/constants/iconography";
import {
  Colors,
  Fonts,
  FontSizes,
  IconSizes,
  Spacing,
  type AppPalette,
} from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { DashboardMetric } from "@/types/zentra";

interface MetricCardProps {
  metric: DashboardMetric;
  onPress?: (metric: DashboardMetric) => void;
}

function getToneColor(metric: DashboardMetric, palette: AppPalette): string {
  switch (metric.tone) {
    case "physical":
      return palette.signalPhysical;
    case "human":
      return palette.signalHuman;
    case "cool":
      return palette.signalCool;
    default:
      return palette.primary;
  }
}

export const MetricCard = React.memo(function MetricCard({
  metric,
  onPress,
}: MetricCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const accent = getToneColor(metric, palette);
  const iconColor = getMetricIconColor(metric.tone, palette);
  const iconName = isMetricIconKey(metric.key)
    ? getMetricIcon(metric.key)
    : "ellipse-outline";
  const handlePress = React.useCallback(
    () => onPress?.(metric),
    [metric, onPress],
  );

  return (
    <Card onPress={handlePress} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Ionicons
            color={iconColor}
            name={iconName}
            size={IconSizes.compact}
          />
          <Text style={[styles.label, { color: palette.textSecondary }]}>
            {metric.label}
          </Text>
        </View>
        <View style={[styles.accent, { backgroundColor: accent }]} />
      </View>
      <Text style={[styles.value, { color: accent }]}>{metric.value}</Text>
      <View style={[styles.rule, { backgroundColor: palette.border }]} />
      <Text style={[styles.detail, { color: palette.textSecondary }]}>
        {metric.detail}
      </Text>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    height: "100%",
    gap: Spacing.sm,
    paddingBottom: Spacing["2xl"],
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: Spacing.sm,
    minWidth: 0,
  },
  accent: {
    borderRadius: 999,
    height: 8,
    opacity: 0.55,
    width: 8,
  },
  label: {
    flexShrink: 1,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  value: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes["2xl"],
    marginTop: Spacing.xs,
  },
  rule: {
    height: 1,
    marginVertical: Spacing.sm,
  },
  detail: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginTop: "auto",
  },
});

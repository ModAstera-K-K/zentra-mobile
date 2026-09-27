import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Card } from "@/components/ui/Card";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { DashboardMetric } from "@/types/zentra";
import { metricQuality, metricReadout, metricToneColor } from "@/utils/metric-card-presentation";

interface MetricCardProps {
  metric: DashboardMetric;
  onPress?: (metric: DashboardMetric) => void;
}

export const MetricCard = React.memo(function MetricCard({ metric, onPress }: MetricCardProps) {
  const palette = Colors[useColorScheme()];
  const accent = metricToneColor(metric.tone, palette);
  const readout = metricReadout(metric);
  const quality = metricQuality(metric);
  const handlePress = React.useCallback(() => onPress?.(metric), [metric, onPress]);

  return (
    <Card
      accessibilityLabel={`${metric.label}: ${readout.value}${readout.unit ? ` ${readout.unit}` : ""}${quality ? `, ${quality}` : ""}`}
      accessibilityHint="Opens details, sources and coverage"
      onPress={onPress ? handlePress : undefined}
      style={styles.card}
      testID={`metric-${metric.key}`}
    >
      <Text style={[styles.label, { color: palette.foreground }]}>{metric.label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, !metric.available && styles.unavailable, { color: accent }]}>{readout.value}</Text>
        {readout.unit ? <Text style={[styles.unit, { color: palette.textSecondary }]}>{readout.unit}</Text> : null}
        {quality ? (
          <Text style={[styles.quality, { color: palette.textSecondary }, quality === "Partial" && { backgroundColor: palette.qualityBackground, color: palette.qualityForeground }]}>{quality}</Text>
        ) : null}
      </View>
      <Text style={[styles.detail, { color: palette.textSecondary }]}>{metric.detail}</Text>
      {onPress ? (
        <View style={styles.action} accessible={false}>
          <Text style={[styles.actionLabel, { color: palette.foreground }]}>View details</Text>
          <Ionicons accessible={false} color={palette.textSecondary} name="chevron-forward" size={16} />
        </View>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, gap: 10, padding: 14, minHeight: 188 },
  label: { fontFamily: Fonts.bodyMedium, fontWeight: "500", fontSize: 14, lineHeight: 20 },
  valueRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: Spacing.xs },
  value: { fontFamily: Fonts.body, fontSize: 30, fontVariant: ["tabular-nums"], letterSpacing: -0.6, flexShrink: 1 },
  unavailable: { fontSize: 18, letterSpacing: 0 },
  unit: { fontFamily: Fonts.body, fontSize: 12 },
  quality: { fontFamily: Fonts.body, fontSize: 11, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, alignSelf: "center" },
  detail: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18 },
  action: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Spacing.sm, paddingTop: 6, marginTop: "auto" },
  actionLabel: { fontFamily: Fonts.bodyMedium, fontWeight: "500", fontSize: 12, lineHeight: 18 },
});

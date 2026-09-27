import React from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Colors, Fonts, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { TodaySummaryMetric } from "@/utils/today-visualization";
import { metricReadout, metricToneColor } from "@/utils/metric-card-presentation";

export const SignalSummaryRow = React.memo(function SignalSummaryRow({ metric, onSelectMetric, first, last }: {
  metric: TodaySummaryMetric; onSelectMetric?: (metric: TodaySummaryMetric) => void; first: boolean; last: boolean;
}) {
  const palette = Colors[useColorScheme()];
  const { fontScale, width } = useWindowDimensions();
  const [focused, setFocused] = React.useState(false);
  const readout = metricReadout(metric);
  const handlePress = React.useCallback(() => onSelectMetric?.(metric), [metric, onSelectMetric]);
  return (
    <Pressable
      accessibilityRole={onSelectMetric ? "button" : undefined}
      accessibilityLabel={`${metric.label}: ${metric.value}. ${metric.detail}`}
      accessibilityHint={onSelectMetric ? "Opens details, sources and coverage" : undefined}
      onPress={onSelectMetric ? handlePress : undefined}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      testID={`summary-${metric.key}`}
      style={({ pressed }) => [styles.row, first && styles.first, last && styles.last,
        pressed && onSelectMetric && { backgroundColor: palette.pressed },
        focused && { outlineColor: palette.signalPhysical, outlineWidth: 2, outlineOffset: 2 }]}
    >
      {!first ? <View style={[styles.divider, { backgroundColor: palette.divider }]} /> : null}
      <View style={styles.content}>
        <View style={[styles.headline, (fontScale >= 1.5 || width < 360) && styles.stacked]}>
          <Text style={[styles.label, { color: palette.foreground }]}>{metric.label}</Text>
          <Text style={[styles.value, { color: metricToneColor(metric.tone, palette) }]}>{readout.value}{readout.unit ? <Text style={[styles.unit, { color: palette.textSecondary }]}> {readout.unit}</Text> : null}</Text>
        </View>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>{metric.detail}</Text>
      </View>
      {onSelectMetric ? <Ionicons accessible={false} color={palette.textSecondary} name="chevron-forward" size={18} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", padding: Spacing.lg, gap: Spacing.md, minHeight: 84 },
  first: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  last: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  divider: { position: "absolute", height: 1, top: 0, left: Spacing.lg, right: Spacing.lg },
  content: { flex: 1, minWidth: 0, gap: 7 },
  headline: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: Spacing.md },
  stacked: { flexDirection: "column", alignItems: "flex-start", gap: Spacing.xs },
  label: { fontFamily: Fonts.bodyMedium, fontWeight: "500", fontSize: 14, lineHeight: 20, flexShrink: 1 },
  value: { fontFamily: Fonts.body, fontSize: 20, fontVariant: ["tabular-nums"], flexShrink: 1 },
  unit: { fontFamily: Fonts.body, fontSize: 12 },
  detail: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18 },
});

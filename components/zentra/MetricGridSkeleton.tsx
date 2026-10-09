import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { BorderRadius, Colors, Layout, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { metricColumnCount } from "@/utils/metric-card-presentation";

const PLACEHOLDER_TILES = [0, 1, 2, 3];

/**
 * Stands in for the metric tiles while the day's records load. It uses the
 * tiles' own grid, so nothing moves when they arrive.
 */
export function MetricGridSkeleton() {
  const palette = Colors[useColorScheme()];
  const { width, fontScale } = useWindowDimensions();
  const columns = metricColumnCount(width, fontScale);
  const bar = { backgroundColor: palette.elevated };
  return (
    <View
      accessibilityLabel="Loading today's signals"
      accessibilityRole="progressbar"
      style={styles.section}
    >
      <SectionHeading subtitle="Loading today's signals…" title="Your metrics" />
      <View style={styles.grid}>
        {PLACEHOLDER_TILES.map((tile) => (
          <View
            key={tile}
            style={[styles.cell, columns === 1 && styles.fullWidth]}
          >
            <Card style={styles.tile}>
              <View style={[styles.bar, styles.label, bar]} />
              <View style={[styles.bar, styles.value, bar]} />
              <View style={[styles.bar, styles.detail, bar]} />
            </Card>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Layout.sectionGap },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    alignItems: "stretch",
  },
  cell: { width: "48.5%" },
  fullWidth: { width: "100%" },
  tile: { minHeight: 132 },
  bar: { borderRadius: BorderRadius.sm, height: 12 },
  label: { width: "45%" },
  value: { height: 26, marginVertical: Spacing.md, width: "60%" },
  detail: { width: "80%" },
});

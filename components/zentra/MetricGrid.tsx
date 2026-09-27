import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { SectionHeading } from "@/components/ui/SectionHeading";
import { MetricCard } from "@/components/zentra/MetricCard";
import { Layout } from "@/constants/theme";
import type { DashboardMetric } from "@/types/zentra";
import { metricColumnCount } from "@/utils/metric-card-presentation";

export const MetricGrid = React.memo(function MetricGrid({ metrics, onPress }: {
  metrics: DashboardMetric[];
  onPress: (metric: DashboardMetric) => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const columns = metricColumnCount(width, fontScale);
  return (
    <View style={styles.section}>
      <SectionHeading title="Your metrics" subtitle="Explore details, sources and coverage" />
      <View style={styles.grid}>
        {metrics.map((metric) => (
          <View key={metric.key} style={[styles.cell, columns === 1 && styles.fullWidth]}>
            <MetricCard metric={metric} onPress={onPress} />
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { marginBottom: Layout.sectionGap },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10, alignItems: "stretch" },
  cell: { width: "48.5%" },
  fullWidth: { width: "100%" },
});

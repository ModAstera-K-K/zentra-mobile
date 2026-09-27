import React from "react";
import { StyleSheet, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SignalSummaryRow } from "@/components/zentra/SignalSummaryRow";
import type { TodaySummaryMetric } from "@/utils/today-visualization";

interface SignalSummaryCardProps {
  metrics: TodaySummaryMetric[];
  onSelectMetric?: (metric: TodaySummaryMetric) => void;
}

export const SignalSummaryCard = React.memo(function SignalSummaryCard({ metrics, onSelectMetric }: SignalSummaryCardProps) {
  return (
    <View>
      <SectionHeading title="Signal summary" subtitle="Explore details, sources and coverage" />
      <Card style={styles.group}>
        {metrics.map((metric, index) => <SignalSummaryRow key={metric.key} metric={metric} onSelectMetric={onSelectMetric} first={index === 0} last={index === metrics.length - 1} />)}
      </Card>
    </View>
  );
});

const styles = StyleSheet.create({ group: { padding: 0 } });

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import {
  Colors,
  Fonts,
  FontSizes,
  Spacing,
  type AppPalette,
} from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { CollectorState } from "@/types/zentra";

interface CompletenessCardProps {
  collectors: CollectorState[];
  summary?: {
    coverageLabel: string;
    detail: string;
    valueLabel: string;
  };
}

function getHealthColor(
  health: CollectorState["health"],
  palette: AppPalette,
): string {
  switch (health) {
    case "healthy":
      return palette.signalPhysical;
    case "degraded":
      return palette.primary;
    default:
      return palette.mutedForeground;
  }
}

function formatHealthLabel(health: CollectorState["health"]): string {
  switch (health) {
    case "healthy":
      return "flowing";
    case "degraded":
      return "disrupted";
    default:
      return health;
  }
}

export function CompletenessCard({
  collectors,
  summary,
}: CompletenessCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        Signal health
      </Text>
      {summary ? (
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: palette.elevated, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.summaryValue, { color: palette.primary }]}>
            {summary.valueLabel}
          </Text>
          <Text style={[styles.summaryCoverage, { color: palette.foreground }]}>
            {summary.coverageLabel}
          </Text>
          <Text
            style={[styles.summaryDetail, { color: palette.textSecondary }]}
          >
            {summary.detail}
          </Text>
        </View>
      ) : null}
      <View style={styles.column}>
        {collectors.map((collector) => (
          <View
            key={collector.key}
            style={[styles.item, { borderBottomColor: palette.border }]}
          >
            <View style={styles.itemCopy}>
              <Text style={[styles.label, { color: palette.foreground }]}>
                {collector.label}
              </Text>
              <Text style={[styles.detail, { color: palette.textSecondary }]}>
                {collector.lastRunLabel}
              </Text>
            </View>
            <Text
              style={[
                styles.status,
                { color: getHealthColor(collector.health, palette) },
              ]}
            >
              {formatHealthLabel(collector.health)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.3,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
  },
  column: {
    gap: Spacing.sm,
  },
  item: {
    alignItems: "flex-start",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "space-between",
    paddingBottom: Spacing.sm,
  },
  itemCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  label: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
  },
  detail: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  status: {
    alignSelf: "flex-start",
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    flexShrink: 0,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  summaryCoverage: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
  },
  summaryDetail: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  summaryValue: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.xl,
  },
});

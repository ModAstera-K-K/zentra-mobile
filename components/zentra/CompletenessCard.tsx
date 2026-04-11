import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Card } from "@/components/ui/Card";
import {
  getCollectorHealthIcon,
  getCollectorHealthIconColor,
  getCollectorIcon,
  getMetricIcon,
} from "@/constants/iconography";
import {
  Colors,
  Fonts,
  FontSizes,
  IconSizes,
  Spacing,
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
          <View style={styles.summaryHeader}>
            <Ionicons
              color={palette.primary}
              name={getMetricIcon("dataCompleteness")}
              size={IconSizes.compact}
            />
            <Text style={[styles.summaryValue, { color: palette.primary }]}>
              {summary.valueLabel}
            </Text>
          </View>
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
              <View style={styles.labelRow}>
                <Ionicons
                  color={palette.foreground}
                  name={getCollectorIcon(collector.key)}
                  size={IconSizes.compact}
                />
                <Text style={[styles.label, { color: palette.foreground }]}>
                  {collector.label}
                </Text>
              </View>
              <Text style={[styles.detail, { color: palette.textSecondary }]}>
                {collector.lastRunLabel}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Ionicons
                color={getCollectorHealthIconColor(collector.health, palette)}
                name={getCollectorHealthIcon(collector.health)}
                size={IconSizes.inline}
              />
              <Text
                style={[
                  styles.status,
                  {
                    color: getCollectorHealthIconColor(
                      collector.health,
                      palette,
                    ),
                  },
                ]}
              >
                {formatHealthLabel(collector.health)}
              </Text>
            </View>
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
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
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
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    flexShrink: 0,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  statusRow: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: Spacing.xs,
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
  summaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
});

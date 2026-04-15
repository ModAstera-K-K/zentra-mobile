import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Card } from "@/components/ui/Card";
import {
  Colors,
  Fonts,
  FontSizes,
  IconSizes,
  Spacing,
} from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface BackgroundStatusCardProps {
  backgroundTaskRegistrationCheckedAt: string | null;
  backgroundTaskRegistrationMessage: string | null;
  backgroundTaskRegistrationStatus: string | null;
  bufferedActivityQueueDepth: number;
  lastBackgroundTaskFailureAt: string | null;
  lastBackgroundTaskFailureMessage: string | null;
  lastBackgroundTaskSuccessAt: string | null;
  lastReconcileRunAt: string | null;
}

function formatTimestamp(timestamp: string | null): string {
  return timestamp ? new Date(timestamp).toLocaleString() : "Not yet";
}

export const BackgroundStatusCard = React.memo(function BackgroundStatusCard({
  backgroundTaskRegistrationCheckedAt,
  backgroundTaskRegistrationMessage,
  backgroundTaskRegistrationStatus,
  bufferedActivityQueueDepth,
  lastBackgroundTaskFailureAt,
  lastBackgroundTaskFailureMessage,
  lastBackgroundTaskSuccessAt,
  lastReconcileRunAt,
}: BackgroundStatusCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const hasFailure = Boolean(lastBackgroundTaskFailureAt);

  return (
    <Card elevated>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        Background status
      </Text>
      <View
        style={[
          styles.summary,
          {
            backgroundColor: palette.card,
            borderColor: palette.border,
          },
        ]}
      >
        <View style={styles.summaryHeader}>
          <Ionicons
            color={hasFailure ? palette.destructive : palette.success}
            name={hasFailure ? "alert-circle-outline" : "sync-outline"}
            size={IconSizes.primary}
          />
          <Text
            style={[
              styles.summaryTitle,
              { color: hasFailure ? palette.destructive : palette.foreground },
            ]}
          >
            {hasFailure ? "Attention needed" : "Reconcile healthy"}
          </Text>
        </View>
        <Text style={[styles.summaryDetail, { color: palette.textSecondary }]}>
          Last reconcile run {formatTimestamp(lastReconcileRunAt)}
        </Text>
        <Text style={[styles.summaryDetail, { color: palette.textSecondary }]}>
          Last background success {formatTimestamp(lastBackgroundTaskSuccessAt)}
        </Text>
        {hasFailure ? (
          <Text style={[styles.summaryDetail, { color: palette.destructive }]}>
            Last background failure{" "}
            {formatTimestamp(lastBackgroundTaskFailureAt)}
          </Text>
        ) : null}
      </View>

      <View style={styles.factsColumn}>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            Queue
          </Text>
          <Text style={[styles.factValue, { color: palette.foreground }]}>
            {bufferedActivityQueueDepth} buffered activity event
            {bufferedActivityQueueDepth === 1 ? "" : "s"}
          </Text>
        </View>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            Last run
          </Text>
          <Text style={[styles.factValue, { color: palette.foreground }]}>
            {formatTimestamp(lastReconcileRunAt)}
          </Text>
        </View>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            Last success
          </Text>
          <Text style={[styles.factValue, { color: palette.foreground }]}>
            {formatTimestamp(lastBackgroundTaskSuccessAt)}
          </Text>
        </View>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            Task status
          </Text>
          <View style={styles.failureCopy}>
            <Text style={[styles.factValue, { color: palette.foreground }]}>
              {backgroundTaskRegistrationStatus ?? "Not checked"}
            </Text>
            <Text
              style={[styles.failureMessage, { color: palette.textSecondary }]}
            >
              Checked {formatTimestamp(backgroundTaskRegistrationCheckedAt)}
            </Text>
            {backgroundTaskRegistrationMessage ? (
              <Text
                style={[
                  styles.failureMessage,
                  { color: palette.textSecondary },
                ]}
              >
                {backgroundTaskRegistrationMessage}
              </Text>
            ) : null}
          </View>
        </View>
        {lastBackgroundTaskFailureAt ? (
          <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
            <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
              Failure
            </Text>
            <View style={styles.failureCopy}>
              <Text style={[styles.factValue, { color: palette.destructive }]}>
                {formatTimestamp(lastBackgroundTaskFailureAt)}
              </Text>
              {lastBackgroundTaskFailureMessage ? (
                <Text
                  style={[
                    styles.failureMessage,
                    { color: palette.textSecondary },
                  ]}
                >
                  {lastBackgroundTaskFailureMessage}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.3,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
  },
  factLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  factRow: {
    borderBottomWidth: 1,
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  factValue: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  factsColumn: {
    gap: Spacing.sm,
  },
  failureCopy: {
    gap: 2,
  },
  failureMessage: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  summary: {
    borderRadius: 18,
    borderWidth: 1,
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  summaryDetail: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  summaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  summaryTitle: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
  },
});

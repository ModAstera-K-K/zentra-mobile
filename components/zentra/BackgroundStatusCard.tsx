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
import type { ReconcileOutcome, ReconcileTrigger } from "@/types/zentra";

interface BackgroundStatusCardProps {
  backgroundTaskRegistrationCheckedAt: string | null;
  backgroundTaskRegistrationMessage: string | null;
  backgroundTaskRegistrationStatus: string | null;
  bufferedActivityQueueDepth: number;
  lastBackgroundTaskFailureAt: string | null;
  lastBackgroundTaskFailureMessage: string | null;
  lastBackgroundReconcileAt: string | null;
  lastBackgroundTaskSuccessAt: string | null;
  lastForegroundResumeReconcileAt: string | null;
  lastHealthSyncWindowEndAt: string | null;
  lastNativeIngestionCount: number | null;
  lastReconcileBoundedReason: string | null;
  lastReconcileDurationMs: number | null;
  lastReconcileFailureMessage: string | null;
  lastReconcileFinishedAt: string | null;
  lastReconcileOutcome: ReconcileOutcome | null;
  lastReconcileRunAt: string | null;
  lastReconcileStartedAt: string | null;
  lastReconcileTrigger: ReconcileTrigger | null;
}

function formatTimestamp(timestamp: string | null): string {
  return timestamp ? new Date(timestamp).toLocaleString() : "Not yet";
}

function formatDuration(durationMs: number | null): string {
  return durationMs != null ? `${Math.round(durationMs)} ms` : "Not yet";
}

function formatOutcome(
  outcome: ReconcileOutcome | null,
  boundedReason: string | null,
): string {
  if (!outcome) {
    return "Not yet";
  }

  if (outcome !== "bounded" || !boundedReason) {
    return outcome;
  }

  return `${outcome} (${boundedReason})`;
}

export const BackgroundStatusCard = React.memo(function BackgroundStatusCard({
  backgroundTaskRegistrationCheckedAt,
  backgroundTaskRegistrationMessage,
  backgroundTaskRegistrationStatus,
  bufferedActivityQueueDepth,
  lastBackgroundTaskFailureAt,
  lastBackgroundTaskFailureMessage,
  lastBackgroundReconcileAt,
  lastBackgroundTaskSuccessAt,
  lastForegroundResumeReconcileAt,
  lastHealthSyncWindowEndAt,
  lastNativeIngestionCount,
  lastReconcileBoundedReason,
  lastReconcileDurationMs,
  lastReconcileFailureMessage,
  lastReconcileFinishedAt,
  lastReconcileOutcome,
  lastReconcileRunAt,
  lastReconcileStartedAt,
  lastReconcileTrigger,
}: BackgroundStatusCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const hasFailure = Boolean(
    lastBackgroundTaskFailureAt || lastReconcileOutcome === "failure",
  );
  const failureTimestamp =
    lastBackgroundTaskFailureAt ?? lastReconcileFinishedAt;
  const failureMessage =
    lastBackgroundTaskFailureMessage ?? lastReconcileFailureMessage;

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
        <Text style={[styles.summaryDetail, { color: palette.textSecondary }]}>
          Last outcome{" "}
          {formatOutcome(lastReconcileOutcome, lastReconcileBoundedReason)}
        </Text>
        {hasFailure ? (
          <Text style={[styles.summaryDetail, { color: palette.destructive }]}>
            Last failure {formatTimestamp(failureTimestamp)}
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
            Background run
          </Text>
          <Text style={[styles.factValue, { color: palette.foreground }]}>
            {formatTimestamp(lastBackgroundReconcileAt)}
          </Text>
        </View>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            Resume run
          </Text>
          <Text style={[styles.factValue, { color: palette.foreground }]}>
            {formatTimestamp(lastForegroundResumeReconcileAt)}
          </Text>
        </View>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            Native drain
          </Text>
          <Text style={[styles.factValue, { color: palette.foreground }]}>
            {lastNativeIngestionCount != null
              ? `${lastNativeIngestionCount} event${lastNativeIngestionCount === 1 ? "" : "s"}`
              : "Not yet"}
          </Text>
        </View>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            Health sync
          </Text>
          <Text style={[styles.factValue, { color: palette.foreground }]}>
            {formatTimestamp(lastHealthSyncWindowEndAt)}
          </Text>
        </View>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            Trigger
          </Text>
          <Text style={[styles.factValue, { color: palette.foreground }]}>
            {lastReconcileTrigger ?? "Not yet"}
          </Text>
        </View>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            Outcome
          </Text>
          <Text style={[styles.factValue, { color: palette.foreground }]}>
            {formatOutcome(lastReconcileOutcome, lastReconcileBoundedReason)}
          </Text>
        </View>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            Started
          </Text>
          <Text style={[styles.factValue, { color: palette.foreground }]}>
            {formatTimestamp(lastReconcileStartedAt)}
          </Text>
        </View>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            Finished
          </Text>
          <Text style={[styles.factValue, { color: palette.foreground }]}>
            {formatTimestamp(lastReconcileFinishedAt)}
          </Text>
        </View>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            Duration
          </Text>
          <Text style={[styles.factValue, { color: palette.foreground }]}>
            {formatDuration(lastReconcileDurationMs)}
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
        {hasFailure ? (
          <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
            <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
              Failure
            </Text>
            <View style={styles.failureCopy}>
              <Text style={[styles.factValue, { color: palette.destructive }]}>
                {formatTimestamp(failureTimestamp)}
              </Text>
              {failureMessage ? (
                <Text
                  style={[
                    styles.failureMessage,
                    {
                      color:
                        lastBackgroundTaskFailureAt ||
                        lastReconcileOutcome === "failure"
                          ? palette.destructive
                          : palette.textSecondary,
                    },
                  ]}
                >
                  {failureMessage}
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

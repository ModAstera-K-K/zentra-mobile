import { ActivityHistoryStatus } from "@/components/zentra/ActivityHistoryStatus";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
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
  backgroundCollectionServiceCheckedAt: string | null;
  backgroundCollectionServiceState: string | null;
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
  backgroundCollectionServiceCheckedAt,
  backgroundCollectionServiceState,
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
  const [showDetails, setShowDetails] = React.useState(false);
  const hasFailure = Boolean(
    lastBackgroundTaskFailureAt || lastReconcileOutcome === "failure",
  );
  const failureTimestamp =
    lastBackgroundTaskFailureAt ?? lastReconcileFinishedAt;
  const failureMessage =
    lastBackgroundTaskFailureMessage ?? lastReconcileFailureMessage;

  return (
    <Card variant="open">
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        Background status
      </Text>
      <View
        style={[
          styles.summary,
          {
            backgroundColor: "transparent",
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

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(current => !current)} style={[styles.disclosure, { backgroundColor: palette.card }]}>
        <Text style={[styles.factValue, { color: palette.foreground }]}>Collection details</Text>
        <Ionicons accessible={false} name={showDetails ? "chevron-up" : "chevron-down"} color={palette.textSecondary} size={18} />
      </Pressable>
      {showDetails ? <View style={styles.factsColumn}>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            Service state
          </Text>
          <View style={styles.failureCopy}>
            <Text style={[styles.factValue, { color: palette.foreground }]}>
              {backgroundCollectionServiceState ?? "Not checked"}
            </Text>
            <Text
              style={[styles.failureMessage, { color: palette.textSecondary }]}
            >
              Checked {formatTimestamp(backgroundCollectionServiceCheckedAt)}
            </Text>
          </View>
        </View>
        <View style={[styles.factRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.factLabel, { color: palette.textSecondary }]}>
            {Platform.OS === "ios" ? "Activity history" : "Queue"}
          </Text>
          {Platform.OS === "ios" ? (
            <ActivityHistoryStatus
              style={[styles.factValue, { color: palette.foreground, flex: 1 }]}
            />
          ) : (
            <Text style={[styles.factValue, { color: palette.foreground }]}>
              {bufferedActivityQueueDepth} buffered activity event
              {bufferedActivityQueueDepth === 1 ? "" : "s"}
            </Text>
          )}
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
            {Platform.OS === "ios" ? "Recovery" : "Native drain"}
          </Text>
          <Text style={[styles.factValue, { color: palette.foreground }]}>
            {Platform.OS === "ios"
              ? "Core Motion history"
              : lastNativeIngestionCount != null
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
      </View> : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  disclosure: { minHeight: 48, padding: Spacing.md, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md },
  eyebrow: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 20,
    letterSpacing: 0,
    marginBottom: Spacing.md,
  },
  factLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
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
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    padding: 0,
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

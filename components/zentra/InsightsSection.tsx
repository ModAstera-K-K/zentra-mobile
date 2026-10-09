import { loadInsightEvidence } from "@/utils/insight-evidence";
import type { TodayDetailPayload } from "@/utils/today-visualization";
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useRepositoryStore, useAppStore } from "@/stores";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { RELEASE_FLAGS } from "@/constants/release-flags";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { loadPersonalInsights } from "@/utils/insight-repository";
import { insightSummary, insightDetail } from "@/utils/insight-presentation";
import { DetailSheet } from "@/components/zentra/DetailSheet";
import type { PersonalInsight } from "@/types/insights";

export function InsightsSection({ limit = 4 }: { limit?: number }) {
  const palette = Colors[useColorScheme()];
  const focused = useIsFocused();
  const mode = useAppStore((s) => s.dataMode);
  const revision = useRepositoryStore((s) => s.todayDataUpdatedAt);
  const sync = useRepositoryStore((s) => s.lastHealthSyncWindowEndAt);
  const [insights, setInsights] = React.useState<PersonalInsight[]>([]);
  const [updating, setUpdating] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [selected, setSelected] = React.useState<PersonalInsight | null>(null);
  const [evidence, setEvidence] = React.useState<TodayDetailPayload | null>(
    null,
  );
  React.useEffect(() => {
    setEvidence(null);
    if (!selected || !focused) return;
    let cancelled = false;
    void loadInsightEvidence(selected)
      .then((value) => {
        if (!cancelled) setEvidence(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected, focused]);
  const [retry, setRetry] = React.useState(0);
  const anchor = useRepositoryStore((s) => s.todayDate);
  React.useEffect(() => {
    if (
      !focused ||
      !revision ||
      mode === "demo" ||
      !RELEASE_FLAGS.personalInsights
    )
      return;
    let cancelled = false;
    setUpdating(true);
    setError(false);
    void loadPersonalInsights(anchor, `${revision}:${sync}`)
      .then((value) => {
        if (!cancelled) setInsights(value);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setUpdating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [focused, revision, sync, mode, anchor, retry]);
  if (!RELEASE_FLAGS.personalInsights || mode === "demo") return null;
  const eligible = insights.filter((i) => i.eligible).slice(0, limit);
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[styles.heading, { color: palette.foreground }]}
      >
        What changed
      </Text>
      {updating && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: palette.textSecondary }}
        >
          {insights.length ? "Updating…" : "Preparing comparisons…"}
        </Text>
      )}
      {!updating && !eligible.length && !error && (
        <Text style={{ color: palette.textSecondary }}>
          Not enough comparable days. Comparisons need five matching weekday
          pairs from the same source.
        </Text>
      )}
      {error && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setRetry((n) => n + 1)}
          style={styles.row}
        >
          <Text style={{ color: palette.foreground }}>
            Couldn’t update comparisons. Retry
          </Text>
        </Pressable>
      )}
      {eligible.map((insight) => (
        <Pressable
          key={insight.metric}
          accessibilityRole="button"
          accessibilityLabel={`${insightSummary(insight)} View comparison`}
          onPress={() => setSelected(insight)}
          style={[styles.row, { borderBottomColor: palette.border }]}
        >
          <Text style={{ color: palette.foreground }}>
            {insightSummary(insight)}
          </Text>
          <Text style={{ color: palette.textSecondary }}>
            {insight.pairs}/7 comparable pairs ·{" "}
            {insight.provenance.replaceAll("_", " ")} · View comparison ›
          </Text>
        </Pressable>
      ))}
      <DetailSheet
        payload={selected ? (evidence ?? insightDetail(selected)) : null}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: Spacing.sm, marginVertical: Spacing.lg },
  heading: { fontFamily: Fonts.bodyMedium, fontSize: 20 },
  row: {
    paddingVertical: Spacing.md,
    minHeight: 48,
    gap: Spacing.sm,
    borderBottomWidth: 1,
  },
});

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
import { InlineStatus } from "@/components/ui/InlineStatus";
import type { PersonalInsight } from "@/types/insights";

// How many comparisons the last load found, shared by every place the section
// is shown, so its placeholder rows match what is about to replace them.
let lastEligibleCount: number | null = null;

export function InsightsSection({ limit = 4 }: { limit?: number }) {
  const palette = Colors[useColorScheme()];
  const focused = useIsFocused();
  const mode = useAppStore((s) => s.dataMode);
  const revision = useRepositoryStore((s) => s.todayDataUpdatedAt);
  const sync = useRepositoryStore((s) => s.lastHealthSyncWindowEndAt);
  const [insights, setInsights] = React.useState<PersonalInsight[]>([]);
  const [updating, setUpdating] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
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
        if (cancelled) return;
        lastEligibleCount = value.filter((i) => i.eligible).length;
        setInsights(value);
        setLoaded(true);
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
  // Until the first load returns, rows the size of the real ones hold the
  // section's place. A status never gets a row of its own.
  const pending = !loaded && (updating || error || (focused && !!revision));
  const placeholderRows =
    pending && lastEligibleCount !== 0
      ? Math.min(limit, lastEligibleCount ?? 2)
      : 0;
  const showNone = loaded
    ? !eligible.length
    : !pending || lastEligibleCount === 0;
  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Text
          accessibilityRole="header"
          style={[styles.heading, { color: palette.foreground }]}
        >
          What changed
        </Text>
        {error ? (
          <InlineStatus
            accessibilityLabel="Couldn’t update comparisons"
            action={{ label: "Retry", onPress: () => setRetry((n) => n + 1) }}
            label="Update failed"
          />
        ) : updating ? (
          <InlineStatus
            accessibilityLabel={
              loaded ? "Updating comparisons" : "Preparing comparisons"
            }
            busy
            label={loaded ? "Updating" : "Preparing"}
          />
        ) : null}
      </View>
      {showNone && (
        <Text style={{ color: palette.textSecondary }}>
          Not enough comparable days. Comparisons need five matching weekday
          pairs from the same source.
        </Text>
      )}
      {Array.from({ length: placeholderRows }, (_, row) => (
        <View
          key={row}
          style={[styles.row, { borderBottomColor: palette.border }]}
        >
          {[70, 88].map((width) => (
            <View key={width} style={styles.placeholderLine}>
              <Text style={styles.hidden}> </Text>
              <View
                style={[
                  styles.placeholderBar,
                  { backgroundColor: palette.elevated, width: `${width}%` },
                ]}
              />
            </View>
          ))}
        </View>
      ))}
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
  headingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "space-between",
  },
  heading: { flexShrink: 1, fontFamily: Fonts.bodyMedium, fontSize: 20 },
  // A text line of the real row's height, with a bar drawn over it.
  placeholderLine: { justifyContent: "center" },
  placeholderBar: { borderRadius: 4, height: 12, position: "absolute" },
  hidden: { opacity: 0 },
  row: {
    paddingVertical: Spacing.md,
    minHeight: 48,
    gap: Spacing.sm,
    borderBottomWidth: 1,
  },
});

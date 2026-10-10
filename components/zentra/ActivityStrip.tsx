import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { InlineStatusProps } from "@/components/ui/InlineStatus";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { DailyRhythmTrace, RHYTHM_TRACE_HEIGHT } from "@/components/zentra/DailyRhythmTrace";
import { Colors, Fonts, FontSizes, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { UnifiedTimelineBucket } from "@/types/zentra";
import { initialRhythmIndex, RHYTHM_MODES, rhythmColor, rhythmSeries } from "@/utils/daily-rhythm-presentation";

const SUBTITLE = "Relative intensity · shared 0–100 scale";
const EMPTY = "No signals recorded for today yet. Movement, screen use, and estimated rest will appear here as data becomes available.";

/** Explains a temporary scale; `busy` while the real baseline is still loading. */
export interface ActivityStripNote { busy: boolean; text: string; onRetry?: () => void }

interface ActivityStripProps {
  buckets: UnifiedTimelineBucket[];
  error?: string | null;
  note?: ActivityStripNote | null;
  onRetry?: () => void;
}

export const ActivityStrip = React.memo(function ActivityStrip({ buckets, error, note, onRetry }: ActivityStripProps) {
  const palette = Colors[useColorScheme()];
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const series = React.useMemo(() => RHYTHM_MODES.map(mode => ({ ...mode, points: rhythmSeries(buckets, mode.key) })), [buckets]);
  React.useEffect(() => { setSelectedIndex(initialRhythmIndex(buckets)); }, [buckets]);
  // Loading, empty and failed all draw the card at its loaded size, with the
  // traces as blank outlines, so the sections below it never move.
  const hasData = buckets.some(bucket => bucket.hasAnyData);
  const loading = !buckets.length && !error;
  const message = hasData || loading ? null : (error ?? EMPTY);
  const status: InlineStatusProps | null = loading
    ? { busy: true, label: "Loading" }
    : !hasData
      ? null
      : error
        ? { accessibilityLabel: `${error} Showing the last result.`, label: "Update failed", ...(onRetry ? { action: { label: "Retry", onPress: onRetry } } : {}) }
        : note
          ? { accessibilityLabel: `Provisional scale. ${note.text}`, busy: note.busy, label: "Provisional", ...(note.onRetry ? { action: { label: "Retry", onPress: note.onRetry } } : {}) }
          : null;
  const subtitle = loading ? "Loading today’s rhythm…" : hasData && !error && note ? note.text : SUBTITLE;
  const index = Math.min(selectedIndex, Math.max(0, buckets.length - 1));
  return (
    <Card variant="open">
      <SectionHeading title="Daily Rhythm" subtitle={subtitle} status={status} />
      <View style={styles.traces}>
        {hasData
          ? series.map((mode, position) => <DailyRhythmTrace key={mode.key} label={mode.label} color={rhythmColor(mode.key, palette)} points={mode.points} selectedIndex={index} onSelect={setSelectedIndex} showAxis={position === series.length - 1} />)
          : series.map((mode, position) => (
            <View key={mode.key} style={[styles.outline, message ? styles.faint : null]}>
              <Text style={[styles.outlineLabel, { color: palette.textSecondary }]}>{mode.label}</Text>
              <View style={[styles.outlineChart, { backgroundColor: palette.elevated, height: RHYTHM_TRACE_HEIGHT(position === series.length - 1) }]} />
            </View>
          ))}
        {message ? (
          <View accessibilityLiveRegion="polite" style={styles.message}>
            <Text style={[styles.messageText, { color: palette.foreground }]}>{message}</Text>
            {error && onRetry ? <Button onPress={onRetry} variant="outline">Try again</Button> : null}
          </View>
        ) : null}
      </View>
      <View style={styles.selection}>
        <Text accessibilityLiveRegion="polite" style={[styles.time, { color: palette.foreground }, !hasData && styles.waiting]}>{hasData ? buckets[index]?.label : "--:--"}</Text>
        <View style={styles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel="Inspect previous hour" accessibilityState={{ disabled: !hasData || index === 0 }} disabled={!hasData || index === 0} onPress={() => setSelectedIndex(index - 1)} style={({ pressed }) => [styles.control, { backgroundColor: pressed ? palette.pressed : palette.card }, (!hasData || index === 0) && styles.disabled]}><Ionicons accessible={false} color={palette.foreground} name="chevron-back" size={18} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Inspect next hour" accessibilityState={{ disabled: !hasData || index === buckets.length - 1 }} disabled={!hasData || index === buckets.length - 1} onPress={() => setSelectedIndex(index + 1)} style={({ pressed }) => [styles.control, { backgroundColor: pressed ? palette.pressed : palette.card }, (!hasData || index === buckets.length - 1) && styles.disabled]}><Ionicons accessible={false} color={palette.foreground} name="chevron-forward" size={18} /></Pressable>
        </View>
      </View>
      <Text style={[styles.caption, { color: palette.textSecondary }, !hasData && styles.waiting]}>Gaps mean missing records. Rest is inferred, separate from imported sleep.</Text>
    </Card>
  );
});

const styles = StyleSheet.create({
  traces: { gap: Spacing.lg },
  // Same box as a DailyRhythmTrace: its label line, then its chart.
  outline: { gap: Spacing.xs },
  outlineLabel: { fontFamily: Fonts.bodyMedium, fontWeight: "500", fontSize: 13, opacity: 0.4 },
  outlineChart: { borderRadius: 8 },
  faint: { opacity: 0.4 },
  waiting: { opacity: 0.4 },
  message: { ...StyleSheet.absoluteFillObject, alignItems: "flex-start", justifyContent: "center", gap: Spacing.md },
  messageText: { fontFamily: Fonts.body, fontSize: FontSizes.base, lineHeight: 24 },
  selection: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Spacing.md, marginTop: Spacing.sm },
  controls: { flexDirection: "row", gap: Spacing.sm },
  control: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  disabled: { opacity: 0.45 },
  time: { fontFamily: Fonts.bodyMedium, fontSize: 14, fontWeight: "500" },
  caption: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18, marginTop: Spacing.sm },
});

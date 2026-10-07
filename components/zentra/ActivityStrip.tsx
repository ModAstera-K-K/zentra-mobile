import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { DailyRhythmStatus } from "@/components/zentra/DailyRhythmStatus";
import { DailyRhythmTrace } from "@/components/zentra/DailyRhythmTrace";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { UnifiedTimelineBucket } from "@/types/zentra";
import { initialRhythmIndex, RHYTHM_MODES, rhythmColor, rhythmSeries } from "@/utils/daily-rhythm-presentation";

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
  if (!buckets.length || !buckets.some(bucket => bucket.hasAnyData)) return <DailyRhythmStatus error={error} loading={!buckets.length && !error} onRetry={onRetry} />;
  const index = Math.min(selectedIndex, buckets.length - 1);
  return (
    <Card variant="open">
      <SectionHeading title="Daily Rhythm" subtitle="Relative intensity · shared 0–100 scale" />
      {note ? (
        <View accessibilityLiveRegion="polite" accessibilityState={{ busy: note.busy }} style={styles.note}>
          {note.busy ? <ActivityIndicator color={palette.textSecondary} size="small" /> : null}
          <Text style={[styles.noteText, { color: palette.textSecondary }]}>{note.text}</Text>
          {note.onRetry ? <Button onPress={note.onRetry} variant="ghost">Try again</Button> : null}
        </View>
      ) : null}
      {error ? (
        <View accessibilityLiveRegion="polite" style={styles.note}>
          <Text style={[styles.noteText, { color: palette.textSecondary }]}>{error} Showing the last result.</Text>
          {onRetry ? <Button onPress={onRetry} variant="ghost">Try again</Button> : null}
        </View>
      ) : null}
      <View style={styles.traces}>
        {series.map((mode, position) => <DailyRhythmTrace key={mode.key} label={mode.label} color={rhythmColor(mode.key, palette)} points={mode.points} selectedIndex={index} onSelect={setSelectedIndex} showAxis={position === series.length - 1} />)}
      </View>
      <View style={styles.selection}>
        <Text accessibilityLiveRegion="polite" style={[styles.time, { color: palette.foreground }]}>{buckets[index]?.label}</Text>
        <View style={styles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel="Inspect previous hour" accessibilityState={{ disabled: index === 0 }} disabled={index === 0} onPress={() => setSelectedIndex(index - 1)} style={({ pressed }) => [styles.control, { backgroundColor: pressed ? palette.pressed : palette.card }, index === 0 && styles.disabled]}><Ionicons accessible={false} color={palette.foreground} name="chevron-back" size={18} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Inspect next hour" accessibilityState={{ disabled: index === buckets.length - 1 }} disabled={index === buckets.length - 1} onPress={() => setSelectedIndex(index + 1)} style={({ pressed }) => [styles.control, { backgroundColor: pressed ? palette.pressed : palette.card }, index === buckets.length - 1 && styles.disabled]}><Ionicons accessible={false} color={palette.foreground} name="chevron-forward" size={18} /></Pressable>
        </View>
      </View>
      <Text style={[styles.caption, { color: palette.textSecondary }]}>Gaps mean missing records. Rest is inferred, separate from imported sleep.</Text>
    </Card>
  );
});

const styles = StyleSheet.create({
  traces: { gap: Spacing.lg },
  note: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.md },
  noteText: { flex: 1, fontFamily: Fonts.body, fontSize: 12, lineHeight: 18 },
  selection: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Spacing.md, marginTop: Spacing.sm },
  controls: { flexDirection: "row", gap: Spacing.sm },
  control: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  disabled: { opacity: 0.45 },
  time: { fontFamily: Fonts.bodyMedium, fontSize: 14, fontWeight: "500" },
  caption: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18, marginTop: Spacing.sm },
});

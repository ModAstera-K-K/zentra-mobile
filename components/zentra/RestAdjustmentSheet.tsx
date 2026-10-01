import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { RestTimeField } from "@/components/zentra/RestTimeField";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useRepositoryStore } from "@/stores";
import { localRestDateTime } from "@/utils/rest-adjustment";
import { resetRestAdjustment, saveRestAdjustment } from "@/utils/rest-repository";
import type { SleepEstimate } from "@/types/zentra";

export function RestAdjustmentSheet({ estimate, onClose }: { estimate: SleepEstimate; onClose: () => void }) {
  const palette = Colors[useColorScheme()], insets = useSafeAreaInsets();
  const [start, setStart] = useState(() => localRestDateTime(estimate.startTimestamp!));
  const [end, setEnd] = useState(() => localRestDateTime(estimate.endTimestamp!));
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const commit = async (reset: boolean) => {
    if (saving || !estimate.wakeDate) return;
    setSaving(true); setError(null);
    try {
      if (reset) await resetRestAdjustment(estimate.wakeDate);
      else await saveRestAdjustment(estimate.wakeDate, start, end);
      await useRepositoryStore.getState().refreshTodayData();
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your rest window. Try again."); }
    finally { setSaving(false); }
  };
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!saving) onClose(); }}>
    <View style={[styles.overlay, { backgroundColor: palette.overlay }]}>
      <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: palette.card }]}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.foreground }]}>Adjust rest window</Text>
          <Text style={[styles.copy, { color: palette.textSecondary }]}>Use local dates and 24-hour times. Your adjustment is user-reported rest; the automatic estimate is preserved.</Text>
          <RestTimeField label="Start" value={start} onChange={setStart} disabled={saving} />
          <RestTimeField label="End" value={end} onChange={setEnd} disabled={saving} />
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.copy, { color: palette.foreground }]}>{error}</Text> : null}
          <Button disabled={saving} onPress={() => void commit(false)}>{saving ? "Saving…" : "Save adjustment"}</Button>
          {estimate.isAdjusted ? <Button variant="secondary" disabled={saving} onPress={() => void commit(true)}>Use automatic estimate</Button> : null}
          <Button variant="ghost" disabled={saving} onPress={onClose}>Cancel</Button>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "90%", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  content: { padding: Spacing.xl, gap: Spacing.md },
  title: { fontFamily: Fonts.bodyMedium, fontSize: 24 },
  copy: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
});

import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export function RestTimeField({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (value: string) => void; disabled: boolean;
}) {
  const palette = Colors[useColorScheme()];
  return <View style={styles.field}>
    <Text style={{ color: palette.textSecondary, fontFamily: Fonts.body }}>{label}</Text>
    <TextInput accessibilityLabel={`${label}, local date and time, YYYY-MM-DD HH:mm`} value={value}
      onChangeText={onChange} editable={!disabled} autoCorrect={false} autoCapitalize="none"
      placeholder="YYYY-MM-DD HH:mm" placeholderTextColor={palette.mutedForeground}
      style={[styles.input, { color: palette.foreground, borderColor: palette.border }]} />
  </View>;
}
const styles = StyleSheet.create({
  field: { gap: Spacing.sm },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 10, padding: Spacing.md, fontFamily: Fonts.body, fontSize: 16 },
});

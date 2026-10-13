import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { InlineStatus, type InlineStatusProps } from "@/components/ui/InlineStatus";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export const SectionHeading = React.memo(function SectionHeading({
  title, subtitle, meta, status,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  /** Shown in place of `meta` while the section loads, updates or has failed. */
  status?: InlineStatusProps | null;
}) {
  const palette = Colors[useColorScheme()];
  return (
    <View style={styles.heading}>
      <View style={styles.row}>
        <Text accessibilityRole="header" style={[styles.title, { color: palette.foreground }]}>{title}</Text>
        {status ? <InlineStatus {...status} /> : meta ? <Text style={[styles.meta, { color: palette.textSecondary }]}>{meta}</Text> : null}
      </View>
      {subtitle ? <Text numberOfLines={1} style={[styles.subtitle, { color: palette.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  heading: { gap: 6, marginBottom: Spacing.lg },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: Spacing.sm },
  title: { fontFamily: Fonts.bodyMedium, fontWeight: "500", fontSize: 20, lineHeight: 28, letterSpacing: -0.4, flexShrink: 1 },
  subtitle: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18 },
  meta: { fontFamily: Fonts.body, fontSize: 12 },
});

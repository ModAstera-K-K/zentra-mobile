import React from "react";
import { Text, StyleSheet } from "react-native";
import { useActiveMinutesRefresh } from "@/hooks/use-active-minutes-refresh";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, Fonts, FontSizes, Spacing } from "@/constants/theme";
export function ActiveMinutesRefreshStatus({
  enabled,
  start,
  end,
}: {
  enabled: boolean;
  start: string;
  end: string;
}) {
  const status = useActiveMinutesRefresh(enabled, { start, end });
  const palette = Colors[useColorScheme()];
  if (!enabled || (!status.updating && !status.error)) return null;
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[styles.text, { color: palette.textSecondary }]}
    >
      {status.error
        ? `Activity timing update unavailable: ${status.error}. Cached values remain partial.`
        : "Updating activity timing… Cached values remain available."}
    </Text>
  );
}
const styles = StyleSheet.create({
  text: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    marginBottom: Spacing.sm,
  },
});

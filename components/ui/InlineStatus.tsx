import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export interface InlineStatusProps {
  /** A word or two: the slot it sits in does not grow. */
  label: string;
  busy?: boolean;
  /** Makes the status tappable, e.g. `{ label: "Retry", onPress }`. */
  action?: { label: string; onPress: () => void };
  /** The full sentence for screen readers when `label` is abbreviated. */
  accessibilityLabel?: string;
}

/**
 * A status that takes a fixed 18pt of height wherever it is put, so showing or
 * hiding it never moves what is around it.
 */
export const InlineStatus = React.memo(function InlineStatus({
  label,
  busy = false,
  action,
  accessibilityLabel,
}: InlineStatusProps) {
  const palette = Colors[useColorScheme()];
  const content = (
    <>
      {busy ? (
        <View style={styles.spinnerBox}>
          <ActivityIndicator
            color={palette.textSecondary}
            size="small"
            style={styles.spinner}
          />
        </View>
      ) : null}
      <Text
        numberOfLines={1}
        style={[styles.label, { color: palette.textSecondary }]}
      >
        {label}
        {action ? (
          <Text style={{ color: palette.primary }}>{` · ${action.label}`}</Text>
        ) : null}
      </Text>
    </>
  );
  if (action)
    return (
      <Pressable
        accessibilityLabel={`${accessibilityLabel ?? label}. ${action.label}`}
        accessibilityLiveRegion="polite"
        accessibilityRole="button"
        hitSlop={15}
        onPress={action.onPress}
        style={styles.status}
      >
        {content}
      </Pressable>
    );
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion="polite"
      accessibilityState={{ busy }}
      accessible
      style={styles.status}
    >
      {content}
    </View>
  );
});

const styles = StyleSheet.create({
  status: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 6,
    height: 18,
  },
  // The platform spinner is 20pt; scaled down inside a box that fits the slot.
  spinnerBox: {
    alignItems: "center",
    height: 14,
    justifyContent: "center",
    width: 14,
  },
  spinner: { transform: [{ scale: 0.7 }] },
  label: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18 },
});

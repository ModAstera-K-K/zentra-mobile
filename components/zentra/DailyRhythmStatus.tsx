import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Colors, Fonts, FontSizes, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export const DailyRhythmStatus = React.memo(function DailyRhythmStatus({
  error,
  loading,
  onRetry,
}: {
  error?: string | null;
  loading: boolean;
  onRetry?: () => void;
}) {
  const palette = Colors[useColorScheme()];

  return (
    <Card variant="open">
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: palette.textSecondary }]}
      >
        Daily rhythm
      </Text>
      <View accessibilityState={{ busy: loading }} style={styles.content}>
        {loading ? (
          <ActivityIndicator color={palette.textSecondary} size="small" />
        ) : null}
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.body, { color: palette.textSecondary }]}
        >
          {error
            ? error
            : loading
              ? "Loading today’s rhythm…"
              : "No signals recorded for today yet. Movement, screen use, and estimated rest will appear here as data becomes available."}
        </Text>
        {error && onRetry ? (
          <Button onPress={onRetry} variant="outline">
            Try again
          </Button>
        ) : null}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  title: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
    marginBottom: Spacing.md,
  },
  content: {
    minHeight: 158,
    justifyContent: "center",
    gap: Spacing.sm,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.base,
    lineHeight: 24,
  },
});

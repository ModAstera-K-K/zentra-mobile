import React from "react";
import { StyleSheet, Text } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Colors, Fonts, FontSizes, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

/** Shown when the local database could not be opened, with a way to try again. */
export function DataUnavailableCard({
  onRetry,
}: {
  onRetry: () => Promise<void>;
}) {
  const palette = Colors[useColorScheme()];
  const [retrying, setRetrying] = React.useState(false);

  const retry = React.useCallback(() => {
    setRetrying(true);
    // A second failure comes back through the store and this card stays up.
    void onRetry()
      .catch(() => undefined)
      .finally(() => setRetrying(false));
  }, [onRetry]);

  return (
    <Card elevated>
      <Text
        accessibilityRole="alert"
        style={[styles.title, { color: palette.foreground }]}
      >
        Couldn’t open your data
      </Text>
      <Text style={[styles.body, { color: palette.textSecondary }]}>
        Zentra could not read its local database just now. Nothing has been
        deleted.
      </Text>
      <Button disabled={retrying} onPress={retry} style={styles.action}>
        {retrying ? "Trying again…" : "Try again"}
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: Fonts.display,
    fontSize: FontSizes.xl,
    marginBottom: Spacing.sm,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.base,
    lineHeight: 24,
  },
  action: { marginTop: Spacing.lg },
});

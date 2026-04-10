import React from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { PilotLight } from "@/components/zentra/PilotLight";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getBrandLogo } from "@/constants/branding";
import {
  BorderRadius,
  Colors,
  Fonts,
  FontSizes,
  Spacing,
} from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppStore } from "@/stores";

const VALUE_POINTS = [
  "Stored on your device",
  "No external tracking",
  "Full export control",
];

export default function WelcomeScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);

  async function handleEnter(): Promise<void> {
    await completeOnboarding();
    router.replace("/(app)/(tabs)/today");
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: palette.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.heroHeader}>
            <PilotLight size={12} />
            <Text style={[styles.meta, { color: palette.textSecondary }]}>
              Daylight observatory
            </Text>
          </View>

          <View style={styles.copyBlock}>
            <Image source={getBrandLogo(colorScheme)} style={styles.logo} />
            <Text style={[styles.headline, { color: palette.foreground }]}>
              Your life, clearly seen. Your data, fully yours.
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              Zentra brings together the quiet signals of your day, movement,
              rest, focus, and digital habits, into one calm, private space.
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              No noise. No hidden systems watching you. Just clarity.
            </Text>
          </View>

          <Card elevated style={styles.statementCard}>
            <Text
              style={[styles.statementTitle, { color: palette.foreground }]}
            >
              A calmer way to understand your life
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              Most tools collect your data. Zentra gives it back to you.
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              It is a quiet, intentional space, somewhere between a journal and
              an instrument, where your daily life becomes something you can
              reflect on, not just measure.
            </Text>
          </Card>

          <Card style={styles.valueCard}>
            <Text style={[styles.meta, { color: palette.textSecondary }]}>
              Built on a simple principle
            </Text>
            {VALUE_POINTS.map((point) => (
              <View
                key={point}
                style={[styles.valueRow, { borderBottomColor: palette.border }]}
              >
                <PilotLight size={8} />
                <Text style={[styles.valueText, { color: palette.foreground }]}>
                  {point}
                </Text>
              </View>
            ))}
          </Card>

          <View style={styles.footer}>
            <Button onPress={() => void handleEnter()}>Enter Zentra</Button>
            <Text
              style={[styles.footerText, { color: palette.mutedForeground }]}
            >
              Your data. Your device. Your call.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    gap: Spacing.xl,
    minHeight: "100%",
    padding: Spacing.lg,
  },
  heroHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  meta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  copyBlock: {
    gap: Spacing.md,
  },
  logo: {
    height: 84,
    resizeMode: "contain",
    width: 84,
  },
  headline: {
    fontFamily: Fonts.display,
    fontSize: 34,
    lineHeight: 38,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.base,
    lineHeight: 24,
  },
  statementCard: {
    borderRadius: BorderRadius.xl,
    gap: Spacing.md,
  },
  statementTitle: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.xl,
  },
  valueCard: {
    gap: Spacing.md,
  },
  valueRow: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  valueText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSizes.base,
    lineHeight: 22,
  },
  footer: {
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  footerText: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    textAlign: "center",
  },
});

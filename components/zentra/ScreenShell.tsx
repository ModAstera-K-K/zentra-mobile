import React from "react";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Button } from "@/components/ui/Button";
import { getBrandLogo } from "@/constants/branding";
import { Colors, Fonts, FontSizes, Layout, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface ScreenShellProps {
  children: React.ReactNode;
  scrollable?: boolean;
  settingsEnabled?: boolean;
  subtitle: string;
  subtitleAccessory?: React.ReactNode;
  title: string;
  titleAccessory?: React.ReactNode;
}

export function ScreenShell({
  children,
  scrollable = true,
  settingsEnabled = true,
  subtitle,
  subtitleAccessory,
  title,
  titleAccessory,
}: ScreenShellProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const isAndroid = Platform.OS === "android";

  const header = (
    <View style={styles.chromeRow}>
      <View style={styles.brandRow}>
        <Image source={getBrandLogo(colorScheme)} style={styles.brandLogo} />
        <Text style={[styles.brandLabel, { color: palette.foreground }]}>
          Zentra
        </Text>
      </View>

      <View style={styles.headerCopy}>
        <View style={styles.subtitleRow}>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
            {subtitle}
          </Text>
          {subtitleAccessory ?? null}
        </View>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: palette.foreground }]}>
            {title}
          </Text>
          {titleAccessory ?? null}
        </View>
      </View>

      {settingsEnabled ? (
        <Button
          accessibilityLabel="Open settings"
          onPress={() => router.push("/(app)/settings")}
          style={styles.settingsButton}
          variant="secondary"
        >
          <Ionicons
            color={palette.foreground}
            name="settings-outline"
            size={18}
          />
        </Button>
      ) : null}
    </View>
  );

  if (!scrollable) {
    return (
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={[styles.safeArea, { backgroundColor: palette.background }]}
      >
        <View
          style={[
            styles.content,
            styles.flex,
            {
              backgroundColor: palette.background,
            },
          ]}
        >
          {header}
          {children}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.safeArea, { backgroundColor: palette.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: isAndroid ? 0 : Layout.tabBarHeight + Spacing["4xl"],
          },
        ]}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: palette.background }}
      >
        {header}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Layout.screenGutter,
    paddingTop: Layout.screenGutter,
  },
  flex: {
    flex: 1,
  },
  chromeRow: {
    marginBottom: Spacing.sm,
    position: "relative",
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  brandLabel: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
  },
  brandLogo: {
    height: 26,
    resizeMode: "contain",
    width: 26,
  },
  headerCopy: {
    gap: Spacing.xs,
  },
  subtitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  titleRow: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  subtitle: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: FontSizes["3xl"],
    lineHeight: 40,
  },
  settingsButton: {
    minHeight: 42,
    minWidth: 42,
    paddingHorizontal: 0,
    position: "absolute",
    right: 0,
    top: 2,
  },
});

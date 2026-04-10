import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { PilotLight } from '@/components/zentra/PilotLight';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, FontSizes, Layout, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ScreenShellProps {
  children: React.ReactNode;
  settingsEnabled?: boolean;
  subtitle: string;
  title: string;
}

export function ScreenShell({
  children,
  settingsEnabled = true,
  subtitle,
  title,
}: ScreenShellProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const isAndroid = Platform.OS === 'android';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: palette.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: isAndroid ? 0 : Layout.tabBarHeight + Spacing['4xl'],
          },
        ]}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: palette.background }}
      >
        <View style={styles.chromeRow}>
          <View style={styles.brandRow}>
            <PilotLight size={10} />
            <View style={styles.brandCopy}>
              <Text style={[styles.brandLabel, { color: palette.foreground }]}>Zentra</Text>
              <Text style={[styles.brandMeta, { color: palette.mutedForeground }]}>Local observatory</Text>
            </View>
          </View>

          <View style={styles.headerCopy}>
            <Text style={[styles.subtitle, { color: palette.textSecondary }]}>{subtitle}</Text>
            <Text style={[styles.title, { color: palette.foreground }]}>{title}</Text>
          </View>

          {settingsEnabled ? (
            <Button
              accessibilityLabel="Open settings"
              onPress={() => router.push('/(app)/settings')}
              style={styles.settingsButton}
              variant="secondary"
            >
              <Ionicons color={palette.foreground} name="settings-outline" size={18} />
            </Button>
          ) : null}
        </View>

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
    padding: Layout.screenGutter,
  },
  chromeRow: {
    alignItems: 'flex-start',
    marginBottom: Spacing.xl,
    position: 'relative',
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  brandCopy: {
    gap: 2,
  },
  brandLabel: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
  },
  brandMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerCopy: {
    gap: Spacing.xs,
    paddingRight: Spacing['4xl'],
  },
  subtitle: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: FontSizes['3xl'],
    lineHeight: 40,
  },
  settingsButton: {
    minHeight: 42,
    minWidth: 42,
    paddingHorizontal: 0,
    position: 'absolute',
    right: 0,
    top: 2,
  },
});

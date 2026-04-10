import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Button } from '@/components/ui/Button';

interface ScreenShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  settingsEnabled?: boolean;
}

export function ScreenShell({
  title,
  subtitle,
  children,
  settingsEnabled = true,
}: ScreenShellProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: palette.background }}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
              {subtitle}
            </Text>
            <Text style={[styles.title, { color: palette.foreground }]}>
              {title}
            </Text>
          </View>
          {settingsEnabled ? (
            <Button
              accessibilityLabel="Open settings"
              onPress={() => router.push('/(app)/settings')}
              variant="secondary"
              style={styles.settingsButton}
            >
              <Ionicons name="settings-outline" size={18} color={palette.foreground} />
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
    padding: Spacing.lg,
    paddingBottom: Spacing['4xl'],
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  headerCopy: {
    flex: 1,
    gap: Spacing.xs,
    paddingRight: Spacing.lg,
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
  },
});


import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import type { AppIconName } from '@/constants/iconography';
import { Colors, Fonts, FontSizes, IconSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface EmptyStateProps {
  title: string;
  body: string;
  iconName?: AppIconName;
}

export function EmptyState({ title, body, iconName }: EmptyStateProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <Card elevated>
      {iconName ? (
        <View style={styles.titleRow}>
          <Ionicons
            color={palette.textSecondary}
            name={iconName}
            size={IconSizes.compact}
          />
          <Text style={[styles.title, { color: palette.foreground }]}>{title}</Text>
        </View>
      ) : (
        <Text style={[styles.title, { color: palette.foreground }]}>{title}</Text>
      )}
      <Text style={[styles.body, { color: palette.textSecondary }]}>{body}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: Fonts.display,
    fontSize: FontSizes.xl,
    marginBottom: Spacing.sm,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.base,
    lineHeight: 24,
  },
});

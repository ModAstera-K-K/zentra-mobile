import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface EmptyStateProps {
  title: string;
  body: string;
}

export function EmptyState({ title, body }: EmptyStateProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <Card elevated>
      <Text style={[styles.title, { color: palette.foreground }]}>{title}</Text>
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
  body: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.base,
    lineHeight: 24,
  },
});


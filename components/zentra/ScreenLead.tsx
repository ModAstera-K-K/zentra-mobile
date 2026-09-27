import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ScreenLeadProps {
  body: string;
  eyebrow: string;
  footer?: React.ReactNode;
  title: string;
  trailing?: React.ReactNode;
}

export function ScreenLead({
  body,
  eyebrow,
  footer,
  title,
  trailing,
}: ScreenLeadProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <View style={styles.wrapper}>
      <Card variant="open" style={styles.card}>
        <View style={styles.header}>
          <View style={styles.copy}>
            <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>{eyebrow}</Text>
            <Text style={[styles.title, { color: palette.foreground }]}>{title}</Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>{body}</Text>
          </View>
          {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        </View>
        {footer ? <View style={[styles.footer, { borderTopColor: palette.border }]}>{footer}</View> : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing["3xl"],
  },
  card: {
    gap: Spacing.md,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  copy: {
    flex: 1,
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },
  eyebrow: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 20,
    letterSpacing: 0,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: FontSizes.xl,
    lineHeight: 28,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 22,
  },
  trailing: {
    paddingTop: Spacing.xs,
  },
  footer: {
    borderTopWidth: 0,
    marginTop: Spacing.xs,
    paddingTop: Spacing.md,
  },
});

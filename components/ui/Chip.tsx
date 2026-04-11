import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import type { AppIconName } from '@/constants/iconography';
import { BorderRadius, Colors, Fonts, FontSizes, IconSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ChipProps {
  label: string;
  active?: boolean;
  leadingIconName?: AppIconName;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, active = false, leadingIconName, onPress, style }: ChipProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const color = active ? palette.primaryForeground : palette.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: active ? palette.primary : 'transparent',
          borderColor: active ? palette.primary : palette.border,
        },
        pressed && styles.pressed,
        style,
      ]}
    >
      {leadingIconName ? (
        <Ionicons color={color} name={leadingIconName} size={IconSizes.inline} />
      ) : null}
      <Text style={[styles.label, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.xs,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.sm,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});

import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { BorderRadius, Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, active = false, onPress, style }: ChipProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: active ? palette.primary : palette.card,
          borderColor: active ? palette.primary : palette.border,
        },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          {
            color: active ? palette.primaryForeground : palette.textSecondary,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    minHeight: 36,
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
    opacity: 0.86,
  },
});


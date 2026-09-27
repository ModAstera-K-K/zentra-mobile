import React from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface CardProps extends Pick<PressableProps, 'accessibilityLabel' | 'accessibilityHint' | 'testID'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  onPress?: () => void;
  variant?: 'surface' | 'open';
}

export function Card({ children, style, elevated = false, onPress, variant = 'surface', ...accessibility }: CardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const [focused, setFocused] = React.useState(false);
  const contentStyle = [
    styles.base,
    {
      backgroundColor: elevated ? palette.elevated : palette.card,
      borderColor: palette.border,
    },
    variant === 'open' && styles.open,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        {...accessibility}
        accessibilityRole="button"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [contentStyle, pressed && { backgroundColor: palette.pressed }, focused && { outlineColor: palette.signalPhysical, outlineWidth: 2, outlineOffset: 2 }]}
        onPress={onPress}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={contentStyle} testID={accessibility.testID}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  open: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    padding: 0,
  },
});

import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  onPress?: () => void;
}

export function Card({ children, style, elevated = false, onPress }: CardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const contentStyle = [
    styles.base,
    {
      backgroundColor: elevated ? palette.elevated : palette.card,
      borderColor: palette.border,
    },
    style,
  ];

  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [contentStyle, pressed && styles.pressed]} onPress={onPress}>
        {children}
      </Pressable>
    );
  }

  return <View style={contentStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    padding: Spacing.xl,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});

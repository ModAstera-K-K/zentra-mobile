import React from 'react';
import { Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { BorderRadius, Colors, Fonts, FontSizes, Spacing, type AppPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Button({
  children,
  variant = 'primary',
  style,
  textStyle,
  ...props
}: ButtonProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const variantStyles = getVariantStyles(variant, palette);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        variantStyles.container,
        pressed && styles.pressed,
        style,
      ]}
      {...props}
    >
      <Text style={[styles.text, variantStyles.text, textStyle]}>
        {children}
      </Text>
    </Pressable>
  );
}

function getVariantStyles(variant: ButtonVariant, palette: AppPalette): {
  container: ViewStyle;
  text: TextStyle;
} {
  switch (variant) {
    case 'secondary':
      return {
        container: {
          backgroundColor: palette.elevated,
          borderColor: palette.border,
          borderWidth: 1,
        },
        text: {
          color: palette.foreground,
        },
      };
    case 'ghost':
      return {
        container: {
          backgroundColor: 'transparent',
        },
        text: {
          color: palette.foreground,
        },
      };
    case 'outline':
      return {
        container: {
          backgroundColor: palette.halo,
          borderColor: palette.primary,
          borderWidth: 1,
        },
        text: {
          color: palette.primary,
        },
      };
    default:
      return {
        container: {
          backgroundColor: palette.primary,
        },
        text: {
          color: palette.primaryForeground,
        },
      };
  }
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: BorderRadius.pill,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  text: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
    letterSpacing: 0.2,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
});

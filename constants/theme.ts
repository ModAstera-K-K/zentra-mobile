import { DarkTheme, DefaultTheme } from '@react-navigation/native';

import { hexToRgba } from '@/utils/colors';

export interface AppPalette {
  background: string;
  card: string;
  elevated: string;
  foreground: string;
  textSecondary: string;
  mutedForeground: string;
  border: string;
  primary: string;
  primaryForeground: string;
  signalPhysical: string;
  signalHuman: string;
  signalCool: string;
  destructive: string;
  success: string;
  heroGlow: string;
  halo: string;
  overlay: string;
}

export const Colors: Record<'light' | 'dark', AppPalette> = {
  light: {
    background: '#F2EDE4',
    card: '#EBE5D8',
    elevated: '#E2DBC9',
    foreground: '#1F1B16',
    textSecondary: '#6B5F52',
    mutedForeground: '#A89B89',
    border: '#D8D1C4',
    primary: '#C9772E',
    primaryForeground: '#F2EDE4',
    signalPhysical: '#2F4A3A',
    signalHuman: '#A87B5D',
    signalCool: '#5C6F7E',
    destructive: '#9B4A35',
    success: '#2F4A3A',
    heroGlow: hexToRgba('#C9772E', 0.28),
    halo: hexToRgba('#C9772E', 0.12),
    overlay: hexToRgba('#F2EDE4', 0.78),
  },
  dark: {
    background: '#08090A',
    card: '#121417',
    elevated: '#1C1E20',
    foreground: '#EBE8E2',
    textSecondary: '#8E8478',
    mutedForeground: '#5A5550',
    border: '#24272B',
    primary: '#FFB000',
    primaryForeground: '#08090A',
    signalPhysical: '#457B75',
    signalHuman: '#8E7B74',
    signalCool: '#5C6F7E',
    destructive: '#D07052',
    success: '#457B75',
    heroGlow: hexToRgba('#FFB000', 0.38),
    halo: hexToRgba('#FFB000', 0.14),
    overlay: hexToRgba('#08090A', 0.84),
  },
};

export const NavigationThemes = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: Colors.light.primary,
      background: Colors.light.background,
      card: Colors.light.card,
      text: Colors.light.foreground,
      border: Colors.light.border,
      notification: Colors.light.primary,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: Colors.dark.primary,
      background: Colors.dark.background,
      card: Colors.dark.card,
      text: Colors.dark.foreground,
      border: Colors.dark.border,
      notification: Colors.dark.primary,
    },
  },
} as const;

export const Fonts = {
  display: 'InterLight',
  body: 'InterRegular',
  bodyMedium: 'InterMedium',
  mono: 'JetBrainsMonoRegular',
  monoMedium: 'JetBrainsMonoMedium',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

export const BorderRadius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const FontSizes = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 38,
} as const;

import { DarkTheme, DefaultTheme } from "@react-navigation/native";
import { Platform } from "react-native";

import { hexToRgba } from "@/utils/colors";

export interface AppPalette {
  background: string;
  card: string;
  elevated: string;
  foreground: string;
  textSecondary: string;
  mutedForeground: string;
  border: string;
  divider: string;
  pressed: string;
  qualityBackground: string;
  qualityForeground: string;
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

export const Colors: Record<"light" | "dark", AppPalette> = {
  light: {
    background: "#F2EDE4",
    card: "#EBE5D8",
    elevated: "#E4DDCF",
    foreground: "#24291F",
    textSecondary: "#505C4D",
    mutedForeground: "#53604F",
    border: "#CBCABE",
    divider: "#C1B8A8",
    pressed: "#DFD6C7",
    qualityBackground: "#E7D7B4",
    qualityForeground: "#66501E",
    primary: "#91451D",
    primaryForeground: "#F2EDE4",
    signalPhysical: "#2F6B59",
    signalHuman: "#78573F",
    signalCool: "#385A79",
    destructive: "#9B4A35",
    success: "#2F6B59",
    heroGlow: hexToRgba("#C9772E", 0.28),
    halo: hexToRgba("#C9772E", 0.12),
    overlay: hexToRgba("#F2EDE4", 0.78),
  },
  dark: {
    background: "#090C0D",
    card: "#13191A",
    elevated: "#1A2223",
    foreground: "#EDECE7",
    textSecondary: "#B2B9B4",
    mutedForeground: "#9BA59E",
    border: "#2B3533",
    divider: "#3B4B46",
    pressed: "#202B29",
    qualityBackground: "#332B1B",
    qualityForeground: "#EBC980",
    primary: "#FFBB39",
    primaryForeground: "#090C0D",
    signalPhysical: "#7FBBAE",
    signalHuman: "#BDA899",
    signalCool: "#93B0C8",
    destructive: "#E5A28F",
    success: "#7FBBAE",
    heroGlow: hexToRgba("#FFB000", 0.38),
    halo: hexToRgba("#FFB000", 0.14),
    overlay: hexToRgba("#08090A", 0.84),
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
  display: Platform.select({ ios: "System", android: "sans-serif-light", default: "system-ui" }),
  body: Platform.select({ ios: "System", android: "sans-serif", default: "system-ui" }),
  bodyMedium: Platform.select({ ios: "System", android: "sans-serif-medium", default: "system-ui" }),
  mono: "JetBrainsMonoRegular",
  monoMedium: "JetBrainsMonoMedium",
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
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
  "2xl": 28,
  "3xl": 38,
} as const;

export const IconSizes = {
  inline: 16,
  compact: 18,
  primary: 20,
} as const;

export const Layout = {
  screenGutter: Spacing.lg,
  sectionGap: 34,
  tabBarHeight: 64,
  tabBarOffset: 12,
} as const;

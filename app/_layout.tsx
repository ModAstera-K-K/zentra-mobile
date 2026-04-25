import { useEffect } from "react";
import { ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from "@expo-google-fonts/jetbrains-mono";
import {
  SpaceGrotesk_300Light,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
} from "@expo-google-fonts/space-grotesk";

import { NavigationThemes } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppearanceStore, useAppStore } from "@/stores";
import "@/utils/background/location-task";
import "@/utils/background/reconcile-task";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isAppearanceHydrated = useAppearanceStore((state) => state.isHydrated);
  const bootstrapAppearance = useAppearanceStore((state) => state.bootstrap);
  const isAppHydrated = useAppStore((state) => state.isHydrated);
  const bootstrapApp = useAppStore((state) => state.bootstrap);

  const [fontsLoaded] = useFonts({
    InterLight: SpaceGrotesk_300Light,
    InterRegular: SpaceGrotesk_400Regular,
    InterMedium: SpaceGrotesk_500Medium,
    JetBrainsMonoRegular: JetBrainsMono_400Regular,
    JetBrainsMonoMedium: JetBrainsMono_500Medium,
  });

  useEffect(() => {
    void bootstrapAppearance();
    void bootstrapApp();
  }, [bootstrapAppearance, bootstrapApp]);

  useEffect(() => {
    if (!fontsLoaded || !isAppearanceHydrated || !isAppHydrated) {
      return;
    }

    void SplashScreen.hideAsync();
  }, [fontsLoaded, isAppearanceHydrated, isAppHydrated]);

  if (!fontsLoaded || !isAppearanceHydrated || !isAppHydrated) {
    return null;
  }

  return (
    <ThemeProvider
      value={
        colorScheme === "dark" ? NavigationThemes.dark : NavigationThemes.light
      }
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </ThemeProvider>
  );
}

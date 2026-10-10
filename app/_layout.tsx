import { useEffect } from "react";
import { ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";

import { NavigationThemes } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppearanceStore, useAppStore, useRepositoryStore } from "@/stores";
import "@/utils/background/location-task";
import "@/utils/background/reconcile-task";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isAppearanceHydrated = useAppearanceStore((state) => state.isHydrated);
  const bootstrapAppearance = useAppearanceStore((state) => state.bootstrap);
  const isAppHydrated = useAppStore((state) => state.isHydrated);
  const bootstrapApp = useAppStore((state) => state.bootstrap);
  const bootstrapRepository = useRepositoryStore((state) => state.bootstrap);

  const [fontsLoaded] = useFonts({
    JetBrainsMonoRegular: require("@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf"),
    JetBrainsMonoMedium: require("@expo-google-fonts/jetbrains-mono/500Medium/JetBrainsMono_500Medium.ttf"),
  });

  useEffect(() => {
    void bootstrapAppearance();
    void bootstrapApp();
    // Started here so the database is opening while fonts and settings load.
    // The splash does not wait for it.
    void bootstrapRepository().catch(() => undefined);
  }, [bootstrapAppearance, bootstrapApp, bootstrapRepository]);

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

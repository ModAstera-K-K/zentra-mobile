import React from "react";
import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { Colors, IconSizes, Layout } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

function TabBarIcon({
  color,
  focused,
  name,
}: {
  color: string;
  focused: boolean;
  name: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Ionicons
      color={color}
      name={focused ? name : `${name}-outline`}
      size={IconSizes.primary}
    />
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const isAndroid = Platform.OS === "android";

  return (
    <Tabs
      screenOptions={{
        lazy: true,
        freezeOnBlur: true,
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarActiveBackgroundColor: "transparent",
        tabBarInactiveTintColor: palette.mutedForeground,
        sceneStyle: {
          backgroundColor: palette.background,
        },
        tabBarStyle: {
          backgroundColor: palette.card,
          borderColor: palette.border,
          borderRadius: 0,
          borderTopColor: palette.border,
          borderTopWidth: 1,
          bottom: 0,
          elevation: 0,
          height: isAndroid ? 84 : Layout.tabBarHeight,
          left: 0,
          paddingBottom: 10,
          paddingHorizontal: 0,
          paddingTop: 10,
          position: "relative",
          right: 0,
        },
        tabBarItemStyle: {
          borderRadius: 0,
          marginHorizontal: 0,
        },
        tabBarLabelStyle: {
          fontFamily: "JetBrainsMonoRegular",
          fontSize: 11,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        },
        tabBarIconStyle: {
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "Today",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon color={color} focused={focused} name="sunny" />
          ),
        }}
      />
      <Tabs.Screen
        name="trends"
        options={{
          title: "Trends",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon color={color} focused={focused} name="analytics" />
          ),
        }}
      />
      <Tabs.Screen
        name="export"
        options={{
          title: "Export",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon color={color} focused={focused} name="download" />
          ),
        }}
      />
    </Tabs>
  );
}

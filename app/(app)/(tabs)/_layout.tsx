import React from 'react';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { BorderRadius, Colors, Layout } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

function TabBarIcon({
  color,
  name,
}: {
  color: string;
  name: keyof typeof Ionicons.glyphMap;
}) {
  return <Ionicons color={color} name={name} size={20} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const isAndroid = Platform.OS === 'android';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarActiveBackgroundColor: isAndroid ? 'transparent' : palette.halo,
        tabBarInactiveTintColor: palette.mutedForeground,
        sceneStyle: {
          backgroundColor: palette.background,
        },
        tabBarStyle: {
          backgroundColor: isAndroid ? palette.card : palette.elevated,
          borderColor: palette.border,
          borderRadius: isAndroid ? 0 : BorderRadius.xl,
          borderTopColor: palette.border,
          borderTopWidth: 1,
          bottom: isAndroid ? 0 : Layout.tabBarOffset,
          elevation: 0,
          height: isAndroid ? 84 : Layout.tabBarHeight,
          left: isAndroid ? 0 : Layout.tabBarOffset,
          paddingBottom: 10,
          paddingHorizontal: isAndroid ? 0 : 8,
          paddingTop: 10,
          position: isAndroid ? 'relative' : 'absolute',
          right: isAndroid ? 0 : Layout.tabBarOffset,
        },
        tabBarItemStyle: {
          borderRadius: isAndroid ? 0 : BorderRadius.lg,
          marginHorizontal: isAndroid ? 0 : 2,
        },
        tabBarLabelStyle: {
          fontFamily: 'JetBrainsMonoRegular',
          fontSize: 11,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        },
        tabBarIconStyle: {
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <TabBarIcon color={color} name="sunny-outline" />,
        }}
      />
      <Tabs.Screen
        name="trends"
        options={{
          title: 'Trends',
          tabBarIcon: ({ color }) => <TabBarIcon color={color} name="analytics-outline" />,
        }}
      />
      <Tabs.Screen
        name="export"
        options={{
          title: 'Export',
          tabBarIcon: ({ color }) => <TabBarIcon color={color} name="download-outline" />,
        }}
      />
    </Tabs>
  );
}

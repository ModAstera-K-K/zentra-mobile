import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { Colors } from '@/constants/theme';
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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.mutedForeground,
        tabBarStyle: {
          backgroundColor: palette.card,
          borderTopColor: palette.border,
          height: 84,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontFamily: 'JetBrainsMonoRegular',
          fontSize: 11,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
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


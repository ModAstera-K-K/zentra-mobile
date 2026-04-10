import { Stack } from 'expo-router';

import { SignalBootstrap } from '@/components/zentra/SignalBootstrap';

export default function AppLayout() {
  return (
    <>
      <SignalBootstrap />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="settings"
          options={{
            presentation: 'card',
          }}
        />
      </Stack>
    </>
  );
}

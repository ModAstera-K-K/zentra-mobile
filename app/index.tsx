import { Redirect } from 'expo-router';

import { useAppStore } from '@/stores';

export default function Index() {
  const hasCompletedOnboarding = useAppStore((state) => state.hasCompletedOnboarding);

  if (!hasCompletedOnboarding) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return <Redirect href="/(app)/(tabs)/today" />;
}


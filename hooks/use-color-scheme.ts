import { useColorScheme as useNativeColorScheme } from 'react-native';

import { useAppearanceStore } from '@/stores';
import { isSunriseThemeLight } from '@/utils/dates';

export function useColorScheme(): 'light' | 'dark' {
  const systemColorScheme = useNativeColorScheme();
  const themePreference = useAppearanceStore((state) => state.themePreference);

  if (themePreference === 'light' || themePreference === 'dark') {
    return themePreference;
  }

  if (themePreference === 'sunrise') {
    return isSunriseThemeLight(new Date()) ? 'light' : 'dark';
  }

  return systemColorScheme ?? 'light';
}

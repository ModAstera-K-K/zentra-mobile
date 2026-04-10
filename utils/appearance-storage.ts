import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ThemePreference } from '@/types/zentra';

const THEME_PREFERENCE_KEY = 'zentra-theme-preference';
const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark', 'sunrise'];

export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const value = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);

    if (value && THEME_PREFERENCES.includes(value as ThemePreference)) {
      return value as ThemePreference;
    }
  } catch (error) {
    console.warn('Failed to load theme preference:', error);
  }

  return 'system';
}

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  try {
    if (preference === 'system') {
      await AsyncStorage.removeItem(THEME_PREFERENCE_KEY);
      return;
    }

    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
  } catch (error) {
    console.warn('Failed to save theme preference:', error);
  }
}


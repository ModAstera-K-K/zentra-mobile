import { create } from 'zustand';

import type { ThemePreference } from '@/types/zentra';
import { loadThemePreference, saveThemePreference } from '@/utils/appearance-storage';

interface AppearanceState {
  isHydrated: boolean;
  themePreference: ThemePreference;
  bootstrap: () => Promise<void>;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
}

let bootstrapPromise: Promise<void> | null = null;

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  isHydrated: false,
  themePreference: 'system',

  bootstrap: async () => {
    if (get().isHydrated) {
      return;
    }

    if (bootstrapPromise) {
      await bootstrapPromise;
      return;
    }

    bootstrapPromise = (async () => {
      const themePreference = await loadThemePreference();
      set({
        isHydrated: true,
        themePreference,
      });
    })().finally(() => {
      bootstrapPromise = null;
    });

    await bootstrapPromise;
  },

  setThemePreference: async (themePreference) => {
    set({ themePreference });
    await saveThemePreference(themePreference);
  },
}));


import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CollectorKey, CollectorState, DataMode, SignalStoreState } from '@/types/zentra';

const APP_STATE_KEY = 'zentra-app-state';
const SIGNAL_STATE_KEY = 'zentra-signal-state';

export interface PersistedAppState {
  hasCompletedOnboarding: boolean;
  lastExportedAt: string | null;
  dataMode: DataMode;
  collectors: Record<CollectorKey, CollectorState>;
}

export async function loadPersistedAppState(): Promise<PersistedAppState | null> {
  try {
    const raw = await AsyncStorage.getItem(APP_STATE_KEY);
    return raw ? (JSON.parse(raw) as PersistedAppState) : null;
  } catch (error) {
    console.warn('Failed to load app state:', error);
    return null;
  }
}

export async function savePersistedAppState(state: PersistedAppState): Promise<void> {
  try {
    await AsyncStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save app state:', error);
  }
}

export async function loadPersistedSignalState(): Promise<SignalStoreState | null> {
  try {
    const raw = await AsyncStorage.getItem(SIGNAL_STATE_KEY);
    return raw ? (JSON.parse(raw) as SignalStoreState) : null;
  } catch (error) {
    console.warn('Failed to load signal state:', error);
    return null;
  }
}

export async function savePersistedSignalState(state: SignalStoreState): Promise<void> {
  try {
    await AsyncStorage.setItem(SIGNAL_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save signal state:', error);
  }
}

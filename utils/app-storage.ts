import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  ActivityNormalizationWindow,
  CollectorKey,
  CollectorState,
  DataMode,
  LocationRetentionPreference,
  ReconcileOutcome,
  ReconcileTrigger,
  SignalStoreState,
} from "@/types/zentra";

const APP_STATE_KEY = "zentra-app-state";
const REPOSITORY_META_KEY = "zentra-repository-meta";
const SIGNAL_STATE_KEY = "zentra-signal-state";

export interface PersistedAppState {
  activityNormalizationWindow: ActivityNormalizationWindow;
  hasCompletedOnboarding: boolean;
  hasSeenLocationBackgroundPermissionRationale: boolean;
  lastExportedAt: string | null;
  dataMode: DataMode;
  locationRetentionPreference: LocationRetentionPreference;
  collectors: Record<CollectorKey, CollectorState>;
}

export interface PersistedRepositoryMeta {
  backgroundTaskRegistrationCheckedAt: string | null;
  backgroundTaskRegistrationMessage: string | null;
  backgroundTaskRegistrationStatus: string | null;
  bufferedActivityQueueDepth: number;
  lastBufferedActivityCursor: number | null;
  lastBackgroundReconcileAt: string | null;
  lastBackgroundTaskFailureAt: string | null;
  lastBackgroundTaskFailureMessage: string | null;
  lastBackgroundTaskSuccessAt: string | null;
  lastForegroundResumeReconcileAt: string | null;
  lastHealthSyncWindowEndAt: string | null;
  lastNativeIngestionCount: number | null;
  lastNativeDrainAt: string | null;
  lastReconcileBoundedReason: string | null;
  lastReconcileDurationMs: number | null;
  lastReconcileFailureMessage: string | null;
  lastReconcileFinishedAt: string | null;
  lastReconcileOutcome: ReconcileOutcome | null;
  lastReconcileRunAt: string | null;
  lastReconcileStartedAt: string | null;
  lastReconcileTrigger: ReconcileTrigger | null;
}

export async function loadPersistedAppState(): Promise<PersistedAppState | null> {
  try {
    const raw = await AsyncStorage.getItem(APP_STATE_KEY);
    return raw ? (JSON.parse(raw) as PersistedAppState) : null;
  } catch (error) {
    console.warn("Failed to load app state:", error);
    return null;
  }
}

export async function savePersistedAppState(
  state: PersistedAppState,
): Promise<void> {
  try {
    await AsyncStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Failed to save app state:", error);
  }
}

export async function loadPersistedRepositoryMeta(): Promise<PersistedRepositoryMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(REPOSITORY_META_KEY);
    return raw ? (JSON.parse(raw) as PersistedRepositoryMeta) : null;
  } catch (error) {
    console.warn("Failed to load repository meta:", error);
    return null;
  }
}

export async function savePersistedRepositoryMeta(
  state: PersistedRepositoryMeta,
): Promise<void> {
  try {
    await AsyncStorage.setItem(REPOSITORY_META_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Failed to save repository meta:", error);
  }
}

export async function loadPersistedSignalState(): Promise<SignalStoreState | null> {
  try {
    const raw = await AsyncStorage.getItem(SIGNAL_STATE_KEY);
    return raw ? (JSON.parse(raw) as SignalStoreState) : null;
  } catch (error) {
    console.warn("Failed to load signal state:", error);
    return null;
  }
}

export async function savePersistedSignalState(
  state: SignalStoreState,
): Promise<void> {
  try {
    await AsyncStorage.setItem(SIGNAL_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Failed to save signal state:", error);
  }
}

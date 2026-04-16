import React from "react";
import {
  Alert,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Constants from "expo-constants";

import { CollectorToggleCard } from "@/components/zentra/CollectorToggleCard";
import { ScreenLead } from "@/components/zentra/ScreenLead";
import { ScreenShell } from "@/components/zentra/ScreenShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import {
  getActionIcon,
  getDataModeIcon,
  getThemePreferenceIcon,
} from "@/constants/iconography";
import { Colors, Fonts, FontSizes, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  useAppearanceStore,
  useAppStore,
  useRepositoryStore,
  useSignalStore,
} from "@/stores";
import type {
  ActivityNormalizationWindow,
  CollectorKey,
  DataMode,
  LocationRetentionPreference,
  PermissionStatus,
  ThemePreference,
} from "@/types/zentra";
import {
  getCollectorActionPendingLabel,
  getCollectorQuickAction,
  type CollectorQuickActionType,
} from "@/utils/collector-actions";
import { buildDiagnosticTelemetrySummary } from "@/utils/collector-telemetry";
import { buildCollectorStatuses } from "@/utils/device-signals";
import { runImportantCollectorReconcile } from "@/utils/background/reconcile";
import {
  getLocationRetentionDescription,
  getLocationRetentionLabel,
} from "@/utils/location-retention";
import {
  getActivityPermissionLabel,
  getHealthPlatformName,
  getLiveSignalsSummary,
  getPlatformName,
} from "@/utils/platform-capabilities";
import {
  getActivityRecognitionPermissionStatusAsync,
  getGrantedHealthConnectPermissionsAsync,
  getHealthConnectAvailabilityAsync,
  getRequiredHealthConnectPermissions,
  hasRequiredHealthConnectPermissions,
  openHealthConnectPermissionRequestAsync,
  openHealthConnectSettingsAsync,
  openUsageAccessSettingsAsync,
  requestActivityRecognitionPermissionAsync,
  requestHealthConnectPermissionsAsync,
} from "@/utils/native/zentra-native-signals";
import { useShallow } from "zustand/react/shallow";

const THEME_OPTIONS: ThemePreference[] = ["system", "light", "dark", "sunrise"];
const DATA_MODE_OPTIONS: DataMode[] = ["live", "demo"];
const LOCATION_RETENTION_OPTIONS: LocationRetentionPreference[] = [
  "24h",
  "30d",
];
const ACTIVITY_NORMALIZATION_OPTIONS: ActivityNormalizationWindow[] = [
  "month",
  "year",
  "all",
];
const QUICK_ACTION_ICONS: Record<
  CollectorQuickActionType,
  keyof typeof Ionicons.glyphMap
> = {
  request_activity: "key-outline",
  open_app_settings: "settings-outline",
  open_usage_access: "phone-portrait-outline",
  connect_health: "fitness-outline",
};

function getActivityNormalizationLabel(
  preference: ActivityNormalizationWindow,
): string {
  switch (preference) {
    case "month":
      return "Rolling month";
    case "all":
      return "All time";
    default:
      return "Rolling year";
  }
}

function getActivityNormalizationDescription(
  preference: ActivityNormalizationWindow,
): string {
  switch (preference) {
    case "month":
      return "Useful-activity intensity is normalized against your strongest buckets from the last 30 rolling days.";
    case "all":
      return "Useful-activity intensity is normalized against your strongest buckets across all stored history on this device.";
    default:
      return "Useful-activity intensity is normalized against your strongest buckets from the last 365 rolling days.";
  }
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const collectors = useAppStore((state) => state.collectors);
  const setCollectorEnabled = useAppStore((state) => state.setCollectorEnabled);
  const dataMode = useAppStore((state) => state.dataMode);
  const setDataMode = useAppStore((state) => state.setDataMode);
  const activityNormalizationWindow = useAppStore(
    (state) => state.activityNormalizationWindow,
  );
  const setActivityNormalizationWindow = useAppStore(
    (state) => state.setActivityNormalizationWindow,
  );
  const locationRetentionPreference = useAppStore(
    (state) => state.locationRetentionPreference,
  );
  const hasSeenLocationBackgroundPermissionRationale = useAppStore(
    (state) => state.hasSeenLocationBackgroundPermissionRationale,
  );
  const setLocationRetentionPreference = useAppStore(
    (state) => state.setLocationRetentionPreference,
  );
  const noteLocationBackgroundPermissionRationaleSeen = useAppStore(
    (state) => state.noteLocationBackgroundPermissionRationaleSeen,
  );
  const clearAllData = useAppStore((state) => state.clearAllData);
  const retryCollectors = useAppStore((state) => state.retryCollectors);
  const lastExportedAt = useAppStore((state) => state.lastExportedAt);
  const themePreference = useAppearanceStore((state) => state.themePreference);
  const setThemePreference = useAppearanceStore(
    (state) => state.setThemePreference,
  );
  const clearCapturedData = useSignalStore((state) => state.clearCapturedData);
  const clearRepositoryData = useRepositoryStore(
    (state) => state.clearRepositoryData,
  );
  const backgroundCollectionServiceCheckedAt = useRepositoryStore(
    (state) => state.backgroundCollectionServiceCheckedAt,
  );
  const backgroundCollectionServiceState = useRepositoryStore(
    (state) => state.backgroundCollectionServiceState,
  );
  const backgroundTaskRegistrationCheckedAt = useRepositoryStore(
    (state) => state.backgroundTaskRegistrationCheckedAt,
  );
  const backgroundTaskRegistrationMessage = useRepositoryStore(
    (state) => state.backgroundTaskRegistrationMessage,
  );
  const backgroundTaskRegistrationStatus = useRepositoryStore(
    (state) => state.backgroundTaskRegistrationStatus,
  );
  const diagnostics = useRepositoryStore((state) => state.diagnostics);
  const latestSleepEvent = useRepositoryStore(
    (state) => state.latestSleepEvent,
  );
  const diagnosticsHistory = useRepositoryStore(
    (state) => state.diagnosticsHistory,
  );
  const bufferedActivityQueueDepth = useRepositoryStore(
    (state) => state.bufferedActivityQueueDepth,
  );
  const lastBackgroundReconcileAt = useRepositoryStore(
    (state) => state.lastBackgroundReconcileAt,
  );
  const lastBackgroundTaskFailureAt = useRepositoryStore(
    (state) => state.lastBackgroundTaskFailureAt,
  );
  const lastBackgroundTaskFailureMessage = useRepositoryStore(
    (state) => state.lastBackgroundTaskFailureMessage,
  );
  const lastBackgroundTaskSuccessAt = useRepositoryStore(
    (state) => state.lastBackgroundTaskSuccessAt,
  );
  const lastForegroundResumeReconcileAt = useRepositoryStore(
    (state) => state.lastForegroundResumeReconcileAt,
  );
  const lastHealthSyncWindowEndAt = useRepositoryStore(
    (state) => state.lastHealthSyncWindowEndAt,
  );
  const lastNativeDrainAt = useRepositoryStore(
    (state) => state.lastNativeDrainAt,
  );
  const lastNativeIngestionCount = useRepositoryStore(
    (state) => state.lastNativeIngestionCount,
  );
  const lastReconcileBoundedReason = useRepositoryStore(
    (state) => state.lastReconcileBoundedReason,
  );
  const lastReconcileDurationMs = useRepositoryStore(
    (state) => state.lastReconcileDurationMs,
  );
  const lastReconcileFailureMessage = useRepositoryStore(
    (state) => state.lastReconcileFailureMessage,
  );
  const lastReconcileFinishedAt = useRepositoryStore(
    (state) => state.lastReconcileFinishedAt,
  );
  const lastReconcileOutcome = useRepositoryStore(
    (state) => state.lastReconcileOutcome,
  );
  const lastReconcileRunAt = useRepositoryStore(
    (state) => state.lastReconcileRunAt,
  );
  const lastReconcileStartedAt = useRepositoryStore(
    (state) => state.lastReconcileStartedAt,
  );
  const lastReconcileTrigger = useRepositoryStore(
    (state) => state.lastReconcileTrigger,
  );
  const [pendingActionKey, setPendingActionKey] = React.useState<string | null>(
    null,
  );
  const [isReconcilingNow, setIsReconcilingNow] = React.useState(false);
  const [activityPermissionStatus, setActivityPermissionStatus] =
    React.useState<PermissionStatus>("not_requested");
  const [healthConnectPermissionStatus, setHealthConnectPermissionStatus] =
    React.useState<PermissionStatus>("not_requested");
  const signals = useSignalStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      stepCount: state.stepCount,
      stepSupported: state.stepSupported,
      stepPermissionStatus: state.stepPermissionStatus,
      stepLastUpdatedAt: state.stepLastUpdatedAt,
      batterySupported: state.batterySupported,
      batteryLevel: state.batteryLevel,
      batteryStateLabel: state.batteryStateLabel,
      lowPowerMode: state.lowPowerMode,
      batteryLastUpdatedAt: state.batteryLastUpdatedAt,
      locationSupported: state.locationSupported,
      locationPermissionStatus: state.locationPermissionStatus,
      locationServicesEnabled: state.locationServicesEnabled,
      locationSamples: state.locationSamples,
      locationLastUpdatedAt: state.locationLastUpdatedAt,
      ambientLightSupported: state.ambientLightSupported,
      ambientLightLux: state.ambientLightLux,
      ambientLightLastUpdatedAt: state.ambientLightLastUpdatedAt,
    })),
  );
  const activityPermissionLabel = getActivityPermissionLabel();
  const healthPlatformName = getHealthPlatformName();
  const platformName = getPlatformName();

  const refreshNativePermissionStatuses = React.useCallback(async () => {
    const [nextActivityStatus, healthAvailability, grantedHealthPermissions] =
      await Promise.all([
        getActivityRecognitionPermissionStatusAsync(),
        getHealthConnectAvailabilityAsync(),
        getGrantedHealthConnectPermissionsAsync(),
      ]);

    setActivityPermissionStatus(nextActivityStatus);

    if (healthAvailability === "unsupported") {
      setHealthConnectPermissionStatus("unsupported");
      return;
    }

    if (healthAvailability === "not_installed") {
      setHealthConnectPermissionStatus("blocked");
      return;
    }

    setHealthConnectPermissionStatus(
      hasRequiredHealthConnectPermissions(grantedHealthPermissions)
        ? "granted"
        : "not_requested",
    );
  }, []);

  React.useEffect(() => {
    void refreshNativePermissionStatuses();
  }, [
    refreshNativePermissionStatuses,
    collectors.activity.enabled,
    collectors.healthConnect.enabled,
  ]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refreshNativePermissionStatuses();
      }
    });

    return () => subscription.remove();
  }, [refreshNativePermissionStatuses]);

  const collectorStatuses = React.useMemo(
    () =>
      buildCollectorStatuses(collectors, signals, diagnostics, {
        hasLatestSleepEstimate: Boolean(latestSleepEvent),
        permissionStatusByCollector: {
          activity: collectors.activity.enabled
            ? activityPermissionStatus
            : "not_requested",
          healthConnect: collectors.healthConnect.enabled
            ? healthConnectPermissionStatus
            : "not_requested",
        },
      }),
    [
      activityPermissionStatus,
      collectors,
      diagnostics,
      healthConnectPermissionStatus,
      latestSleepEvent,
      signals,
    ],
  );
  const collectorLabelByKey = React.useMemo(
    () =>
      collectorStatuses.reduce<Record<string, string>>((result, collector) => {
        result[collector.key] = collector.label;
        return result;
      }, {}),
    [collectorStatuses],
  );

  function confirmDelete(): void {
    Alert.alert(
      "Wipe everything?",
      "This removes captured signals, exports, collector settings, onboarding state, and local preferences from this device. OS-level permissions remain granted until you revoke them in system settings.",
      [
        { style: "cancel", text: "Cancel" },
        {
          style: "destructive",
          text: "Delete",
          onPress: () => {
            void (async () => {
              await Promise.all([
                clearAllData(),
                clearCapturedData(),
                clearRepositoryData(),
                setThemePreference("system"),
              ]);
            })();
          },
        },
      ],
    );
  }

  function changeLocationRetention(
    nextPreference: LocationRetentionPreference,
  ): void {
    if (nextPreference === locationRetentionPreference) {
      return;
    }

    if (nextPreference === "30d") {
      Alert.alert(
        "Store location longer?",
        "This keeps raw location coordinates for up to 30 days. Only turn it on if you genuinely want the longer history on this device.",
        [
          { style: "cancel", text: "Cancel" },
          {
            text: "Enable 30 days",
            onPress: () => {
              void setLocationRetentionPreference(nextPreference);
            },
          },
        ],
      );
      return;
    }

    void setLocationRetentionPreference(nextPreference);
  }

  async function runCollectorQuickAction(
    type: CollectorQuickActionType,
    collectorKey: string,
  ): Promise<void> {
    setPendingActionKey(collectorKey);

    try {
      switch (type) {
        case "request_activity": {
          const result = await requestActivityRecognitionPermissionAsync();
          await refreshNativePermissionStatuses();
          await retryCollectors();
          Alert.alert(
            result === "granted"
              ? `${activityPermissionLabel} granted`
              : `${activityPermissionLabel} still unavailable`,
            result === "granted"
              ? `${activityPermissionLabel} was granted. Zentra will retry the collector now.`
              : `If the ${platformName} prompt did not appear or access is still denied, open Zentra app settings and allow ${activityPermissionLabel.toLowerCase()}.`,
          );
          return;
        }
        case "open_app_settings":
          await Linking.openSettings();
          Alert.alert(
            "App settings opened",
            `Allow the needed permission in ${platformName} settings, then return to Zentra and tap Retry signals.`,
          );
          return;
        case "open_usage_access": {
          const opened = await openUsageAccessSettingsAsync();
          Alert.alert(
            opened ? "Usage Access opened" : "Unable to open Usage Access",
            opened
              ? "Allow Zentra in Android Usage Access, then return to the app and tap Retry signals."
              : "Android did not open the Usage Access screen. Open it manually from Special app access > Usage access.",
          );
          return;
        }
        case "connect_health": {
          if (Platform.OS === "android") {
            const opened = await openHealthConnectPermissionRequestAsync();

            if (opened) {
              Alert.alert(
                `${healthPlatformName} opened`,
                `Grant Zentra access in ${healthPlatformName}, then come back and tap Retry signals. You'll be able to manage it from ${healthPlatformName} afterwards.`,
              );
              return;
            }

            const settingsOpened = await openHealthConnectSettingsAsync();
            Alert.alert(
              settingsOpened
                ? `${healthPlatformName} opened`
                : `Unable to open ${healthPlatformName}`,
              settingsOpened
                ? `Open the Zentra permission flow in ${healthPlatformName}, allow access, then come back and tap Retry signals.`
                : `Zentra couldn't open ${healthPlatformName}. Make sure it's installed and up to date, then try again.`,
            );
            return;
          }

          const grantedPermissions =
            await requestHealthConnectPermissionsAsync();
          await refreshNativePermissionStatuses();
          await retryCollectors();

          Alert.alert(
            hasRequiredHealthConnectPermissions(grantedPermissions)
              ? `${healthPlatformName} connected`
              : `${healthPlatformName} still needs permissions`,
            hasRequiredHealthConnectPermissions(grantedPermissions)
              ? `${healthPlatformName} access was granted. Zentra will retry the import now.`
              : `Grant all requested ${healthPlatformName} permissions, then return to Zentra and tap Retry signals. Required permissions: ${getRequiredHealthConnectPermissions().length}.`,
          );
          return;
        }
      }
    } catch (error) {
      Alert.alert(
        "Permission request failed",
        error instanceof Error
          ? error.message
          : "The native permission flow did not complete.",
      );
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handleCollectorEnabledChange(
    collectorKey: CollectorKey,
    value: boolean,
  ): Promise<void> {
    if (
      collectorKey === "location" &&
      value &&
      Platform.OS === "android" &&
      !hasSeenLocationBackgroundPermissionRationale
    ) {
      Alert.alert(
        "Allow background location?",
        "Zentra can keep collecting periodic mobility samples while the app is backgrounded. Android may show a system settings screen next, and while background updates are active you'll see a persistent system notification.",
        [
          { style: "cancel", text: "Not now" },
          {
            text: "Continue",
            onPress: () => {
              void (async () => {
                await noteLocationBackgroundPermissionRationaleSeen();
                await setCollectorEnabled("location", true);
              })();
            },
          },
        ],
      );
      return;
    }

    await setCollectorEnabled(collectorKey, value);
  }

  async function runReconcileNow(): Promise<void> {
    setIsReconcilingNow(true);

    try {
      await runImportantCollectorReconcile({ trigger: "manual" });
      await refreshNativePermissionStatuses();
      Alert.alert(
        "Reconcile finished",
        "Zentra ran the foreground reconcile flow and refreshed important collectors.",
      );
    } catch (error) {
      Alert.alert(
        "Reconcile failed",
        error instanceof Error
          ? error.message
          : "The reconcile flow did not complete.",
      );
    } finally {
      setIsReconcilingNow(false);
    }
  }

  return (
    <ScreenShell
      settingsEnabled={false}
      subtitle="Your preferences and controls"
      title="Settings"
    >
      <Button
        leadingIconName="chevron-back-outline"
        onPress={() => router.back()}
        style={styles.backButton}
        variant="ghost"
      >
        Back
      </Button>

      <ScreenLead
        body={getLiveSignalsSummary()}
        eyebrow={`${platformName} build`}
        footer={
          <View style={styles.leadFooter}>
            <Text style={[styles.leadMeta, { color: palette.textSecondary }]}>
              App version {Constants.expoConfig?.version ?? "1.0.0"}
            </Text>
            <Text style={[styles.leadMeta, { color: palette.textSecondary }]}>
              Data mode {dataMode}
            </Text>
          </View>
        }
        title="One Zentra. Tuned to your device."
      />

      <Card style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
          Appearance
        </Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((option) => (
            <Chip
              key={option}
              active={themePreference === option}
              label={option}
              leadingIconName={getThemePreferenceIcon(option)}
              onPress={() => void setThemePreference(option)}
            />
          ))}
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
          Where data comes from
        </Text>
        <View style={styles.themeRow}>
          {DATA_MODE_OPTIONS.map((option) => (
            <Chip
              key={option}
              active={dataMode === option}
              label={option}
              leadingIconName={getDataModeIcon(option)}
              onPress={() => void setDataMode(option)}
            />
          ))}
        </View>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          {dataMode === "demo"
            ? "Sample signals fill every screen — great for exploring before you commit to live data."
            : "Reads your real device signals. Anything unsupported on your phone just stays quiet."}
        </Text>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
          Location privacy
        </Text>
        <View style={styles.themeRow}>
          {LOCATION_RETENTION_OPTIONS.map((option) => (
            <Chip
              key={option}
              active={locationRetentionPreference === option}
              label={option}
              onPress={() => changeLocationRetention(option)}
            />
          ))}
        </View>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          {getLocationRetentionDescription(locationRetentionPreference)}
        </Text>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
          Activity intensity
        </Text>
        <View style={styles.themeRow}>
          {ACTIVITY_NORMALIZATION_OPTIONS.map((option) => (
            <Chip
              key={option}
              active={activityNormalizationWindow === option}
              label={getActivityNormalizationLabel(option)}
              onPress={() => void setActivityNormalizationWindow(option)}
            />
          ))}
        </View>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          {getActivityNormalizationDescription(activityNormalizationWindow)}
        </Text>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
          Your signals
        </Text>
        <View style={styles.column}>
          {collectorStatuses.map((collector) => {
            const quickAction = getCollectorQuickAction(collector);

            return (
              <CollectorToggleCard
                actionDisabled={pendingActionKey === collector.key}
                actionHelperText={quickAction?.helperText}
                actionIconName={
                  quickAction ? QUICK_ACTION_ICONS[quickAction.type] : undefined
                }
                actionLabel={quickAction?.label}
                actionPendingLabel={
                  pendingActionKey === collector.key
                    ? getCollectorActionPendingLabel(collector.key)
                    : undefined
                }
                collector={collector}
                key={collector.key}
                onActionPress={() => {
                  const action = getCollectorQuickAction(collector);

                  if (!action) {
                    return;
                  }

                  void runCollectorQuickAction(action.type, collector.key);
                }}
                onValueChange={(value) => {
                  void handleCollectorEnabledChange(collector.key, value);

                  if (value) {
                    // Re-derive the action that would apply once the collector is enabled.
                    const pendingAction = getCollectorQuickAction({
                      ...collector,
                      enabled: true,
                    });

                    if (pendingAction) {
                      void runCollectorQuickAction(
                        pendingAction.type,
                        collector.key,
                      );
                    }
                  }
                }}
              />
            );
          })}
        </View>
      </Card>

      <Card elevated style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
          Data controls
        </Text>
        <View style={styles.actionRow}>
          <Button
            leadingIconName={getActionIcon("delete")}
            onPress={confirmDelete}
            variant="outline"
          >
            Delete all data
          </Button>
          <Button
            leadingIconName={getActionIcon("retry")}
            onPress={() => void retryCollectors()}
            variant="outline"
          >
            Retry signals
          </Button>
          <Button
            disabled={isReconcilingNow}
            leadingIconName={getActionIcon("retry")}
            onPress={() => void runReconcileNow()}
            variant="outline"
          >
            {isReconcilingNow ? "Running reconcile..." : "Run reconcile now"}
          </Button>
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
          Diagnostics
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Schema version 1
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          App version {Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last export{" "}
          {lastExportedAt
            ? new Date(lastExportedAt).toLocaleString()
            : "No export yet"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Current data mode {dataMode}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Raw location retention{" "}
          {getLocationRetentionLabel(locationRetentionPreference)}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Activity normalization{" "}
          {getActivityNormalizationLabel(activityNormalizationWindow)}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last reconcile run{" "}
          {lastReconcileRunAt
            ? new Date(lastReconcileRunAt).toLocaleString()
            : "No reconcile run yet"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last background reconcile success{" "}
          {lastBackgroundTaskSuccessAt
            ? new Date(lastBackgroundTaskSuccessAt).toLocaleString()
            : "No background reconcile success yet"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last background reconcile run{" "}
          {lastBackgroundReconcileAt
            ? new Date(lastBackgroundReconcileAt).toLocaleString()
            : "No background reconcile run yet"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last background reconcile failure{" "}
          {lastBackgroundTaskFailureAt
            ? new Date(lastBackgroundTaskFailureAt).toLocaleString()
            : "No background reconcile failure yet"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last foreground resume reconcile{" "}
          {lastForegroundResumeReconcileAt
            ? new Date(lastForegroundResumeReconcileAt).toLocaleString()
            : "No foreground resume reconcile yet"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last native drain{" "}
          {lastNativeDrainAt
            ? `${new Date(lastNativeDrainAt).toLocaleString()}${lastNativeIngestionCount != null ? ` (${lastNativeIngestionCount} event${lastNativeIngestionCount === 1 ? "" : "s"})` : ""}`
            : "No native drain yet"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last health sync window end{" "}
          {lastHealthSyncWindowEndAt
            ? new Date(lastHealthSyncWindowEndAt).toLocaleString()
            : "No health sync window recorded yet"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last reconcile trigger {lastReconcileTrigger ?? "Not recorded"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last reconcile outcome {lastReconcileOutcome ?? "Not recorded"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last reconcile started{" "}
          {lastReconcileStartedAt
            ? new Date(lastReconcileStartedAt).toLocaleString()
            : "No reconcile start recorded"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last reconcile finished{" "}
          {lastReconcileFinishedAt
            ? new Date(lastReconcileFinishedAt).toLocaleString()
            : "No reconcile finish recorded"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last reconcile duration{" "}
          {lastReconcileDurationMs != null
            ? `${Math.round(lastReconcileDurationMs)} ms`
            : "No reconcile duration recorded"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last bounded reason {lastReconcileBoundedReason ?? "None"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Last reconcile failure message {lastReconcileFailureMessage ?? "None"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Background service state{" "}
          {backgroundCollectionServiceState ?? "Not checked"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Background service checked{" "}
          {backgroundCollectionServiceCheckedAt
            ? new Date(backgroundCollectionServiceCheckedAt).toLocaleString()
            : "No service state check yet"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Background task registration status{" "}
          {backgroundTaskRegistrationStatus ?? "Not checked"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Background task registration checked{" "}
          {backgroundTaskRegistrationCheckedAt
            ? new Date(backgroundTaskRegistrationCheckedAt).toLocaleString()
            : "No registration check yet"}
        </Text>
        {backgroundTaskRegistrationMessage ? (
          <Text style={[styles.detail, { color: palette.textSecondary }]}>
            Background task registration detail{" "}
            {backgroundTaskRegistrationMessage}
          </Text>
        ) : null}
        {lastBackgroundTaskFailureMessage ? (
          <Text style={[styles.detail, { color: palette.textSecondary }]}>
            Background failure detail {lastBackgroundTaskFailureMessage}
          </Text>
        ) : null}
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Buffered activity queue depth {bufferedActivityQueueDepth}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Repository diagnostics{" "}
          {diagnostics.length
            ? `Signal history — ${diagnostics.length} with stored activity`
            : "Signal history — nothing recorded yet"}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          {getLiveSignalsSummary()}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          Sunrise mode uses a local 06:00–18:00 daylight heuristic in this
          preview shell.
        </Text>
        <View style={styles.diagnosticsColumn}>
          {diagnosticsHistory.slice(0, 10).map((entry) => (
            <View
              key={entry.id}
              style={[
                styles.diagnosticItem,
                { borderBottomColor: palette.border },
              ]}
            >
              <Text
                style={[styles.diagnosticKey, { color: palette.foreground }]}
              >
                {collectorLabelByKey[entry.collectorKey] ?? entry.collectorKey}
              </Text>
              <Text style={[styles.detail, { color: palette.textSecondary }]}>
                {buildDiagnosticTelemetrySummary(entry)}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  leadFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  leadMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  backButton: {
    alignSelf: "flex-start",
    marginBottom: Spacing.md,
    paddingHorizontal: 0,
  },
  section: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  themeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  column: {
    gap: Spacing.md,
  },
  actionRow: {
    gap: Spacing.sm,
  },
  detail: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  diagnosticsColumn: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  diagnosticItem: {
    borderBottomWidth: 1,
    gap: 2,
    paddingBottom: Spacing.sm,
  },
  diagnosticKey: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
});

import React from "react";
import { Alert, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";

import { CollectorToggleCard } from "@/components/zentra/CollectorToggleCard";
import { ScreenLead } from "@/components/zentra/ScreenLead";
import { ScreenShell } from "@/components/zentra/ScreenShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Colors, Fonts, FontSizes, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  useAppearanceStore,
  useAppStore,
  useRepositoryStore,
  useSignalStore,
} from "@/stores";
import type {
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
import { buildCollectorStatuses } from "@/utils/device-signals";
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

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const collectors = useAppStore((state) => state.collectors);
  const setCollectorEnabled = useAppStore((state) => state.setCollectorEnabled);
  const dataMode = useAppStore((state) => state.dataMode);
  const setDataMode = useAppStore((state) => state.setDataMode);
  const locationRetentionPreference = useAppStore(
    (state) => state.locationRetentionPreference,
  );
  const setLocationRetentionPreference = useAppStore(
    (state) => state.setLocationRetentionPreference,
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
  const diagnostics = useRepositoryStore((state) => state.diagnostics);
  const diagnosticsHistory = useRepositoryStore(
    (state) => state.diagnosticsHistory,
  );
  const [pendingActionKey, setPendingActionKey] = React.useState<string | null>(
    null,
  );
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

  const collectorStatuses = React.useMemo(
    () =>
      buildCollectorStatuses(collectors, signals, diagnostics).map(
        (collector) => {
          if (collector.key === "activity") {
            return {
              ...collector,
              permissionStatus: collectors.activity.enabled
                ? activityPermissionStatus
                : "not_requested",
            };
          }

          if (collector.key === "healthConnect") {
            return {
              ...collector,
              permissionStatus: collectors.healthConnect.enabled
                ? healthConnectPermissionStatus
                : "not_requested",
            };
          }

          return collector;
        },
      ),
    [
      activityPermissionStatus,
      collectors,
      diagnostics,
      healthConnectPermissionStatus,
      signals,
    ],
  );

  function confirmDelete(): void {
    Alert.alert(
      "Delete all local data?",
      "This clears captured local readings and export metadata stored on this device.",
      [
        { style: "cancel", text: "Cancel" },
        {
          style: "destructive",
          text: "Delete",
          onPress: () => {
            void clearAllData();
            void clearCapturedData();
            void clearRepositoryData();
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
        "Keep raw location history longer?",
        "Extended retention stores raw coordinates for up to 30 days. Enable this only if you explicitly want longer raw location history on this device.",
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
            `Allow the needed permission in ${platformName} settings, then return to Zentra and tap Retry collectors.`,
          );
          return;
        case "open_usage_access": {
          const opened = await openUsageAccessSettingsAsync();
          Alert.alert(
            opened ? "Usage Access opened" : "Unable to open Usage Access",
            opened
              ? "Allow Zentra in Android Usage Access, then return to the app and tap Retry collectors."
              : "Android did not open the Usage Access screen. Open it manually from Special app access > Usage access.",
          );
          return;
        }
        case "connect_health": {
          if (Platform.OS === "android") {
            const opened = await openHealthConnectSettingsAsync();
            Alert.alert(
              opened
                ? `${healthPlatformName} opened`
                : `Unable to open ${healthPlatformName}`,
              opened
                ? `Grant Zentra access in ${healthPlatformName}, then return to the app and tap Retry collectors. Required permissions: ${getRequiredHealthConnectPermissions().length}.`
                : `Android did not open ${healthPlatformName}. Open it manually, grant Zentra access, then return to Zentra and tap Retry collectors.`,
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
              : `Grant all requested ${healthPlatformName} permissions, then return to Zentra and tap Retry collectors. Required permissions: ${getRequiredHealthConnectPermissions().length}.`,
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

  return (
    <ScreenShell
      settingsEnabled={false}
      subtitle="Controls and diagnostics"
      title="Settings"
    >
      <Button
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
        title="One shared shell, platform-aware capabilities."
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
              onPress={() => void setThemePreference(option)}
            />
          ))}
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
          Data source
        </Text>
        <View style={styles.themeRow}>
          {DATA_MODE_OPTIONS.map((option) => (
            <Chip
              key={option}
              active={dataMode === option}
              label={option}
              onPress={() => void setDataMode(option)}
            />
          ))}
        </View>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>
          {dataMode === "demo"
            ? "Demo mode shows illustrative dashboard, trends, and export data for presentations."
            : "Live mode reads supported on-device signals and leaves unsupported surfaces empty."}
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
          Collectors
        </Text>
        <View style={styles.column}>
          {collectorStatuses.map((collector) => (
            <CollectorToggleCard
              actionDisabled={pendingActionKey === collector.key}
              actionHelperText={getCollectorQuickAction(collector)?.helperText}
              actionLabel={getCollectorQuickAction(collector)?.label}
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
                void setCollectorEnabled(collector.key, value);

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
          ))}
        </View>
      </Card>

      <Card elevated style={styles.section}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
          Data controls
        </Text>
        <View style={styles.actionRow}>
          <Button onPress={confirmDelete} variant="outline">
            Delete all data
          </Button>
          <Button onPress={() => void retryCollectors()} variant="outline">
            Retry collectors
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
          Repository diagnostics{" "}
          {diagnostics.length
            ? `${diagnostics.length} collector(s) with stored status`
            : "No stored collector activity yet"}
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
                {entry.collectorKey}
              </Text>
              <Text style={[styles.detail, { color: palette.textSecondary }]}>
                {entry.status} · {entry.message ?? "No message"} · failures{" "}
                {entry.consecutiveFailures}
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

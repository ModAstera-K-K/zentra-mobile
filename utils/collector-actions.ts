import { Platform } from "react-native";

import type { CollectorKey, CollectorState } from "@/types/zentra";
import {
  getActivityPermissionLabel,
  getHealthPlatformName,
} from "@/utils/platform-capabilities";

export type CollectorQuickActionType =
  | "request_activity"
  | "open_app_settings"
  | "open_usage_access"
  | "connect_health";

export interface CollectorQuickAction {
  helperText: string;
  label: string;
  type: CollectorQuickActionType;
}

export function getCollectorActionPendingLabel(
  collectorKey: CollectorKey,
): string {
  switch (collectorKey) {
    case "activity":
      return "Asking for access…";
    case "appUsage":
      return "Opening settings…";
    case "healthConnect":
      return Platform.OS === "android"
        ? "Connecting to Health Connect…"
        : "Opening Health…";
    default:
      return "Working…";
  }
}

export function getCollectorQuickAction(
  collector: CollectorState,
): CollectorQuickAction | null {
  if (!collector.enabled) {
    return null;
  }

  if (
    collector.permissionStatus === "granted" ||
    collector.permissionStatus === "derived" ||
    collector.permissionStatus === "unsupported"
  ) {
    return null;
  }

  switch (collector.key) {
    case "activity":
      if (collector.permissionStatus === "blocked") {
        return {
          helperText: `Zentra needs ${getActivityPermissionLabel().toLowerCase()} to continue. Open settings to allow it.`,
          label: "Open App Settings",
          type: "open_app_settings",
        };
      }

      return {
        helperText: `Allow ${getActivityPermissionLabel().toLowerCase()} so Zentra can follow your activity through the day.`,
        label: Platform.OS === "ios" ? "Allow Motion Access" : "Allow Access",
        type: "request_activity",
      };
    case "appUsage":
      return {
        helperText:
          "Give Zentra access to Usage Stats so it can read your screen and app history.",
        label: "Open Usage Access",
        type: "open_usage_access",
      };
    case "healthConnect":
      return {
        helperText:
          Platform.OS === "android"
            ? `Connect ${getHealthPlatformName()} to Zentra. You can manage access from the ${getHealthPlatformName()} app afterwards.`
            : `Allow ${getHealthPlatformName()} access and Zentra will pick up the rest.`,
        label:
          Platform.OS === "android"
            ? `Connect ${getHealthPlatformName()}`
            : `Connect ${getHealthPlatformName()}`,
        type: "connect_health",
      };
    default:
      return null;
  }
}

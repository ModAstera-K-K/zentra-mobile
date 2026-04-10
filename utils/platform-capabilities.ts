import { Platform } from "react-native";

import type { CollectorKey, CollectorState } from "@/types/zentra";

export function getPlatformName(): string {
  return Platform.OS === "ios" ? "iOS" : "Android";
}

export function getHealthPlatformName(): string {
  return Platform.OS === "ios" ? "HealthKit" : "Health Connect";
}

export function getHealthSourceLabel(): string {
  return Platform.OS === "ios" ? "Apple HealthKit" : "Health Connect SDK";
}

export function getActivityPermissionLabel(): string {
  return Platform.OS === "ios" ? "Motion access" : "Activity recognition";
}

export function getActivitySourceLabel(): string {
  return Platform.OS === "ios" ? "Core Motion" : "Activity Recognition";
}

export function getActivityUnsupportedMessage(): string {
  return `Activity recognition is unsupported in this build until the ${getPlatformName()} dev client is rebuilt`;
}

export function getHealthUnsupportedMessage(): string {
  return `${getHealthPlatformName()} is unsupported in this build until the ${getPlatformName()} dev client is rebuilt`;
}

export function getAppUsageUnsupportedMessage(): string {
  return Platform.OS === "ios"
    ? "App usage, screen-state history, and unlock events are unsupported on iOS"
    : "Usage stats are unsupported in this build until the Android dev client is rebuilt";
}

export function getAmbientLightUnsupportedMessage(): string {
  return Platform.OS === "ios"
    ? "Ambient light is unsupported on iOS"
    : "Ambient light sensor is not available on this device";
}

export function getLiveSignalsSummary(): string {
  return Platform.OS === "ios"
    ? "Right now, Zentra reads steps, battery state, location, and motion activity on iOS. HealthKit support is coming. Screen time, unlock history, and ambient light stay unsupported on iOS."
    : "Right now, Zentra reads steps, battery state, location, and ambient light on Android. Activity recognition and Health Connect are coming soon.";
}

export function getCollectorPlatformOverrides(
  key: CollectorKey,
): Partial<CollectorState> {
  if (Platform.OS !== "ios") {
    return {};
  }

  switch (key) {
    case "activity":
      return {
        description:
          "Motion context from your phone — walking, running, cycling, or stillness.",
        permissionLabel: getActivityPermissionLabel(),
        sourceLabel: getActivitySourceLabel(),
      };
    case "appUsage":
      return {
        description: "Screen time and unlock history aren't available on iOS.",
        permissionLabel: "Unsupported on iOS",
        sourceLabel: "Android Usage Stats",
      };
    case "deviceState":
      return {
        description:
          "Battery level and charging state, plus screen history on Android.",
        permissionLabel: "System state",
        sourceLabel: "Battery monitoring",
      };
    case "healthConnect":
      return {
        label: getHealthPlatformName(),
        description:
          "Sleep, heart rate, steps, and workout history from your health app.",
        permissionLabel: "Health access",
        sourceLabel: getHealthSourceLabel(),
      };
    case "ambientLight":
      return {
        description: "Ambient light from a hardware sensor — Android only.",
        permissionLabel: "Unsupported on iOS",
        sourceLabel: "Android Light Sensor",
      };
    default:
      return {};
  }
}

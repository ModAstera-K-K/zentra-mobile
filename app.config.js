const IS_DEV = process.env.APP_VARIANT === "development";

export default {
  expo: {
    name: IS_DEV ? "Zentra (dev)" : "Zentra",
    slug: "zentra",
    version: "1.0.0",
    icon: "./assets/branding/zentra-app-icon.png",
    orientation: "portrait",
    scheme: "zentra",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    android: {
      package: IS_DEV ? "com.modastera.zentra.debug" : "com.modastera.zentra",
      minSdkVersion: 26,
      adaptiveIcon: {
        foregroundImage: "./assets/branding/zentra-app-icon.png",
        backgroundColor: "#F2EDE4",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: true,
      blockedPermissions: IS_DEV ? [] : ["android.permission.INTERNET"],
    },
    ios: {
      bundleIdentifier: "com.modastera.zentra",
      entitlements: {
        "com.apple.developer.healthkit": true,
      },
      infoPlist: {
        NSHealthShareUsageDescription:
          "Allow Zentra to read your Apple Health records so it can import steps, sleep, heart rate, and workouts locally on this device.",
        NSHealthUpdateUsageDescription:
          "Zentra does not write health data. This description is present to satisfy HealthKit capability requirements for local development builds.",
      },
    },
    plugins: [
      "expo-router",
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Allow Zentra to access your location while the app is open to estimate mobility radius.",
        },
      ],
      [
        "expo-sensors",
        {
          motionPermission:
            "Allow Zentra to access motion data for live step readings.",
        },
      ],
      "@react-native-community/datetimepicker",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  },
};

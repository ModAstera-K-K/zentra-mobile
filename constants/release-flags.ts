// Local build switches only: no remote configuration or telemetry.
export const RELEASE_FLAGS = {
  walkingEquivalent: process.env.EXPO_PUBLIC_WALKING_EQUIVALENT !== "0",
  personalInsights: process.env.EXPO_PUBLIC_PERSONAL_INSIGHTS !== "0",
  extendedHealthHistory: process.env.EXPO_PUBLIC_EXTENDED_HISTORY !== "0",
};

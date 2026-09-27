import type { HealthRecordType } from "@/types/health-sync";
const READ_PERMISSION: Record<HealthRecordType, string> = {
  steps: "READ_STEPS",
  sleep: "READ_SLEEP",
  heart_rate: "READ_HEART_RATE",
  exercise_session: "READ_EXERCISE",
};
export function canAttemptHealthRead(
  platform: string,
  type: HealthRecordType,
  permissions: string[],
): boolean {
  // HealthKit intentionally does not disclose read authorization.
  return (
    platform === "ios" ||
    (platform === "android" &&
      permissions.some((permission) =>
        permission.endsWith(READ_PERMISSION[type]),
      ))
  );
}

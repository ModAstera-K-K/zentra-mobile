import type { NativeHealthConnectRecord } from "@/utils/native/zentra-native-signals";
export const HEALTH_RECORD_TYPES = [
  "steps",
  "sleep",
  "heart_rate",
  "exercise_session",
] as const;
export type HealthRecordType = (typeof HEALTH_RECORD_TYPES)[number];
export interface HealthSyncPage {
  records: NativeHealthConnectRecord[];
  deletedIds: string[];
  cursor: string | null;
  hasMore: boolean;
  reset?: boolean;
}
export interface HealthSyncState {
  record_count?: number;
  observed_start?: string | null;
  observed_end?: string | null;
  record_type: HealthRecordType;
  cursor: string | null;
  history_days: number;
  status: string;
  message: string | null;
  updated_at: string | null;
  start_at: string | null;
  end_at: string | null;
}

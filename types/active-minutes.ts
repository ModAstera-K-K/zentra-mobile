export type ActiveKind =
  "walking" | "running" | "cycling" | "workout" | "steps" | "motion";
export interface ActiveInterval {
  start: number;
  end: number;
  kind: ActiveKind;
  priority: number;
  weight: number;
  recordIds: string[];
  source: string;
  estimated: boolean;
}
export interface WalkingBout {
  date: string;
  start: number;
  end: number;
  steps: number;
  minutes: number;
  source: string;
}
export interface ActiveMinutesSummary {
  date: string;
  supportedMinutes: number | null;
  quality: "partial" | "missing";
  contributions: { activity: ActiveKind; minutes: number }[];
  coverageReasons: string[];
  sources: string[];
  recordIds: string[];
  updatedAt: string | null;
  revision: string;
  calculationVersion: 2;
  walkingEquivalent: {
    lowerMinutes: number;
    upperMinutes: number;
    bouts: number;
    days: number;
  } | null;
  walkingBouts: WalkingBout[];
}

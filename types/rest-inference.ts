export type RestEvidenceKind = "rest" | "active" | "unknown";
export interface RestInterval {
  start: number;
  end: number;
  kind: RestEvidenceKind;
  signals: string[];
  recordIds: string[];
}
export interface RestWindow {
  start: number;
  end: number;
  wakeDate: string;
}
export interface RestCandidate {
  start: number;
  end: number;
  supportedMinutes: number;
  interruptionMinutes: number;
  unknownMinutes: number;
  coverage: number;
  intervals: RestInterval[];
}

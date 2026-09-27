export interface ActivityTransition {
  cursor?: number;
  id: string;
  activityType: string;
  transitionType: "enter" | "exit";
  confidence: number;
  timestamp: string;
  platform?: "ios" | "android";
  streamId?: string;
  delivery?: "live" | "history" | "buffered";
  originalTimestamp?: string;
  boundaryContext?: boolean;
}

export interface ActivityHistoryPage {
  transitions: ActivityTransition[];
  nextCursor: string | null;
  hasMore: boolean;
  queriedStart: string;
  queriedEnd: string;
  availableStart: string;
  truncated: boolean;
}

export interface ActivityHistoryWindow {
  start: string;
  end: string;
  cursor: string | null;
}

export interface ActivityHistoryState {
  windows: ActivityHistoryWindow[];
  queriedThrough: string | null;
  coverageStart: string | null;
  coverageEnd: string | null;
  availableStart: string | null;
  truncated: boolean;
  status:
    | "idle"
    | "importing"
    | "ready"
    | "permission"
    | "unsupported"
    | "error";
  message: string | null;
  updatedAt: string | null;
}

export const CORE_MOTION_STREAM = "ios:core_motion";

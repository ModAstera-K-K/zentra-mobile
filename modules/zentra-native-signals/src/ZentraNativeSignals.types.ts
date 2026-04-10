import type { StyleProp, ViewStyle } from 'react-native';

export type OnLoadEventPayload = {
  url: string;
};

export type ZentraNativeSignalsModuleEvents = {
  onActivityTransition: (params: ActivityTransitionEventPayload) => void;
};

export type ActivityTransitionEventPayload = {
  activityType: string;
  transitionType: 'enter' | 'exit';
  confidence: number;
  timestamp: string;
};

export type UsageEventPayload = {
  eventType:
    | 'activity_resumed'
    | 'activity_paused'
    | 'screen_interactive'
    | 'screen_non_interactive'
    | 'keyguard_hidden';
  packageName?: string | null;
  className?: string | null;
  timestamp: string;
};

export type ZentraNativeSignalsViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};

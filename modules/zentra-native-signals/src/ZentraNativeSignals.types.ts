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

export type ZentraNativeSignalsViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};

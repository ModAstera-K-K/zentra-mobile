import React from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { useAppStore, useRepositoryStore } from "@/stores";
import { activityHistoryDescription } from "@/utils/activity-history-presentation";

export function ActivityHistoryStatus({
  style,
}: {
  style?: StyleProp<TextStyle>;
}) {
  const history = useRepositoryStore((state) => state.activityHistory);
  const enabled = useAppStore((state) => state.collectors.activity.enabled);
  return (
    <Text style={style}>{activityHistoryDescription(history, enabled)}</Text>
  );
}

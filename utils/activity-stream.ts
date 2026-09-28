import type { ZentraEventRecord } from "@/types/zentra";
import type { ActivityTransition } from "@/types/activity-history";

/** Delivery is provenance, not the identity of the activity recognizer. */
export function activityStream(event: ZentraEventRecord): string {
  if (typeof event.metadata.activity_stream === "string")
    return event.metadata.activity_stream;
  if (["activity_recognition", "native_buffered"].includes(event.source))
    return `${event.metadata.activity_platform ?? "local"}:activity_recognition`;
  return `${event.source}:${event.metadata.source_app ?? "local"}`;
}

export function activityTransitionKey(event: ZentraEventRecord): string {
  return `${activityStream(event)}:${event.valueText}:${event.metadata.transition}:${Date.parse(event.timestampStart)}`;
}

export function activityTransitionMetadata(
  transition: ActivityTransition,
): ZentraEventRecord["metadata"] {
  return {
    confidence: transition.confidence,
    transition: transition.transitionType,
    ...(transition.platform ? { activity_platform: transition.platform } : {}),
    ...(transition.streamId ? { activity_stream: transition.streamId } : {}),
    ...(transition.delivery ? { activity_delivery: transition.delivery } : {}),
    ...(transition.originalTimestamp
      ? { original_timestamp: transition.originalTimestamp }
      : {}),
    ...(transition.boundaryContext ? { boundary_context: true } : {}),
  };
}

/** Old on-device recognition rows predate stream metadata; never merge explicit providers. */
export function legacyActivityStream(
  event: ZentraEventRecord,
  stream: string | null,
): ZentraEventRecord {
  return stream &&
    event.dataType === "activity" &&
    !event.metadata.activity_stream &&
    ["activity_recognition", "native_buffered"].includes(event.source)
    ? { ...event, metadata: { ...event.metadata, activity_stream: stream } }
    : event;
}

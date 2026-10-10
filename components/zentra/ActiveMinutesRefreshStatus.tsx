import React from "react";
import {
  InlineStatus,
  type InlineStatusProps,
} from "@/components/ui/InlineStatus";
import { useActiveMinutesRefresh } from "@/hooks/use-active-minutes-refresh";

/**
 * Keeps activity timing up to date for the range and reports it as an inline
 * status, to sit at the end of a line that is always there. `before` is shown
 * instead while set.
 */
export function ActiveMinutesRefreshStatus({
  enabled,
  start,
  end,
  before = null,
}: {
  enabled: boolean;
  start: string;
  end: string;
  before?: InlineStatusProps | null;
}) {
  const status = useActiveMinutesRefresh(enabled, { start, end });
  if (before) return <InlineStatus {...before} />;
  if (!enabled || (!status.updating && !status.error)) return null;
  return status.error ? (
    <InlineStatus
      accessibilityLabel={`Activity timing update unavailable: ${status.error}. Cached values remain partial.`}
      label="Activity update failed"
    />
  ) : (
    <InlineStatus
      accessibilityLabel="Updating activity timing. Cached values remain available."
      busy
      label="Updating activity"
    />
  );
}

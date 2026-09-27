import type {
  ActivityHistoryPage,
  ActivityHistoryState,
  ActivityHistoryWindow,
} from "@/types/activity-history";

const HISTORY_MS = 7 * 24 * 60 * 60_000;
const OVERLAP_MS = 10 * 60_000;

export function emptyActivityHistory(): ActivityHistoryState {
  return {
    windows: [],
    queriedThrough: null,
    coverageStart: null,
    coverageEnd: null,
    availableStart: null,
    truncated: false,
    status: "idle",
    message: null,
    updatedAt: null,
  };
}

/** Newest local day first; calendar arithmetic preserves 23/25-hour DST days. */
export function activityHistoryWindows(
  start: Date,
  end: Date,
): ActivityHistoryWindow[] {
  const windows: ActivityHistoryWindow[] = [];
  let cursor = end;
  while (cursor > start) {
    const midnight = new Date(cursor);
    midnight.setHours(0, 0, 0, 0);
    if (midnight.getTime() === cursor.getTime())
      midnight.setDate(midnight.getDate() - 1);
    const begin = new Date(Math.max(start.getTime(), midnight.getTime()));
    windows.push({
      start: begin.toISOString(),
      end: cursor.toISOString(),
      cursor: null,
    });
    cursor = begin;
  }
  return windows;
}

export function prepareActivityHistory(
  previous: ActivityHistoryState | null,
  now: Date,
): ActivityHistoryState {
  const floor = new Date(now.getTime() - HISTORY_MS);
  if (!previous)
    return {
      ...emptyActivityHistory(),
      availableStart: floor.toISOString(),
      windows: activityHistoryWindows(floor, now),
      status: "importing",
    };
  const windows = previous.windows.filter(
    (w) => Date.parse(w.end) > floor.getTime(),
  );
  if (!windows.length && !previous.queriedThrough)
    return {
      ...prepareActivityHistory(null, now),
      truncated: previous.windows.length > 0 || previous.truncated,
    };
  const truncated =
    previous.truncated ||
    windows.length !== previous.windows.length ||
    (!!previous.queriedThrough &&
      Date.parse(previous.queriedThrough) < floor.getTime());
  // Finish a durable partially read window before creating a new snapshot.
  if (
    !windows[0]?.cursor &&
    previous.queriedThrough &&
    now.getTime() - Date.parse(previous.queriedThrough) >= 30_000
  ) {
    const start = new Date(
      Math.max(
        floor.getTime(),
        Date.parse(previous.queriedThrough) - OVERLAP_MS,
      ),
    );
    const recent = activityHistoryWindows(start, now);
    const newestStart = recent.at(-1)!.start;
    // Superseded pending windows are queried by the newer bounded snapshot.
    windows.splice(
      0,
      windows.length,
      ...recent,
      ...windows.filter((w) => w.end <= newestStart),
    );
  }
  return {
    ...previous,
    windows,
    truncated,
    availableStart: floor.toISOString(),
    status: windows.length ? "importing" : "ready",
    message: null,
  };
}

export function advanceActivityHistory(
  state: ActivityHistoryState,
  page: ActivityHistoryPage,
  now: Date,
): ActivityHistoryState {
  if (
    page.hasMore &&
    (!page.nextCursor || page.nextCursor === state.windows[0]?.cursor)
  )
    throw new Error("Activity history cursor did not advance");
  const windows = page.hasMore
    ? [
        { ...state.windows[0], cursor: page.nextCursor },
        ...state.windows.slice(1),
      ]
    : state.windows.slice(1);
  const complete = !page.hasMore && page.queriedEnd > page.queriedStart;
  return {
    ...state,
    windows,
    status: windows.length ? "importing" : "ready",
    queriedThrough:
      complete &&
      (!state.queriedThrough || page.queriedEnd > state.queriedThrough)
        ? page.queriedEnd
        : state.queriedThrough,
    coverageStart:
      complete &&
      (!state.coverageStart || page.queriedStart < state.coverageStart)
        ? page.queriedStart
        : state.coverageStart,
    coverageEnd:
      complete && (!state.coverageEnd || page.queriedEnd > state.coverageEnd)
        ? page.queriedEnd
        : state.coverageEnd,
    availableStart: page.availableStart,
    truncated: state.truncated || page.truncated,
    updatedAt: now.toISOString(),
    message: page.transitions.length
      ? null
      : "No motion records in the latest query window.",
  };
}

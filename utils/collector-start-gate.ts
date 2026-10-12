/**
 * Which start the collectors are on: 0 while they are held back, and a higher
 * number for each time they are started. Effects that depend on it start
 * again when it changes.
 *
 * Collectors wait for the stored data to load, but not for long. If they were
 * let through while the database could not be opened and one of them failed to
 * start, loading the data later starts them again: a collector that failed has
 * nothing running and would otherwise stay off until the app restarts.
 */
export function collectorRunAfter(
  event: "repositoryLoaded" | "waitedLongEnough",
  state: {
    run: number;
    /** They were started by the wait, before the stored data had loaded. */
    startedBeforeLoad: boolean;
    /** A start has failed since. */
    startFailed: boolean;
  },
): number {
  if (state.run === 0) return 1;
  if (event === "waitedLongEnough") return state.run;
  return state.startedBeforeLoad && state.startFailed
    ? state.run + 1
    : state.run;
}

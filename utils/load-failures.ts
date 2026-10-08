/** Which of a screen's parallel loads last failed, for one scope of that screen. */
export interface LoadFailures<Name extends string> {
  scopeKey: string;
  failed: ReadonlySet<Name>;
}

/**
 * Record how one load ended. A failure is cleared only by that same load
 * succeeding: another load finishing says nothing about it, and clearing a
 * shared flag there left a screen waiting on a load that had already failed.
 * A result for another scope starts over. Returns `current` when nothing
 * changed, so it is safe as a state updater.
 */
export function noteLoadResult<Name extends string>(
  current: LoadFailures<Name> | null,
  scopeKey: string,
  name: Name,
  failed: boolean,
): LoadFailures<Name> | null {
  const known = current?.scopeKey === scopeKey ? current.failed : null;
  if ((known?.has(name) ?? false) === failed)
    return known || !current ? current : null;
  const next = new Set(known);
  if (failed) next.add(name);
  else next.delete(name);
  return next.size ? { scopeKey, failed: next } : null;
}

export function hasLoadFailure<Name extends string>(
  current: LoadFailures<Name> | null,
  scopeKey: string | undefined,
): boolean {
  return current !== null && current.scopeKey === scopeKey;
}

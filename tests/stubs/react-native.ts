type AppStateListener = (state: string) => void;

const appStateListeners = new Set<AppStateListener>();

export const Platform = {
  OS: "android",
  select: <T,>(options: { android?: T; ios?: T; default?: T }): T | undefined =>
    options.android ?? options.default,
};

export const AppState = {
  currentState: "active",
  addEventListener(_type: "change", listener: AppStateListener) {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  },
};

/** Test hook: move the app between foreground and background. */
export function setAppState(state: string): void {
  AppState.currentState = state;
  for (const listener of appStateListeners) listener(state);
}

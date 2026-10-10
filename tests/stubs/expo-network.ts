// Loaded through the collector registry. No test collects connectivity yet.
export enum NetworkStateType {
  NONE = "NONE",
  UNKNOWN = "UNKNOWN",
  CELLULAR = "CELLULAR",
  WIFI = "WIFI",
}

export function addNetworkStateListener(_listener: (state: unknown) => void) {
  return { remove: () => undefined };
}

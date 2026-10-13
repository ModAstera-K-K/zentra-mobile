export enum BatteryState {
  UNKNOWN = 0,
  UNPLUGGED = 1,
  CHARGING = 2,
  FULL = 3,
}

type Listener<T> = (event: T) => void;

const power = {
  batteryLevel: 0.8,
  batteryState: BatteryState.UNPLUGGED,
  lowPowerMode: false,
};
const levelListeners = new Set<Listener<{ batteryLevel: number }>>();
const stateListeners = new Set<Listener<{ batteryState: BatteryState }>>();
const lowPowerListeners = new Set<Listener<{ lowPowerMode: boolean }>>();

function subscribe<T>(listeners: Set<Listener<T>>, listener: Listener<T>) {
  listeners.add(listener);
  return { remove: () => void listeners.delete(listener) };
}

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

export async function getPowerStateAsync(): Promise<typeof power> {
  return { ...power };
}

export const addBatteryLevelListener = (listener: Listener<{ batteryLevel: number }>) =>
  subscribe(levelListeners, listener);
export const addBatteryStateListener = (listener: Listener<{ batteryState: BatteryState }>) =>
  subscribe(stateListeners, listener);
export const addLowPowerModeListener = (listener: Listener<{ lowPowerMode: boolean }>) =>
  subscribe(lowPowerListeners, listener);

/** Test hooks: what the next poll reads, and events as the platform sends them. */
export function setPowerState(next: Partial<typeof power>): void {
  Object.assign(power, next);
}
export function emitBatteryLevel(batteryLevel: number): void {
  for (const listener of levelListeners) listener({ batteryLevel });
}
export function emitBatteryState(batteryState: BatteryState): void {
  for (const listener of stateListeners) listener({ batteryState });
}
export function emitLowPowerMode(lowPowerMode: boolean): void {
  for (const listener of lowPowerListeners) listener({ lowPowerMode });
}

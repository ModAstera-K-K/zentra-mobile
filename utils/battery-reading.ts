import { toISODate } from "@/utils/dates";

export interface BatteryReading {
  batteryLevel: number | null;
  batteryStateLabel: string | null;
  lowPowerMode: boolean | null;
}

export interface StoredBatteryReading {
  reading: BatteryReading;
  atMs: number;
}

/** An unchanged reading is stored again after this long, so the record never has a longer gap while the app is open. */
export const BATTERY_HEARTBEAT_MS = 10 * 60_000;

/** A listener reports one field at a time; the rest keep their last known value. */
export function mergeBatteryReading(
  known: BatteryReading | null,
  update: Partial<BatteryReading>,
): BatteryReading {
  return {
    batteryLevel: update.batteryLevel ?? known?.batteryLevel ?? null,
    batteryStateLabel:
      update.batteryStateLabel ?? known?.batteryStateLabel ?? null,
    lowPowerMode: update.lowPowerMode ?? known?.lowPowerMode ?? null,
  };
}

function wholePercent(level: number | null): number | null {
  return level === null ? null : Math.round(level * 100);
}

/**
 * Whether a reading is worth a stored row: the first one, a change of a whole
 * percent, of charging state or of low-power mode, the first of a local day,
 * or the heartbeat. Everything else repeats what is already stored.
 */
export function isBatteryReadingDue(
  stored: StoredBatteryReading | null,
  next: BatteryReading,
  nowMs: number,
): boolean {
  if (!stored) return true;
  return (
    wholePercent(next.batteryLevel) !==
      wholePercent(stored.reading.batteryLevel) ||
    next.batteryStateLabel !== stored.reading.batteryStateLabel ||
    next.lowPowerMode !== stored.reading.lowPowerMode ||
    nowMs - stored.atMs >= BATTERY_HEARTBEAT_MS ||
    toISODate(new Date(nowMs)) !== toISODate(new Date(stored.atMs))
  );
}

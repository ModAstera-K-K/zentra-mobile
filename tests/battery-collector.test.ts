import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BATTERY_HEARTBEAT_MS,
  isBatteryReadingDue,
  mergeBatteryReading,
} from "@/utils/battery-reading";
import { startDeviceStateCollector } from "@/utils/collectors/device-state-collector";
import { enqueueDatabaseOperation } from "@/utils/event-repository";
import { openTestRepository } from "./repository-harness";
import { statementLog } from "./sqlite-adapter";
import {
  BatteryState,
  emitBatteryLevel,
  emitBatteryState,
  emitLowPowerMode,
  setPowerState,
} from "./stubs/expo-battery";

const AFTERNOON = new Date(2026, 8, 15, 15, 0, 0).getTime();
const POLL_MS = 15_000;

test("a battery reading is due only when it says something new", () => {
  const reading = { batteryLevel: 0.8, batteryStateLabel: "Unplugged", lowPowerMode: false };
  const stored = { reading, atMs: AFTERNOON };
  const later = AFTERNOON + POLL_MS;

  assert.equal(isBatteryReadingDue(null, reading, AFTERNOON), true);
  assert.equal(isBatteryReadingDue(stored, { ...reading }, later), false);
  assert.equal(isBatteryReadingDue(stored, { ...reading, batteryLevel: 0.804 }, later), false);
  assert.equal(isBatteryReadingDue(stored, { ...reading, batteryLevel: 0.79 }, later), true);
  assert.equal(isBatteryReadingDue(stored, { ...reading, batteryStateLabel: "Charging" }, later), true);
  assert.equal(isBatteryReadingDue(stored, { ...reading, lowPowerMode: true }, later), true);

  assert.equal(isBatteryReadingDue(stored, reading, AFTERNOON + BATTERY_HEARTBEAT_MS - 1), false);
  assert.equal(isBatteryReadingDue(stored, reading, AFTERNOON + BATTERY_HEARTBEAT_MS), true);

  // The first reading of a local day is stored even a second after the last one.
  const beforeMidnight = { reading, atMs: new Date(2026, 8, 15, 23, 59, 59).getTime() };
  assert.equal(isBatteryReadingDue(beforeMidnight, reading, beforeMidnight.atMs + 2_000), true);

  // A listener carries one field; the others keep their last known value.
  assert.deepEqual(mergeBatteryReading(reading, { batteryStateLabel: "Charging" }), {
    ...reading,
    batteryStateLabel: "Charging",
  });
  assert.deepEqual(mergeBatteryReading(null, { batteryLevel: 0.5 }), {
    batteryLevel: 0.5,
    batteryStateLabel: null,
    lowPowerMode: null,
  });
});

test("the battery collector stores a row when the reading changes, not on every poll", async (context) => {
  context.mock.timers.enable({ apis: ["setInterval", "Date"], now: AFTERNOON });
  const adapter = await openTestRepository();
  const calls = { refresh: 0, snapshot: 0, failNextSnapshot: false };
  const rows = () =>
    adapter.db
      .prepare(
        "SELECT value_numeric AS level, value_text AS state, metadata FROM events WHERE data_type = 'charging_state' ORDER BY rowid",
      )
      .all()
      .map((row) => `${row.level} ${row.state} ${row.metadata}`);
  // Let the collector's promises and the database queue run dry.
  const settle = async () => {
    for (let turn = 0; turn < 3; turn++) {
      await new Promise((resolve) => setImmediate(resolve));
      await enqueueDatabaseOperation(async () => undefined);
    }
  };
  const poll = async (times = 1) => {
    for (let index = 0; index < times; index++) {
      context.mock.timers.tick(POLL_MS);
      await settle();
    }
  };

  setPowerState({ batteryLevel: 0.8, batteryState: BatteryState.UNPLUGGED, lowPowerMode: false });
  const collector = await startDeviceStateCollector({
    refreshRepository: async () => {
      calls.refresh++;
    },
    setBatterySupport: async () => undefined,
    setBatterySnapshot: async () => {
      calls.snapshot++;
      if (calls.failNextSnapshot) {
        calls.failNextSnapshot = false;
        throw new Error("storage unavailable");
      }
    },
  });
  context.after(() => collector.stop());
  assert.deepEqual(rows(), ['0.8 Unplugged {"low_power_mode":false}']);

  // A minute of polls, and the broadcasts Android repeats with the same state.
  const quietFrom = statementLog.length;
  await poll(4);
  for (let index = 0; index < 3; index++) emitBatteryState(BatteryState.UNPLUGGED);
  await settle();
  assert.equal(statementLog.length, quietFrom, "an unchanged reading touches the database");
  assert.deepEqual(calls, { refresh: 1, snapshot: 1, failNextSnapshot: false });

  setPowerState({ batteryLevel: 0.79 });
  await poll();
  emitBatteryState(BatteryState.CHARGING);
  await settle();
  emitBatteryLevel(0.794);
  await settle();
  emitBatteryLevel(0.8);
  await settle();
  emitLowPowerMode(true);
  await settle();
  assert.deepEqual(rows().slice(1), [
    '0.79 Unplugged {"low_power_mode":false}',
    // Rows from a listener carry the fields it did not report.
    '0.79 Charging {"low_power_mode":false}',
    '0.8 Charging {"low_power_mode":false}',
    '0.8 Charging {"low_power_mode":true}',
  ]);
  assert.equal(calls.refresh, 5);

  // Ten minutes with nothing new: one heartbeat row, on the poll that reaches it.
  setPowerState({ batteryLevel: 0.8, batteryState: BatteryState.CHARGING, lowPowerMode: true });
  await poll(BATTERY_HEARTBEAT_MS / POLL_MS - 1);
  assert.equal(rows().length, 5);
  await poll();
  assert.equal(rows().length, 6);

  // A reading that could not be stored is tried again on the next poll.
  calls.failNextSnapshot = true;
  setPowerState({ batteryLevel: 0.81 });
  await poll();
  assert.equal(rows().length, 6);
  await poll();
  assert.equal(rows().at(-1), '0.81 Charging {"low_power_mode":true}');
});

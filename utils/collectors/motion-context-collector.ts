import { Accelerometer, Gyroscope } from "expo-sensors";

import {
  appendEventsForCollector,
  ensureCollectorFailureState,
} from "@/utils/event-repository";
import { createMotionContextEvent } from "@/utils/live-event-builders";
import type {
  CollectorHandle,
  MotionContextCollectorDeps,
} from "@/utils/collectors/types";

const SAMPLE_INTERVAL_MS = 500;
const SUMMARY_INTERVAL_MS = 60_000;
const MAGNITUDE_STILL_THRESHOLD = 0.15;
const MAGNITUDE_BURST_THRESHOLD = 2.0;

interface MotionSample {
  accelMagnitude: number;
  gyroMagnitude: number;
  timestamp: number;
}

function classifyWindow(samples: MotionSample[]): {
  label: string;
  avgAccel: number;
  avgGyro: number;
  peakAccel: number;
  sedentaryRatio: number;
  burstRatio: number;
  stability: number;
} {
  if (!samples.length) {
    return {
      label: "unknown",
      avgAccel: 0,
      avgGyro: 0,
      peakAccel: 0,
      sedentaryRatio: 1,
      burstRatio: 0,
      stability: 1,
    };
  }

  const accelValues = samples.map((s) => s.accelMagnitude);
  const gyroValues = samples.map((s) => s.gyroMagnitude);
  const avgAccel = accelValues.reduce((a, b) => a + b, 0) / accelValues.length;
  const avgGyro = gyroValues.reduce((a, b) => a + b, 0) / gyroValues.length;
  const peakAccel = Math.max(...accelValues);
  const sedentaryCount = accelValues.filter(
    (v) => v < MAGNITUDE_STILL_THRESHOLD,
  ).length;
  const burstCount = accelValues.filter(
    (v) => v > MAGNITUDE_BURST_THRESHOLD,
  ).length;
  const sedentaryRatio = sedentaryCount / samples.length;
  const burstRatio = burstCount / samples.length;

  const accelMean = avgAccel;
  const accelVariance =
    accelValues.reduce((sum, v) => sum + (v - accelMean) ** 2, 0) /
    accelValues.length;
  const stability = 1 / (1 + Math.sqrt(accelVariance));

  let label: string;
  if (sedentaryRatio > 0.8) {
    label = "sedentary";
  } else if (burstRatio > 0.2) {
    label = "burst_activity";
  } else if (stability > 0.7) {
    label = "stable";
  } else {
    label = "moderate_movement";
  }

  return {
    label,
    avgAccel: Number(avgAccel.toFixed(3)),
    avgGyro: Number(avgGyro.toFixed(3)),
    peakAccel: Number(peakAccel.toFixed(3)),
    sedentaryRatio: Number(sedentaryRatio.toFixed(2)),
    burstRatio: Number(burstRatio.toFixed(2)),
    stability: Number(stability.toFixed(2)),
  };
}

export async function startMotionContextCollector(
  deps: MotionContextCollectorDeps,
): Promise<CollectorHandle> {
  const accelAvailable = await Accelerometer.isAvailableAsync();
  const gyroAvailable = await Gyroscope.isAvailableAsync();

  if (!accelAvailable) {
    await ensureCollectorFailureState(
      "motionContext",
      "Accelerometer is not available on this device",
    );
    await deps.refreshRepository();
    return { stop: () => undefined };
  }

  const samples: MotionSample[] = [];
  let latestGyroMagnitude = 0;

  Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);

  if (gyroAvailable) {
    Gyroscope.setUpdateInterval(SAMPLE_INTERVAL_MS);
  }

  const gyroSubscription = gyroAvailable
    ? Gyroscope.addListener(({ x, y, z }) => {
        latestGyroMagnitude = Math.sqrt(x * x + y * y + z * z);
      })
    : null;

  const accelSubscription = Accelerometer.addListener(({ x, y, z }) => {
    const gravityAdjusted = Math.abs(Math.sqrt(x * x + y * y + z * z) - 1);
    samples.push({
      accelMagnitude: gravityAdjusted,
      gyroMagnitude: latestGyroMagnitude,
      timestamp: Date.now(),
    });
  });

  const summaryInterval = setInterval(() => {
    if (!samples.length) {
      return;
    }

    const windowSamples = samples.splice(0, samples.length);
    const summary = classifyWindow(windowSamples);

    void (async () => {
      await appendEventsForCollector(
        "motionContext",
        [createMotionContextEvent(summary)],
        `Motion context: ${summary.label}`,
      );
      await deps.refreshRepository();
    })();
  }, SUMMARY_INTERVAL_MS);

  await deps.refreshRepository();

  return {
    stop: () => {
      clearInterval(summaryInterval);
      accelSubscription.remove();
      gyroSubscription?.remove();
      samples.length = 0;
    },
  };
}

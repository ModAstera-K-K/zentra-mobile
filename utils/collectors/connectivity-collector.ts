import { AppState, type AppStateStatus } from "react-native";

import { appendEventsForCollector } from "@/utils/event-repository";
import { createConnectivityStateEvent } from "@/utils/live-event-builders";
import type { CollectorHandle } from "@/utils/collectors/types";

const CHECK_INTERVAL_MS = 5 * 60_000;
const TIMEOUT_MS = 5_000;

async function probeConnectivity(): Promise<"online" | "offline"> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch("https://clients3.google.com/generate_204", {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok || response.status === 204 ? "online" : "offline";
  } catch {
    return "offline";
  }
}

export async function startConnectivityCollector(deps: {
  refreshRepository: () => Promise<void>;
}): Promise<CollectorHandle> {
  let lastState: "online" | "offline" | null = null;
  let isActive = true;

  async function checkAndStore(): Promise<void> {
    if (!isActive) {
      return;
    }

    const state = await probeConnectivity();
    if (state !== lastState) {
      lastState = state;
      await appendEventsForCollector(
        "deviceState",
        [createConnectivityStateEvent(state)],
        `Connectivity: ${state}`,
      );
      await deps.refreshRepository();
    }
  }

  function handleAppStateChange(nextState: AppStateStatus): void {
    if (nextState === "active") {
      void checkAndStore();
    }
  }

  const subscription = AppState.addEventListener(
    "change",
    handleAppStateChange,
  );

  void checkAndStore();
  const interval = setInterval(() => void checkAndStore(), CHECK_INTERVAL_MS);

  return {
    stop: () => {
      isActive = false;
      clearInterval(interval);
      subscription.remove();
    },
  };
}

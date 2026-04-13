import * as Network from "expo-network";

import {
  appendEventsForCollector,
  ensureCollectorFailureState,
} from "@/utils/event-repository";
import { createConnectivityStateEvent } from "@/utils/live-event-builders";
import type {
  CollectorHandle,
  ConnectivityCollectorDeps,
} from "@/utils/collectors/types";

function mapNetworkState(
  state: Network.NetworkState,
): "online" | "offline" | "wifi" | "cellular" {
  if (state.isConnected === false) {
    return "offline";
  }

  switch (state.type) {
    case Network.NetworkStateType.WIFI:
      return "wifi";
    case Network.NetworkStateType.CELLULAR:
      return "cellular";
    default:
      return "online";
  }
}

export async function startConnectivityCollector(
  deps: ConnectivityCollectorDeps,
): Promise<CollectorHandle> {
  try {
    let lastState = mapNetworkState(await Network.getNetworkStateAsync());

    await appendEventsForCollector(
      "connectivity",
      [createConnectivityStateEvent(lastState)],
      `Connectivity ${lastState}`,
    );
    await deps.refreshRepository();

    const subscription = Network.addNetworkStateListener((state) => {
      const nextState = mapNetworkState(state);

      if (nextState === lastState) {
        return;
      }

      lastState = nextState;
      void (async () => {
        await appendEventsForCollector(
          "connectivity",
          [createConnectivityStateEvent(nextState)],
          `Connectivity ${nextState}`,
        );
        await deps.refreshRepository();
      })();
    });

    return {
      stop: () => subscription.remove(),
    };
  } catch (error) {
    await ensureCollectorFailureState(
      "connectivity",
      error instanceof Error
        ? error.message
        : "Connectivity state is unavailable on this device",
    );
    await deps.refreshRepository();

    return {
      stop: () => undefined,
    };
  }
}

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { appendEventsForCollector } from "@/utils/event-repository";
import { createLocationEvent } from "@/utils/live-event-builders";

export const ZENTRA_BACKGROUND_LOCATION_TASK = "zentra-background-location";

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

function mapLocationToSample(location: Location.LocationObject): {
  latitude: number;
  longitude: number;
  timestamp: string;
} {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: new Date(location.timestamp).toISOString(),
  };
}

if (!TaskManager.isTaskDefined(ZENTRA_BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask<LocationTaskData>(
    ZENTRA_BACKGROUND_LOCATION_TASK,
    async ({ data, error }) => {
      if (error || !data?.locations?.length) {
        return;
      }

      await appendEventsForCollector(
        "location",
        data.locations.map(mapLocationToSample).map(createLocationEvent),
        `Background location stored ${data.locations.length} sample(s)`,
      );
    },
  );
}

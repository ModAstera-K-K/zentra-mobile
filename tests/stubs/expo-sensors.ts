// Loaded through the collector registry. No test drives these sensors yet, so
// they report themselves unavailable and never emit.
const subscription = { remove: () => undefined };
const silentSensor = {
  isAvailableAsync: async () => false,
  addListener: () => subscription,
  setUpdateInterval: () => undefined,
};

export const Accelerometer = silentSensor;
export const Gyroscope = silentSensor;
export const LightSensor = silentSensor;
export const Pedometer = {
  isAvailableAsync: async () => false,
  watchStepCount: () => subscription,
};

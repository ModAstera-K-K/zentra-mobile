// Loaded through the collector registry. No test collects location yet.
export enum Accuracy {
  Lowest = 1,
  Low = 2,
  Balanced = 3,
  High = 4,
  Highest = 5,
  BestForNavigation = 6,
}

export async function hasStartedLocationUpdatesAsync(_task: string): Promise<boolean> {
  return false;
}

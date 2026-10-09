export enum BackgroundTaskStatus {
  Restricted = 1,
  Available = 2,
}

export enum BackgroundTaskResult {
  Success = 1,
  Failed = 2,
}

export async function getStatusAsync(): Promise<BackgroundTaskStatus> {
  return BackgroundTaskStatus.Available;
}

export async function registerTaskAsync(_name: string): Promise<void> {}

export async function unregisterTaskAsync(_name: string): Promise<void> {}

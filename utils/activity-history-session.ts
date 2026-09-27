let generation = 0;
let job: { generation: number; promise: Promise<number> } | null = null;

export function activityHistoryGeneration(): number {
  return generation;
}
export function cancelActivityHistory(): void {
  generation++;
}
export function assertActivityHistoryGeneration(expected: number): void {
  if (expected !== generation) throw new Error("Activity import cancelled");
}
export function joinActivityHistoryJob(
  run: (generation: number) => Promise<number>,
): Promise<number> {
  if (job?.generation === generation) return job.promise;
  const current = generation;
  const promise = Promise.resolve()
    .then(() => run(current))
    .finally(() => {
      if (job?.promise === promise) job = null;
    });
  job = { generation: current, promise };
  return promise;
}

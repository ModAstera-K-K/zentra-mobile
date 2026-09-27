let generation = 0;
export function healthSyncGeneration(): number {
  return generation;
}
export function cancelHealthSync(): void {
  generation++;
}
export function assertHealthSyncGeneration(expected: number): void {
  if (expected !== generation) throw new Error("Health import cancelled");
}

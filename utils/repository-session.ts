let epoch = 0;
export function repositoryEpoch(): number {
  return epoch;
}
export function invalidateRepositorySession(): void {
  epoch++;
}
export function assertRepositoryEpoch(expected: number): void {
  if (expected !== epoch) throw new Error("Repository was cleared");
}

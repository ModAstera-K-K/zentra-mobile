import type { ZentraEventRecord } from "@/types/zentra";
export function stableEvents(
  previous: ZentraEventRecord[],
  next: ZentraEventRecord[],
): ZentraEventRecord[] {
  return previous.length === next.length &&
    previous.every(
      (event, i) => JSON.stringify(event) === JSON.stringify(next[i]),
    )
    ? previous
    : next;
}

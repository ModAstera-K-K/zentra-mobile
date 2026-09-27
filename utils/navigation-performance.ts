import { startPerfTimer } from "@/utils/perf";
const pending = new Map<string, ReturnType<typeof startPerfTimer>>();
export function markTabPress(name: string): void {
  pending.get(name)?.({ superseded: true });
  pending.set(
    name,
    startPerfTimer("navigation.press_to_frame", { screen: name }),
  );
}
export function markTabFrame(name: string): void {
  pending.get(name)?.();
  pending.delete(name);
}

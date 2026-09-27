import { recordLocalDuration } from "@/utils/perf";

/** JS frame scheduling probe, not a native frame-rendering benchmark. */
export function monitorFrameStalls(screen: string): () => void {
  if (process.env.EXPO_PUBLIC_LOCAL_PERF !== "1") return () => {};
  let previous = performance.now(),
    frame = 0;
  const tick = () => {
    const now = performance.now(),
      gap = now - previous;
    if (gap > 50) recordLocalDuration(`navigation.frame_gap.${screen}`, gap);
    previous = now;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

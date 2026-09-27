import { monitorFrameStalls } from "@/utils/frame-stall-monitor";
import { useEffect } from "react";
import { useIsFocused } from "@react-navigation/native";
import { markTabFrame } from "@/utils/navigation-performance";
export function useTabPerformance(name: string): void {
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    const stop = monitorFrameStalls(name);
    const frame = requestAnimationFrame(() => markTabFrame(name));
    return () => {
      cancelAnimationFrame(frame);
      stop();
    };
  }, [focused, name]);
}

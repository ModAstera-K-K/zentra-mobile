import type { AppPalette } from "@/constants/theme";
import { hexToRgba } from "@/utils/colors";

export function patternIntensityColor(scheme: "light" | "dark", intensity: number, palette: AppPalette): string {
  const normalized = Math.max(0, Math.min(100, intensity)) / 100;
  return hexToRgba(palette.signalPhysical, scheme === "dark" ? 0.16 + normalized * 0.34 : 0.12 + normalized * 0.28);
}

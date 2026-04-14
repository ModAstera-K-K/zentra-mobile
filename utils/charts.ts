import type { TrendPoint } from "@/types/zentra";

export interface ChartCoordinate {
  x: number;
  y: number;
}

function getExtents(points: TrendPoint[]): { max: number; min: number } {
  const values = points.map((point) => point.value);
  return {
    max: Math.max(...values),
    min: Math.min(...values),
  };
}

export function buildChartCoordinates(
  points: TrendPoint[],
  width: number,
  height: number,
  normalizedXValues?: (number | undefined)[],
  fixedRange?: { min: number; max: number },
): ChartCoordinate[] {
  if (!points.length) {
    return [];
  }

  const { max, min } = fixedRange ?? getExtents(points);
  const range = Math.max(max - min, 1);

  return points.map((point, index) => {
    const nx = normalizedXValues?.[index];
    const x =
      nx != null
        ? nx * width
        : points.length === 1
          ? width / 2
          : (index / (points.length - 1)) * width;
    return {
      x,
      y: height - ((point.value - min) / range) * height,
    };
  });
}

export function buildPolylinePoints(coordinates: ChartCoordinate[]): string {
  return coordinates
    .map((coordinate) => `${coordinate.x},${coordinate.y}`)
    .join(" ");
}

/**
 * Pick evenly-spaced label indices from an array of `count` items.
 * Always includes the first and last index. Returns at most `maxLabels`
 * indices (default 5).
 */
export function pickAxisLabelIndices(count: number, maxLabels = 5): number[] {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);

  const indices: number[] = [0];
  const step = (count - 1) / (maxLabels - 1);
  for (let i = 1; i < maxLabels - 1; i++) {
    indices.push(Math.round(step * i));
  }
  indices.push(count - 1);
  return indices;
}

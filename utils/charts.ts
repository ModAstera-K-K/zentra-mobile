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
): ChartCoordinate[] {
  if (!points.length) {
    return [];
  }

  const { max, min } = getExtents(points);
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

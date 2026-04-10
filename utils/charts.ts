import type { TrendPoint } from '@/types/zentra';

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
): ChartCoordinate[] {
  if (!points.length) {
    return [];
  }

  const { max, min } = getExtents(points);
  const range = Math.max(max - min, 1);

  return points.map((point, index) => ({
    x: points.length === 1 ? width / 2 : (index / (points.length - 1)) * width,
    y: height - ((point.value - min) / range) * height,
  }));
}

export function buildPolylinePoints(coordinates: ChartCoordinate[]): string {
  return coordinates.map((coordinate) => `${coordinate.x},${coordinate.y}`).join(' ');
}


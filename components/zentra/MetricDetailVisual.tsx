import React from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import {
  Colors,
  Fonts,
  FontSizes,
  Spacing,
  type AppPalette,
} from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { MetricTone, TrendDetailVisual } from "@/types/zentra";
import { buildChartCoordinates, buildPolylinePoints } from "@/utils/charts";
import type { TodayDetailVisual } from "@/utils/today-visualization";

interface MetricDetailVisualProps {
  tone: MetricTone;
  visual: TodayDetailVisual | TrendDetailVisual | null;
}

type DetailVisual = TodayDetailVisual | TrendDetailVisual;

const CHART_HEIGHT = 148;
const CHART_INSET_X = 12;
const CHART_INSET_Y = 14;

function getToneColor(tone: MetricTone, palette: AppPalette): string {
  switch (tone) {
    case "physical":
      return palette.signalPhysical;
    case "human":
      return palette.signalHuman;
    case "cool":
      return palette.signalCool;
    default:
      return palette.primary;
  }
}

function buildGridYPositions(): number[] {
  return [CHART_INSET_Y, CHART_HEIGHT / 2, CHART_HEIGHT - CHART_INSET_Y];
}

function clampIndex(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

/** Gap threshold in normalizedX units (~1 hour on a 24h axis). */
const GAP_THRESHOLD = 1 / 24;

/**
 * Split coordinates into separate polyline segments wherever two
 * consecutive points have a normalizedX gap larger than GAP_THRESHOLD.
 */
function buildGappedPolylineSegments(
  points: { normalizedX?: number }[],
  coordinates: { x: number; y: number }[],
): string[] {
  if (!coordinates.length) {
    return [];
  }
  const segments: string[] = [];
  let current: string[] = [formatCoordinate(coordinates[0])];

  for (let i = 1; i < coordinates.length; i++) {
    const prevNX = points[i - 1].normalizedX ?? 0;
    const curNX = points[i].normalizedX ?? 0;
    if (curNX - prevNX > GAP_THRESHOLD) {
      segments.push(current.join(" "));
      current = [];
    }
    current.push(formatCoordinate(coordinates[i]));
  }

  if (current.length) {
    segments.push(current.join(" "));
  }
  return segments;
}

function formatCoordinate(c: { x: number; y: number }): string {
  return `${c.x},${c.y}`;
}

function LineVisual({
  accent,
  visual,
}: {
  accent: string;
  visual: Extract<DetailVisual, { type: "line" }>;
}) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const [chartWidth, setChartWidth] = React.useState(0);
  const [selectedIndex, setSelectedIndex] = React.useState(
    Math.max(visual.points.length - 1, 0),
  );
  const innerWidth = Math.max(chartWidth - CHART_INSET_X * 2, 0);
  const innerHeight = CHART_HEIGHT - CHART_INSET_Y * 2;
  const hasNormalizedX = visual.points.some(
    (point) => point.normalizedX != null,
  );
  const normalizedXValues = React.useMemo(
    () =>
      hasNormalizedX
        ? visual.points.map((point) => point.normalizedX)
        : undefined,
    [hasNormalizedX, visual.points],
  );
  const coordinates = React.useMemo(
    () =>
      innerWidth > 0
        ? buildChartCoordinates(
            visual.points.map((point) => ({
              label: point.label,
              value: point.value,
            })),
            innerWidth,
            innerHeight,
            normalizedXValues,
          ).map((coordinate) => ({
            x: coordinate.x + CHART_INSET_X,
            y: coordinate.y + CHART_INSET_Y,
          }))
        : [],
    [visual.points, innerWidth, innerHeight, normalizedXValues],
  );
  const selectedPoint =
    visual.points[clampIndex(selectedIndex, visual.points.length - 1)];
  const selectedCoordinate =
    coordinates[clampIndex(selectedIndex, coordinates.length - 1)];
  const polylineSegments = React.useMemo(
    () =>
      hasNormalizedX
        ? buildGappedPolylineSegments(visual.points, coordinates)
        : [buildPolylinePoints(coordinates)],
    [hasNormalizedX, visual.points, coordinates],
  );

  React.useEffect(() => {
    setSelectedIndex(Math.max(visual.points.length - 1, 0));
  }, [visual.points]);

  function handleLayout(event: LayoutChangeEvent): void {
    setChartWidth(event.nativeEvent.layout.width);
  }

  function updateSelection(locationX: number): void {
    if (visual.points.length <= 1 || innerWidth <= 0) {
      return;
    }

    if (hasNormalizedX) {
      // Find nearest point by x coordinate
      const adjustedX = locationX;
      let nearest = 0;
      let minDist = Infinity;
      for (let i = 0; i < coordinates.length; i++) {
        const dist = Math.abs(coordinates[i].x - adjustedX);
        if (dist < minDist) {
          minDist = dist;
          nearest = i;
        }
      }
      setSelectedIndex(clampIndex(nearest, visual.points.length - 1));
      return;
    }

    const relativeX = Math.max(
      0,
      Math.min(locationX - CHART_INSET_X, innerWidth),
    );
    const step = innerWidth / (visual.points.length - 1);
    const nextIndex = Math.round(relativeX / step);
    setSelectedIndex(clampIndex(nextIndex, visual.points.length - 1));
  }

  return (
    <View style={styles.visualBlock}>
      <View style={styles.visualHeader}>
        <Text style={[styles.visualValue, { color: accent }]}>
          {selectedPoint?.valueLabel ??
            visual.points.at(-1)?.valueLabel ??
            "--"}
        </Text>
        <Text style={[styles.visualCaption, { color: palette.textSecondary }]}>
          {selectedPoint?.label ?? visual.points.at(-1)?.label ?? ""}
        </Text>
      </View>
      <View
        onLayout={handleLayout}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) =>
          updateSelection(event.nativeEvent.locationX)
        }
        onResponderMove={(event) =>
          updateSelection(event.nativeEvent.locationX)
        }
        onStartShouldSetResponder={() => true}
        style={[
          styles.chartFrame,
          { backgroundColor: palette.card, borderColor: palette.border },
        ]}
      >
        <Svg
          height={CHART_HEIGHT}
          width="100%"
          viewBox={`0 0 ${Math.max(chartWidth, 1)} ${CHART_HEIGHT}`}
        >
          {buildGridYPositions().map((yPosition) => (
            <Line
              key={`grid-${yPosition}`}
              stroke={palette.border}
              strokeDasharray={
                yPosition === CHART_HEIGHT / 2 ? "3 6" : undefined
              }
              strokeWidth={1}
              x1={CHART_INSET_X}
              x2={Math.max(chartWidth - CHART_INSET_X, CHART_INSET_X)}
              y1={yPosition}
              y2={yPosition}
            />
          ))}
          {selectedCoordinate ? (
            <Line
              stroke={palette.textSecondary}
              strokeDasharray="3 6"
              strokeWidth={1}
              x1={selectedCoordinate.x}
              x2={selectedCoordinate.x}
              y1={CHART_INSET_Y}
              y2={CHART_HEIGHT - CHART_INSET_Y}
            />
          ) : null}
          {polylineSegments.map((segment, segmentIndex) => (
            <Polyline
              key={`segment-${segmentIndex}`}
              fill="none"
              points={segment}
              stroke={accent}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          ))}
          {coordinates.map((coordinate, index) => {
            const isSelected =
              index === clampIndex(selectedIndex, coordinates.length - 1);
            return (
              <Circle
                key={`${coordinate.x}-${coordinate.y}-${index}`}
                cx={coordinate.x}
                cy={coordinate.y}
                fill={isSelected ? accent : palette.background}
                r={isSelected ? 4 : 3}
                stroke={accent}
                strokeWidth={isSelected ? 2 : 1.5}
              />
            );
          })}
        </Svg>
      </View>
      <Text style={[styles.annotation, { color: palette.textSecondary }]}>
        {visual.annotation}
      </Text>
    </View>
  );
}

function DistributionVisual({
  accent,
  visual,
}: {
  accent: string;
  visual: Extract<DetailVisual, { type: "distribution" }>;
}) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const maxValue = React.useMemo(
    () => Math.max(...visual.bars.map((bar) => bar.value), 1),
    [visual.bars],
  );

  return (
    <View style={styles.visualBlock}>
      <View style={styles.distributionList}>
        {visual.bars.map((bar, index) => (
          <View
            key={`${bar.label}-${bar.value}-${index}`}
            style={styles.distributionRow}
          >
            <View style={styles.distributionHeader}>
              <Text
                numberOfLines={1}
                style={[
                  styles.distributionLabel,
                  { color: palette.foreground },
                ]}
              >
                {bar.label}
              </Text>
              <Text style={[styles.distributionValue, { color: accent }]}>
                {bar.valueLabel}
              </Text>
            </View>
            <View
              style={[
                styles.barTrack,
                { backgroundColor: palette.card, borderColor: palette.border },
              ]}
            >
              <View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: accent,
                    width: `${Math.max(8, (bar.value / maxValue) * 100)}%`,
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
      <Text style={[styles.annotation, { color: palette.textSecondary }]}>
        {visual.annotation}
      </Text>
    </View>
  );
}

function HeatmapVisual({
  visual,
}: {
  visual: Extract<DetailVisual, { type: "heatmap" }>;
}) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const groupedRows = React.useMemo(
    () =>
      visual.cells.reduce<Record<string, typeof visual.cells>>(
        (result, cell) => {
          result[cell.dayLabel] = [...(result[cell.dayLabel] ?? []), cell];
          return result;
        },
        {},
      ),
    [visual],
  );

  return (
    <View style={styles.visualBlock}>
      <View style={styles.heatmapGrid}>
        {Object.entries(groupedRows).map(([dayLabel, dayCells]) => (
          <View key={dayLabel} style={styles.heatmapRow}>
            <Text
              style={[styles.heatmapLabel, { color: palette.textSecondary }]}
            >
              {dayLabel}
            </Text>
            <View style={styles.heatmapCells}>
              {dayCells.map((cell) => (
                <View
                  key={`${dayLabel}-${cell.hourLabel}`}
                  style={[
                    styles.heatmapCell,
                    {
                      backgroundColor:
                        colorScheme === "light"
                          ? `rgba(47, 74, 58, ${0.12 + cell.value / 140})`
                          : `rgba(69, 123, 117, ${0.14 + cell.value / 140})`,
                      borderColor: palette.border,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
      <Text style={[styles.annotation, { color: palette.textSecondary }]}>
        {visual.annotation}
      </Text>
    </View>
  );
}

export function MetricDetailVisual({ tone, visual }: MetricDetailVisualProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const accent = getToneColor(tone, palette);

  if (!visual) {
    return null;
  }

  if (visual.type === "line") {
    return <LineVisual accent={accent} visual={visual} />;
  }

  if (visual.type === "distribution") {
    return <DistributionVisual accent={accent} visual={visual} />;
  }

  return <HeatmapVisual visual={visual} />;
}

const styles = StyleSheet.create({
  annotation: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  barFill: {
    borderRadius: 999,
    height: "100%",
  },
  barTrack: {
    borderRadius: 999,
    borderWidth: 1,
    height: 10,
    overflow: "hidden",
  },
  chartFrame: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  distributionHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: Spacing.md,
    justifyContent: "space-between",
  },
  distributionLabel: {
    flex: 1,
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
  },
  distributionList: {
    gap: Spacing.md,
  },
  distributionRow: {
    gap: Spacing.xs,
  },
  distributionValue: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.sm,
  },
  heatmapCell: {
    aspectRatio: 1,
    borderRadius: 7,
    borderWidth: 1,
    flex: 1,
  },
  heatmapCells: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.xs,
  },
  heatmapGrid: {
    gap: Spacing.sm,
  },
  heatmapLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    width: 28,
  },
  heatmapRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  visualBlock: {
    gap: Spacing.md,
  },
  visualCaption: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  visualHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  visualValue: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.xl,
  },
});

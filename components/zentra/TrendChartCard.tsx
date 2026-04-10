import React from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { Card } from "@/components/ui/Card";
import {
  Colors,
  Fonts,
  FontSizes,
  Spacing,
  type AppPalette,
} from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { TrendSeries } from "@/types/zentra";
import { buildChartCoordinates, buildPolylinePoints } from "@/utils/charts";

interface TrendChartCardProps {
  series: TrendSeries;
}

const CHART_HEIGHT = 108;
const CHART_INSET_X = 8;
const CHART_INSET_Y = 10;

function getSeriesColor(series: TrendSeries, palette: AppPalette): string {
  switch (series.tone) {
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

export function TrendChartCard({ series }: TrendChartCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const stroke = getSeriesColor(series, palette);
  const [chartWidth, setChartWidth] = React.useState(0);
  const [selectedIndex, setSelectedIndex] = React.useState(
    Math.max(series.points.length - 1, 0),
  );
  const innerWidth = Math.max(chartWidth - CHART_INSET_X * 2, 0);
  const innerHeight = CHART_HEIGHT - CHART_INSET_Y * 2;
  const coordinates =
    innerWidth > 0
      ? buildChartCoordinates(series.points, innerWidth, innerHeight).map(
          (coordinate) => ({
            ...coordinate,
            x: coordinate.x + CHART_INSET_X,
            y: coordinate.y + CHART_INSET_Y,
          }),
        )
      : [];
  const polyline = buildPolylinePoints(coordinates);
  const selectedPoint =
    series.points[
      Math.max(0, Math.min(selectedIndex, series.points.length - 1))
    ];
  const selectedCoordinate =
    coordinates[Math.max(0, Math.min(selectedIndex, coordinates.length - 1))];

  React.useEffect(() => {
    setSelectedIndex(Math.max(series.points.length - 1, 0));
  }, [series.points]);

  function handleLayout(event: LayoutChangeEvent): void {
    setChartWidth(event.nativeEvent.layout.width);
  }

  function updateSelection(locationX: number): void {
    if (series.points.length <= 1 || innerWidth <= 0) {
      return;
    }

    const relativeX = Math.max(
      0,
      Math.min(locationX - CHART_INSET_X, innerWidth),
    );
    const step = innerWidth / (series.points.length - 1);
    const nextIndex = Math.round(relativeX / step);
    setSelectedIndex(
      Math.max(0, Math.min(nextIndex, series.points.length - 1)),
    );
  }

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        {series.label}
      </Text>
      <View style={styles.metaRow}>
        <Text style={[styles.metric, { color: stroke }]}>
          {selectedPoint?.value ?? series.points.at(-1)?.value ?? 0}
          <Text style={[styles.unit, { color: palette.textSecondary }]}>
            {" "}
            {series.unit}
          </Text>
        </Text>
        <Text style={[styles.change, { color: palette.textSecondary }]}>
          {selectedPoint?.label ?? series.points.at(-1)?.label ?? ""}
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
      >
        <Svg
          height={CHART_HEIGHT}
          width="100%"
          viewBox={`0 0 ${Math.max(chartWidth, 1)} ${CHART_HEIGHT}`}
        >
          {[CHART_INSET_Y, CHART_HEIGHT / 2, CHART_HEIGHT - CHART_INSET_Y].map(
            (yPosition) => (
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
            ),
          )}
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
          <Polyline
            fill="none"
            points={polyline}
            stroke={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
          {coordinates.map((coordinate, index) => {
            const isSelected =
              index ===
              Math.max(0, Math.min(selectedIndex, coordinates.length - 1));
            return (
              <Circle
                key={`${coordinate.x}-${coordinate.y}-${index}`}
                cx={coordinate.x}
                cy={coordinate.y}
                fill={isSelected ? stroke : palette.background}
                r={isSelected ? 4 : 3}
                stroke={stroke}
                strokeWidth={isSelected ? 2 : 1.5}
              />
            );
          })}
        </Svg>
      </View>
      <Text style={[styles.submeta, { color: palette.textSecondary }]}>
        {series.change}% change · {series.variability}% variability
      </Text>
      <View style={styles.labelsRow}>
        <Text style={[styles.caption, { color: palette.mutedForeground }]}>
          {series.points[0]?.label}
        </Text>
        <Text style={[styles.caption, { color: palette.mutedForeground }]}>
          {series.points.at(-1)?.label}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
  },
  metaRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  metric: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes["2xl"],
  },
  unit: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.sm,
  },
  change: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  submeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.1,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
  },
  caption: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
  },
});

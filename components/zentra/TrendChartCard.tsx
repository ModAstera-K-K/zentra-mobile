import React from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

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
import {
  buildChartCoordinates,
  buildPolylineSegments,
  pickAxisLabelIndices,
} from "@/utils/charts";

interface TrendChartCardProps {
  series: TrendSeries;
}

const CHART_HEIGHT_COMPACT = 108;
const CHART_HEIGHT_EXPANDED = 216;
const CHART_INSET_X = 8;
const CHART_INSET_Y = 10;
const X_AXIS_HEIGHT = 18;

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

function getChangeLabel(change: number | null): string {
  if (change === null) return "Not comparable";
  if (change > 0) return `↑${change}%`;
  if (change < 0) return `↓${Math.abs(change)}%`;
  return "0%";
}

export const TrendChartCard = React.memo(function TrendChartCard({
  series,
}: TrendChartCardProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const stroke = getSeriesColor(series, palette);
  const [chartWidth, setChartWidth] = React.useState(0);
  const [expanded, setExpanded] = React.useState(false);
  const chartHeight = expanded ? CHART_HEIGHT_EXPANDED : CHART_HEIGHT_COMPACT;
  const [selectedIndex, setSelectedIndex] = React.useState(
    Math.max(series.points.length - 1, 0),
  );
  const innerWidth = Math.max(chartWidth - CHART_INSET_X * 2, 0);
  const innerHeight = chartHeight - CHART_INSET_Y * 2;
  const coordinates = React.useMemo(
    () =>
      innerWidth > 0
        ? buildChartCoordinates(series.points, innerWidth, innerHeight).map(
            (coordinate) => ({
              ...coordinate,
              x: coordinate.x + CHART_INSET_X,
              y: coordinate.y + CHART_INSET_Y,
            }),
          )
        : [],
    [series.points, innerWidth, innerHeight],
  );
  const polyline = React.useMemo(
    () => buildPolylineSegments(coordinates),
    [coordinates],
  );
  const axisLabelIndices = React.useMemo(
    () => pickAxisLabelIndices(series.points.length),
    [series.points.length],
  );
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
    <Card variant="open">
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        {series.label}
      </Text>
      <View style={styles.metaRow}>
        <Text style={[styles.metric, { color: stroke }]}>
          {selectedPoint?.value ?? "—"}
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
          height={chartHeight + X_AXIS_HEIGHT}
          width="100%"
          viewBox={`0 0 ${Math.max(chartWidth, 1)} ${chartHeight + X_AXIS_HEIGHT}`}
        >
          {[CHART_INSET_Y, chartHeight / 2, chartHeight - CHART_INSET_Y].map(
            (yPosition) => (
              <Line
                key={`grid-${yPosition}`}
                stroke={palette.border}
                strokeDasharray={
                  yPosition === chartHeight / 2 ? "3 6" : undefined
                }
                strokeWidth={1}
                x1={CHART_INSET_X}
                x2={Math.max(chartWidth - CHART_INSET_X, CHART_INSET_X)}
                y1={yPosition}
                y2={yPosition}
              />
            ),
          )}
          {selectedCoordinate && Number.isFinite(selectedCoordinate.y) ? (
            <Line
              stroke={palette.textSecondary}
              strokeDasharray="3 6"
              strokeWidth={1}
              x1={selectedCoordinate.x}
              x2={selectedCoordinate.x}
              y1={CHART_INSET_Y}
              y2={chartHeight - CHART_INSET_Y}
            />
          ) : null}
          {polyline.map((points, index) => (
            <Polyline
              key={index}
              fill="none"
              points={points}
              stroke={stroke}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          ))}
          {coordinates.map((coordinate, index) => {
            if (!Number.isFinite(coordinate.y)) return null;
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
          {axisLabelIndices.map((labelIndex) => {
            const coord = coordinates[labelIndex];
            const point = series.points[labelIndex];
            if (!coord || !point) return null;
            const isFirst = labelIndex === 0;
            const isLast = labelIndex === series.points.length - 1;
            return (
              <SvgText
                key={`x-label-${labelIndex}`}
                fill={palette.mutedForeground}
                fontFamily={Fonts.body}
                fontSize={9}
                textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
                x={coord.x}
                y={chartHeight + X_AXIS_HEIGHT - 4}
              >
                {point.label}
              </SvgText>
            );
          })}
        </Svg>
      </View>
      <View style={styles.submetaRow}>
        {series.change !== null && (
          <Text style={[styles.submeta, { color: palette.textSecondary }]}>
            {getChangeLabel(series.change)} between endpoints
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? "Compact" : "Expand"} ${series.label} chart`}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          style={styles.expandToggle}
        >
          <Text style={[styles.submeta, { color: palette.mutedForeground }]}>
            {expanded ? "Compact" : "Expand"}
          </Text>
        </Pressable>
        <Text style={[styles.submeta, { color: palette.textSecondary }]}>
          {series.variability}% variability
        </Text>
      </View>
      {series.coverageLabel ? (
        <Text
          style={[styles.coverageLabel, { color: palette.mutedForeground }]}
        >
          {series.coverageLabel}
        </Text>
      ) : null}
      {series.sourceLabel ? (
        <Text style={[styles.sourceLabel, { color: palette.mutedForeground }]}>
          {series.sourceLabel}
        </Text>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 20,
    letterSpacing: 0,
    marginBottom: Spacing.md,
  },
  metaRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  metric: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes["2xl"],
  },
  unit: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
  },
  change: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
  submeta: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
  submetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  coverageLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  expandToggle: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  sourceLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.xs,
    letterSpacing: 0,
  },
});

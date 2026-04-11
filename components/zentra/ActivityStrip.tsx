import React from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { EmptyState } from "@/components/zentra/EmptyState";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import {
  Colors,
  Fonts,
  FontSizes,
  Spacing,
  type AppPalette,
} from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { UnifiedTimelineBucket } from "@/types/zentra";
import { buildChartCoordinates, buildPolylinePoints } from "@/utils/charts";

interface ActivityStripProps {
  buckets: UnifiedTimelineBucket[];
}

type ActivityMode = "movement" | "screen" | "rest";

const MODE_OPTIONS: Array<{ key: ActivityMode; label: string }> = [
  { key: "movement", label: "Movement" },
  { key: "screen", label: "Screen" },
  { key: "rest", label: "Rest" },
];

const CHART_HEIGHT = 120;
const CHART_INSET_X = 8;
const CHART_INSET_Y = 10;

function getModeColor(mode: ActivityMode, palette: AppPalette): string {
  switch (mode) {
    case "movement":
      return palette.signalPhysical;
    case "screen":
      return palette.signalCool;
    default:
      return palette.signalHuman;
  }
}

function getModeValue(
  bucket: UnifiedTimelineBucket,
  mode: ActivityMode,
): number {
  switch (mode) {
    case "movement":
      return bucket.steps;
    case "screen":
      return bucket.screenScore;
    default:
      return bucket.restScore;
  }
}

function getModeUnit(mode: ActivityMode): string {
  switch (mode) {
    case "movement":
      return "steps/hr";
    case "screen":
      return "score";
    default:
      return "score";
  }
}

function getSummaryCopy(mode: ActivityMode): string {
  switch (mode) {
    case "movement":
      return "See your steps per hour through the day.";
    case "screen":
      return "Explore your screen-heavy stretches.";
    default:
      return "Find the quieter parts of your day.";
  }
}

function getInitialSelectedIndex(
  buckets: UnifiedTimelineBucket[],
  mode: ActivityMode,
): number {
  const selected = buckets
    .map((bucket, index) => ({ index, value: getModeValue(bucket, mode) }))
    .sort((left, right) => right.value - left.value)[0];

  return selected?.index ?? 0;
}

function buildPoints(
  buckets: UnifiedTimelineBucket[],
  mode: ActivityMode,
): Array<{ label: string; value: number }> {
  return buckets.map((bucket) => ({
    label: bucket.label,
    value: getModeValue(bucket, mode),
  }));
}

export function ActivityStrip({ buckets }: ActivityStripProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const [mode, setMode] = React.useState<ActivityMode>("movement");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [chartWidth, setChartWidth] = React.useState(0);
  const accent = getModeColor(mode, palette);

  const points = React.useMemo(
    () => buildPoints(buckets, mode),
    [buckets, mode],
  );

  const innerWidth = Math.max(chartWidth - CHART_INSET_X * 2, 0);
  const innerHeight = CHART_HEIGHT - CHART_INSET_Y * 2;
  const coordinates = React.useMemo(
    () =>
      innerWidth > 0
        ? buildChartCoordinates(points, innerWidth, innerHeight).map(
            (coordinate) => ({
              ...coordinate,
              x: coordinate.x + CHART_INSET_X,
              y: coordinate.y + CHART_INSET_Y,
            }),
          )
        : [],
    [points, innerWidth, innerHeight],
  );
  const polyline = React.useMemo(
    () => buildPolylinePoints(coordinates),
    [coordinates],
  );

  React.useEffect(() => {
    setSelectedIndex(getInitialSelectedIndex(buckets, mode));
  }, [buckets, mode]);

  if (!buckets.length || !buckets.some((bucket) => bucket.hasAnyData)) {
    return (
      <EmptyState
        body="Turn on the Activity or Location collector in Settings. Your rhythm through the day will appear here."
        title="No daily rhythm yet"
      />
    );
  }

  const clampedIndex = Math.max(0, Math.min(selectedIndex, buckets.length - 1));
  const selectedBucket = buckets[clampedIndex];
  const selectedValue = getModeValue(selectedBucket, mode);
  const selectedCoordinate =
    coordinates[Math.max(0, Math.min(clampedIndex, coordinates.length - 1))];

  function handleLayout(event: LayoutChangeEvent): void {
    setChartWidth(event.nativeEvent.layout.width);
  }

  function updateSelection(locationX: number): void {
    if (points.length <= 1 || innerWidth <= 0) {
      return;
    }

    const relativeX = Math.max(
      0,
      Math.min(locationX - CHART_INSET_X, innerWidth),
    );
    const step = innerWidth / (points.length - 1);
    const nextIndex = Math.round(relativeX / step);
    setSelectedIndex(Math.max(0, Math.min(nextIndex, points.length - 1)));
  }

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        Daily rhythm
      </Text>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCopy}>
          <Text style={[styles.summaryValue, { color: accent }]}>
            {selectedBucket.label}
          </Text>
          <Text style={[styles.summaryBody, { color: palette.textSecondary }]}>
            {getSummaryCopy(mode)}
          </Text>
        </View>
        <View style={styles.summaryMeta}>
          <Text style={[styles.summaryMetric, { color: accent }]}>
            {selectedValue}
          </Text>
          <Text
            style={[styles.summaryCaption, { color: palette.textSecondary }]}
          >
            {getModeUnit(mode)}
          </Text>
        </View>
      </View>

      <View style={styles.modeRow}>
        {MODE_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            active={option.key === mode}
            label={option.label}
            onPress={() => setMode(option.key)}
          />
        ))}
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
            stroke={accent}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
          {coordinates.map((coordinate, index) => {
            const isSelected = index === clampedIndex;

            return isSelected ? (
              <Circle
                key={`dot-${index}`}
                cx={coordinate.x}
                cy={coordinate.y}
                fill={accent}
                r={4}
              />
            ) : null;
          })}
        </Svg>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.3,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  summaryBody: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  summaryCaption: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  summaryCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  summaryMeta: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  summaryMetric: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.xl,
  },
  summaryRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: Spacing.md,
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  summaryValue: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.base,
  },
});

import React from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

import { EmptyState } from "@/components/zentra/EmptyState";
import { Card } from "@/components/ui/Card";
import {
  Colors,
  Fonts,
  FontSizes,
  Spacing,
  type AppPalette,
} from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { UnifiedTimelineBucket } from "@/types/zentra";
import {
  buildChartCoordinates,
  buildPolylinePoints,
  pickAxisLabelIndices,
} from "@/utils/charts";

interface ActivityStripProps {
  buckets: UnifiedTimelineBucket[];
}

type ActivityMode = "movement" | "screen" | "rest";

const MODES: { key: ActivityMode; label: string; unit: string }[] = [
  { key: "movement", label: "Movement", unit: "/ 100" },
  { key: "screen", label: "Screen", unit: "/ 100" },
  { key: "rest", label: "Rest", unit: "/ 100" },
];

const CHART_HEIGHT = 140;
const CHART_INSET_X = 8;
const CHART_INSET_Y = 10;
const X_AXIS_HEIGHT = 18;

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

function getNormalizedModeValue(
  bucket: UnifiedTimelineBucket,
  mode: ActivityMode,
): number {
  switch (mode) {
    case "movement":
      return bucket.intensityScore;
    case "screen":
      return bucket.normalizedScreenScore;
    default:
      return bucket.restCompositeScore;
  }
}

function buildNormalizedPoints(
  buckets: UnifiedTimelineBucket[],
  mode: ActivityMode,
): { label: string; value: number }[] {
  return buckets.map((bucket) => ({
    label: bucket.label,
    value: getNormalizedModeValue(bucket, mode),
  }));
}

function getInitialSelectedIndex(buckets: UnifiedTimelineBucket[]): number {
  const now = Date.now();
  const currentBucketIndex = buckets.findIndex((bucket) => {
    const start = new Date(bucket.timestampStart).getTime();
    const end = new Date(bucket.timestampEnd).getTime();
    return now >= start && now < end;
  });

  if (currentBucketIndex >= 0) {
    return currentBucketIndex;
  }

  const latestStartedBucketIndex = buckets.reduce<number>(
    (best, bucket, index) => {
      const start = new Date(bucket.timestampStart).getTime();
      if (start <= now) {
        return index;
      }
      return best;
    },
    -1,
  );

  return latestStartedBucketIndex >= 0 ? latestStartedBucketIndex : 0;
}

export const ActivityStrip = React.memo(function ActivityStrip({
  buckets,
}: ActivityStripProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [chartWidth, setChartWidth] = React.useState(0);

  const innerWidth = Math.max(chartWidth - CHART_INSET_X * 2, 0);
  const innerHeight = CHART_HEIGHT - CHART_INSET_Y * 2;

  const seriesData = React.useMemo(() => {
    return MODES.map((m) => ({
      ...m,
      points: buildNormalizedPoints(buckets, m.key),
    }));
  }, [buckets]);

  const seriesCoordinates = React.useMemo(() => {
    if (innerWidth <= 0)
      return MODES.map(() => [] as { x: number; y: number }[]);
    const sharedRange = { min: 0, max: 100 };
    return seriesData.map((s) =>
      buildChartCoordinates(
        s.points,
        innerWidth,
        innerHeight,
        undefined,
        sharedRange,
      ).map((c) => ({
        x: c.x + CHART_INSET_X,
        y: c.y + CHART_INSET_Y,
      })),
    );
  }, [seriesData, innerWidth, innerHeight]);

  const seriesPolylines = React.useMemo(
    () => seriesCoordinates.map((coords) => buildPolylinePoints(coords)),
    [seriesCoordinates],
  );

  const axisLabelIndices = React.useMemo(
    () => pickAxisLabelIndices(buckets.length),
    [buckets.length],
  );

  const movementCoordinates = seriesCoordinates[0] ?? [];

  React.useEffect(() => {
    setSelectedIndex(getInitialSelectedIndex(buckets));
  }, [buckets]);

  if (!buckets.length || !buckets.some((bucket) => bucket.hasAnyData)) {
    return (
      <EmptyState
        body="Turn on the Activity or Location collector in Settings. Your rhythm through the day will appear here."
        iconName="pulse-outline"
        title="No daily rhythm yet"
      />
    );
  }

  const clampedIndex = Math.max(0, Math.min(selectedIndex, buckets.length - 1));
  const selectedBucket = buckets[clampedIndex];
  const selectedX =
    movementCoordinates[
      Math.max(0, Math.min(clampedIndex, movementCoordinates.length - 1))
    ]?.x;

  function handleLayout(event: LayoutChangeEvent): void {
    setChartWidth(event.nativeEvent.layout.width);
  }

  function updateSelection(locationX: number): void {
    if (buckets.length <= 1 || innerWidth <= 0) {
      return;
    }

    const relativeX = Math.max(
      0,
      Math.min(locationX - CHART_INSET_X, innerWidth),
    );
    const step = innerWidth / (buckets.length - 1);
    const nextIndex = Math.round(relativeX / step);
    setSelectedIndex(Math.max(0, Math.min(nextIndex, buckets.length - 1)));
  }

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        Daily rhythm
      </Text>

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
          height={CHART_HEIGHT + X_AXIS_HEIGHT}
          width="100%"
          viewBox={`0 0 ${Math.max(chartWidth, 1)} ${CHART_HEIGHT + X_AXIS_HEIGHT}`}
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
          {selectedX != null ? (
            <Line
              stroke={palette.textSecondary}
              strokeDasharray="3 6"
              strokeWidth={1}
              x1={selectedX}
              x2={selectedX}
              y1={CHART_INSET_Y}
              y2={CHART_HEIGHT - CHART_INSET_Y}
            />
          ) : null}
          {MODES.map((m, modeIndex) => (
            <Polyline
              key={m.key}
              fill="none"
              points={seriesPolylines[modeIndex]}
              stroke={getModeColor(m.key, palette)}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.85}
              strokeWidth={1.5}
            />
          ))}
          {MODES.map((m, modeIndex) => {
            const coords = seriesCoordinates[modeIndex];
            const coord =
              coords[Math.max(0, Math.min(clampedIndex, coords.length - 1))];
            if (!coord) return null;
            return (
              <Circle
                key={`dot-${m.key}`}
                cx={coord.x}
                cy={coord.y}
                fill={getModeColor(m.key, palette)}
                r={3.5}
              />
            );
          })}
          {axisLabelIndices.map((labelIndex) => {
            const coord = movementCoordinates[labelIndex];
            const bucket = buckets[labelIndex];
            if (!coord || !bucket) return null;
            const isFirst = labelIndex === 0;
            const isLast = labelIndex === buckets.length - 1;
            return (
              <SvgText
                key={`x-label-${labelIndex}`}
                fill={palette.mutedForeground}
                fontFamily="JetBrainsMonoRegular"
                fontSize={9}
                textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
                x={coord.x}
                y={CHART_HEIGHT + X_AXIS_HEIGHT - 4}
              >
                {bucket.label}
              </SvgText>
            );
          })}
        </Svg>
      </View>

      <View style={styles.legendRow}>
        <Text style={[styles.selectedLabel, { color: palette.foreground }]}>
          {selectedBucket.label}
        </Text>
        {MODES.map((m) => {
          const color = getModeColor(m.key, palette);
          const value = getNormalizedModeValue(selectedBucket, m.key);
          return (
            <View key={m.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={[styles.legendValue, { color }]}>{value}/100</Text>
              <Text
                style={[styles.legendLabel, { color: palette.textSecondary }]}
              >
                {m.label}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 1.3,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
  },
  legendDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.xs,
  },
  legendLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    letterSpacing: 0.6,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  legendValue: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.xs,
  },
  selectedLabel: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSizes.sm,
    marginRight: Spacing.xs,
  },
});

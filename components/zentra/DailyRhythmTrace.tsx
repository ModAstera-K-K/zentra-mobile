import React from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

import { Colors, Fonts, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  buildChartCoordinates,
  buildPolylineSegments,
  pickAxisLabelIndices,
} from "@/utils/charts";
import { rhythmIndexAtPosition } from "@/utils/daily-rhythm-presentation";

const HEIGHT = 64;
const INSET = 6;
const AXIS_HEIGHT = 22;

interface DailyRhythmTraceProps {
  label: string;
  color: string;
  points: { label: string; value: number | null }[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  showAxis: boolean;
}

export const DailyRhythmTrace = React.memo(function DailyRhythmTrace({
  label, color, points, selectedIndex, onSelect, showAxis,
}: DailyRhythmTraceProps) {
  const palette = Colors[useColorScheme()];
  const [width, setWidth] = React.useState(0);
  const innerWidth = Math.max(0, width - INSET * 2);
  const coordinates = React.useMemo(
    () => buildChartCoordinates(
      points, innerWidth, HEIGHT - INSET * 2, undefined, { min: 0, max: 100 },
    ).map(point => ({ x: point.x + INSET, y: point.y + INSET })),
    [points, innerWidth],
  );
  const segments = React.useMemo(() => buildPolylineSegments(coordinates), [coordinates]);
  const labels = React.useMemo(() => pickAxisLabelIndices(points.length), [points.length]);
  const selectAt = React.useCallback(
    (x: number) => onSelect(rhythmIndexAtPosition(x - INSET, innerWidth, points.length)),
    [innerWidth, onSelect, points.length],
  );
  const pan = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: event => selectAt(event.nativeEvent.locationX),
    onPanResponderMove: event => selectAt(event.nativeEvent.locationX),
  }), [selectAt]);
  const selected = points[selectedIndex];
  const position = coordinates[selectedIndex];
  const value = selected?.value;
  const readout = value == null ? "No data" : `${Math.round(value)} / 100`;

  return (
    <View style={styles.trace}>
      <View style={styles.header}>
        <Text style={[styles.label, { color }]}>{label}</Text>
        <Text style={[styles.readout, { color }]}>{readout}</Text>
      </View>
      <View {...pan.panHandlers}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, points.length - 1)}
          aria-valuenow={selectedIndex}
          aria-valuetext={`${selected?.label ?? ""}, ${readout}`}
          accessibilityHint="Swipe up or down to inspect an adjacent hour"
          accessibilityActions={[
            { name: "increment", label: "Next hour" },
            { name: "decrement", label: "Previous hour" },
          ]}
          onAccessibilityAction={event => onSelect(Math.max(0, Math.min(
            points.length - 1,
            selectedIndex + (event.nativeEvent.actionName === "increment" ? 1 : -1),
          )))}
          onLayout={event => setWidth(event.nativeEvent.layout.width)}
          onPress={event => {
            if (Number.isFinite(event.nativeEvent.locationX)) selectAt(event.nativeEvent.locationX);
          }}
        >
          <Svg
            accessible={false}
            height={HEIGHT + (showAxis ? AXIS_HEIGHT : 0)}
            width="100%"
            viewBox={`0 0 ${Math.max(width, 1)} ${HEIGHT + (showAxis ? AXIS_HEIGHT : 0)}`}
          >
            {[INSET, HEIGHT - INSET].map(y => (
              <Line key={y} x1={INSET} x2={Math.max(INSET, width - INSET)}
                y1={y} y2={y} stroke={palette.border} strokeWidth={1} />
            ))}
            {position ? (
              <Line x1={position.x} x2={position.x} y1={INSET} y2={HEIGHT - INSET}
                stroke={palette.textSecondary} strokeWidth={1} strokeDasharray="3 4" />
            ) : null}
            {segments.map((segment, index) => (
              <Polyline key={index} points={segment} stroke={color} strokeWidth={1.8}
                strokeLinejoin="round" strokeLinecap="round" fill="none" />
            ))}
            {coordinates.map((point, index) => {
              if (!Number.isFinite(point.y)) return null;
              const isolated = !Number.isFinite(coordinates[index - 1]?.y)
                && !Number.isFinite(coordinates[index + 1]?.y);
              if (!isolated && index !== selectedIndex) return null;
              return <Circle key={index} cx={point.x} cy={point.y}
                r={index === selectedIndex ? 3.5 : 2} fill={color} />;
            })}
            {showAxis ? labels.map(index => (
              <SvgText key={index} x={coordinates[index]?.x ?? INSET} y={HEIGHT + AXIS_HEIGHT - 3}
                textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
                fill={palette.textSecondary} fontFamily={Fonts.body} fontSize={11}>
                {points[index]?.label}
              </SvgText>
            )) : null}
          </Svg>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  trace: { gap: Spacing.xs },
  header: { flexDirection: "row", justifyContent: "space-between", gap: Spacing.sm },
  label: { fontFamily: Fonts.bodyMedium, fontWeight: "500", fontSize: 13 },
  readout: { fontFamily: Fonts.body, fontSize: 13, fontVariant: ["tabular-nums"] },
});

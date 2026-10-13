import React from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const SEGMENT = 0.35;

/**
 * A 2pt line that is always laid out and only drawn while `active`, so a
 * screen-wide "working" cue never moves the content under it.
 */
export const ProgressLine = React.memo(function ProgressLine({
  active,
}: {
  active: boolean;
}) {
  const palette = Colors[useColorScheme()];
  const [width, setWidth] = React.useState(0);
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const progress = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  React.useEffect(() => {
    if (!active || reduceMotion || !width) return;
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        // Not an interaction: it must not hold back work waiting on those.
        isInteraction: false,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, progress, reduceMotion, width]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={styles.track}
    >
      {active ? (
        reduceMotion ? (
          <View style={[styles.still, { backgroundColor: palette.primary }]} />
        ) : (
          <Animated.View
            style={[
              styles.segment,
              {
                backgroundColor: palette.primary,
                transform: [
                  {
                    translateX: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-width * SEGMENT, width],
                    }),
                  },
                ],
              },
            ]}
          />
        )
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  track: { borderRadius: 2, height: 2, overflow: "hidden", width: "100%" },
  segment: { borderRadius: 2, height: 2, width: `${SEGMENT * 100}%` },
  still: { borderRadius: 2, height: 2, opacity: 0.5, width: "100%" },
});

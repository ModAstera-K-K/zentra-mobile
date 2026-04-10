import React from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ToggleProps {
  accessibilityLabel?: string;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
  style?: StyleProp<ViewStyle>;
  value: boolean;
}

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 30;
const KNOB_SIZE = 22;
const TRACK_PADDING = 4;

export function Toggle({
  accessibilityLabel,
  disabled = false,
  onValueChange,
  style,
  value,
}: ToggleProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const progress = React.useRef(new Animated.Value(value ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.spring(progress, {
      toValue: value ? 1 : 0,
      damping: 16,
      mass: 0.8,
      stiffness: 180,
      useNativeDriver: true,
    }).start();
  }, [progress, value]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [TRACK_PADDING, TRACK_WIDTH - KNOB_SIZE - TRACK_PADDING],
  });

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [style, pressed && !disabled ? styles.pressed : null]}
    >
      <Animated.View
        style={[
          styles.track,
          {
            backgroundColor: value ? palette.primary : palette.border,
            borderColor: value ? palette.primary : palette.border,
            opacity: disabled ? 0.45 : 1,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.knob,
            {
              backgroundColor: value ? palette.primaryForeground : palette.background,
              transform: [{ translateX }],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: 999,
    borderWidth: 1,
    height: TRACK_HEIGHT,
    justifyContent: 'center',
    width: TRACK_WIDTH,
  },
  knob: {
    borderRadius: 999,
    height: KNOB_SIZE,
    position: 'absolute',
    width: KNOB_SIZE,
  },
  pressed: {
    opacity: 0.88,
  },
});

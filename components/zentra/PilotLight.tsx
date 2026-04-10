import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface PilotLightProps {
  size?: number;
}

export function PilotLight({ size = 10 }: PilotLightProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];
  const animatedScale = React.useRef(new Animated.Value(1)).current;
  const animatedOpacity = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(animatedScale, {
            toValue: 1.12,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(animatedScale, {
            toValue: 1,
            duration: 1400,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(animatedOpacity, {
            toValue: 0.62,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(animatedOpacity, {
            toValue: 1,
            duration: 1400,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [animatedOpacity, animatedScale]);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          height: size * 2.3,
          width: size * 2.3,
          backgroundColor: palette.halo,
          opacity: animatedOpacity,
          transform: [{ scale: animatedScale }],
        },
      ]}
    >
      <View
        style={[
          styles.dot,
          {
            height: size,
            width: size,
            backgroundColor: palette.primary,
            shadowColor: palette.primary,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
  },
  dot: {
    borderRadius: 999,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
  },
});


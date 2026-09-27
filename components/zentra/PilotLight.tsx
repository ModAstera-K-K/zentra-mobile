import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface PilotLightProps { size?: number }

/** A static status cue. An interaction loop would hold deferred screen work open. */
export function PilotLight({ size = 10 }: PilotLightProps) {
  const palette = Colors[useColorScheme()];
  return <View accessible={false} style={[styles.dot, { height: size, width: size, backgroundColor: palette.primary }]} />;
}

const styles = StyleSheet.create({ dot: { borderRadius: 999 } });

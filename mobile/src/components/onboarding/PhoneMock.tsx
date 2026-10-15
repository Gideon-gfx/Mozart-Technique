import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import DeviceGlassOverlay from './DeviceGlassOverlay';
import type { ThemeColors } from '../../theme/colors';

interface Props {
  colors: ThemeColors;
  children?: React.ReactNode;
  screenBackground?: string;
  style?: ViewStyle;
}

const WIDTH = 112;
const HEIGHT = 230;

// A real phone silhouette - dynamic-island camera, protruding side buttons,
// rounded-glass corners - not a plain rounded rectangle. Frame color comes
// from colors.deviceFrame (dark on the light theme, silver on the dark
// theme, per the deliberate swap the rest of the onboarding design uses).
export default function PhoneMock({ colors, children, screenBackground, style }: Props) {
  return (
    <View style={[styles.shell, style]}>
      <LinearGradient
        colors={colors.deviceFrame}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[styles.frame, { shadowColor: colors.deviceShadow }]}
      >
        <View style={[styles.sideButton, styles.power, { backgroundColor: colors.deviceFrame[1] }]} />
        <View style={[styles.sideButton, styles.volume, { backgroundColor: colors.deviceFrame[1] }]} />
        <View style={[styles.screen, { backgroundColor: screenBackground || '#141414' }]}>
          {children}
          <DeviceGlassOverlay />
        </View>
        <View style={styles.island} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { width: WIDTH, height: HEIGHT },
  frame: {
    flex: 1,
    borderRadius: 32,
    padding: 4,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 22,
    elevation: 14,
  },
  screen: { flex: 1, borderRadius: 28, overflow: 'hidden' },
  island: {
    position: 'absolute',
    top: 11,
    left: '50%',
    marginLeft: -18,
    width: 36,
    height: 10,
    borderRadius: 7,
    backgroundColor: '#000',
  },
  sideButton: {
    position: 'absolute',
    width: 3,
    borderRadius: 2,
  },
  power: { right: -2.5, top: 64, height: 34 },
  volume: { left: -2.5, top: 52, height: 34 },
});

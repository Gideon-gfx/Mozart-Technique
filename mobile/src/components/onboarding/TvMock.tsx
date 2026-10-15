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

export default function TvMock({ colors, children, screenBackground, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <LinearGradient
        colors={colors.deviceFrame}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[styles.screenWrap, { shadowColor: colors.deviceShadow }]}
      >
        <View style={[styles.screen, { backgroundColor: screenBackground || '#141414' }]}>
          {children}
          <DeviceGlassOverlay />
        </View>
      </LinearGradient>
      <View style={[styles.neck, { backgroundColor: colors.deviceFrame[1] }]} />
      <View style={[styles.stand, { backgroundColor: colors.deviceFrame[1] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  screenWrap: {
    width: 190,
    height: 114,
    borderRadius: 9,
    padding: 5,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  screen: { flex: 1, borderRadius: 4, overflow: 'hidden' },
  neck: { width: 8, height: 18 },
  stand: { width: 64, height: 5, borderRadius: 3, marginTop: -1 },
});

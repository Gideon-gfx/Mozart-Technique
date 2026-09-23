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

export default function LaptopMock({ colors, children, screenBackground, style }: Props) {
  return (
    <View style={style}>
      <LinearGradient
        colors={colors.deviceFrame}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[styles.screenWrap, { shadowColor: colors.deviceShadow }]}
      >
        <View style={styles.cam} />
        <View style={[styles.screen, { backgroundColor: screenBackground || '#141414' }]}>
          {children}
          <DeviceGlassOverlay />
        </View>
      </LinearGradient>
      <LinearGradient colors={colors.deviceFrame} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.base}>
        <View style={styles.notch2} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    width: 224,
    height: 146,
    borderRadius: 13,
    padding: 9,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 10,
  },
  cam: {
    position: 'absolute',
    top: 4,
    left: '50%',
    marginLeft: -2.5,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#000',
    zIndex: 2,
  },
  screen: { flex: 1, borderRadius: 4, overflow: 'hidden' },
  base: {
    width: 258,
    height: 13,
    marginLeft: -17,
    marginTop: -1,
    borderRadius: 10,
    alignItems: 'center',
  },
  notch2: { width: 34, height: 4, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.15)', marginTop: -1 },
});

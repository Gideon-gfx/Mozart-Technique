import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/useTheme';
import GlassSurface from './GlassSurface';
import { useMotion } from '../context/MotionContext';

// Same glass surface on both platforms now (GlassSurface itself picks
// native Liquid Glass > BlurView on iOS, BlurView on Android) - `clear`
// keeps it on the see-through end of the intensity range rather than the
// denser "regular" look a filled card would use.
export function LiquidTabBarBackground() {
  return <GlassSurface clear pointerEvents="none" style={StyleSheet.absoluteFill} />;
}

export function liquidTabBarStyle(colors: ThemeColors, insets: EdgeInsets) {
  return {
    position: 'absolute' as const,
    left: Platform.OS === 'ios' ? 12 : 8,
    right: Platform.OS === 'ios' ? 12 : 8,
    bottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 10 : 8),
    height: 64,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    // iOS: Liquid Glass's continuous squircle corner. Android: a full
    // capsule (radius = half the bar's height) - Material 3 Expressive's
    // signature shape for nav bars and FABs.
    borderRadius: Platform.OS === 'ios' ? 26 : 32,
    overflow: 'hidden' as const,
    elevation: Platform.OS === 'android' ? 12 : 0,
    shadowColor: '#000000',
    shadowOpacity: colors.background === '#000000' ? 0.44 : 0.12,
    shadowRadius: Platform.OS === 'ios' ? 20 : 12,
    shadowOffset: { width: 0, height: 8 },
  };
}

export const liquidTabItemStyle = { borderRadius: Platform.OS === 'ios' ? 18 : 20, marginHorizontal: Platform.OS === 'ios' ? 3 : 2 };

// No filled pill behind the active tab - the glass stays quiet everywhere
// across the bar, and only the icon/label tint (tabBarActiveTintColor,
// set alongside this in each navigator's screenOptions) marks selection.
export function liquidTabBarVisuals(_colors: ThemeColors) {
  return {
    tabBarActiveBackgroundColor: 'transparent',
  };
}

export function useLiquidTabMotion(insets: EdgeInsets) {
  const { reduceMotion } = useMotion();
  const { colors } = useTheme();
  return {
    animation: reduceMotion ? 'none' as const : 'shift' as const,
    // Slower and heavier than the first pass at this (lower stiffness,
    // higher mass) plus a shorter shift distance - reads as an unhurried,
    // overdamped cross-fade rather than anything snappy.
    transitionSpec: { animation: 'spring' as const, config: { stiffness: 180, damping: 30, mass: 1, overshootClamping: true } },
    sceneStyleInterpolator: ({ current }: Parameters<NonNullable<BottomTabNavigationOptions['sceneStyleInterpolator']>>[0]) => ({
      sceneStyle: {
        // Native glass must never have an ancestor at exactly zero opacity.
        opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.01, 1, 0.01], extrapolate: 'clamp' }),
        transform: [{ translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: reduceMotion ? [0, 0, 0] : [-10, 0, 10] }) }],
      },
    }),
    sceneStyle: { backgroundColor: colors.background },
  };
}

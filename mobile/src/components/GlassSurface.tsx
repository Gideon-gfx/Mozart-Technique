import { BlurView } from 'expo-blur';
import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { useMotion } from '../context/MotionContext';
import { useTheme } from '../theme/useTheme';

// Older development clients may not contain the native module yet.
let nativeGlass: typeof import('expo-glass-effect') | null = null;
if (Platform.OS === 'ios') {
  try { nativeGlass = require('expo-glass-effect'); } catch { /* Use blur until rebuilt. */ }
}

export default function GlassSurface({ children, style, clear = false, ...props }: ViewProps & { clear?: boolean }) {
  const { colors, scheme } = useTheme();
  const { reduceTransparency } = useMotion();
  const available = nativeGlass?.isLiquidGlassAvailable() && nativeGlass?.isGlassEffectAPIAvailable();
  // Real blur on Android too, not just iOS - a flat AMOLED-black card was
  // the earlier call here (cheaper, no blur cost while a feed scrolls), but
  // the brief now is explicit parity across both platforms. expo-blur's
  // BlurView is genuinely cross-platform (RenderEffect-backed on Android
  // 12+, a software fallback below that), so this is the same component
  // iOS already falls back to when the native Liquid Glass module isn't
  // present - just always used on Android instead of only as a fallback.
  //
  // BlurView's real optical blur on Android (`blurMethod="dimezisBlurView"`)
  // now needs a `BlurTargetView` wrapped around the content behind it to
  // have anything to sample - without that extra native plumbing it just
  // silently blurs nothing, so it's not safe to turn on sight unseen here.
  // Instead: a guaranteed semi-opaque tint layered under BlurView's own
  // (real, RenderEffect-backed) softening - no native-module dependency,
  // so it reliably reads as glass on every Android version, which is what
  // was actually missing (surfaces were reported "not visible" at all).
  const androidTint = scheme === 'dark'
    ? `rgba(18,18,20,${clear ? 0.62 : 0.8})`
    : `rgba(255,255,255,${clear ? 0.62 : 0.8})`;
  return (
    <View {...props} style={[{ borderRadius: 24, overflow: 'hidden' }, style]}>
      {reduceTransparency ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scheme === 'dark' ? '#080808' : colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 24 }]} />
      ) : Platform.OS === 'ios' && available && nativeGlass ? (
        <nativeGlass.GlassView pointerEvents="none" glassEffectStyle={clear ? 'clear' : 'regular'} colorScheme={scheme} style={[StyleSheet.absoluteFill, { borderRadius: 24 }]} />
      ) : (
        <>
          {Platform.OS === 'android' ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: androidTint }]} />
          ) : null}
          <BlurView
            pointerEvents="none"
            intensity={clear ? (Platform.OS === 'android' ? 45 : 22) : (Platform.OS === 'android' ? 90 : 65)}
            tint={scheme === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: scheme === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.55)' }]} />
        </>
      )}
      {children}
    </View>
  );
}

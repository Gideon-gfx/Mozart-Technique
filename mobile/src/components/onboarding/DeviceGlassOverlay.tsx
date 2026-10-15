import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet } from 'react-native';

// A soft diagonal light streak over a device screen - the single biggest
// cue that reads as "glass" instead of a flat colored rectangle.
export default function DeviceGlassOverlay() {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.05)']}
      locations={[0, 0.45, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0.65 }}
      style={StyleSheet.absoluteFill}
    />
  );
}

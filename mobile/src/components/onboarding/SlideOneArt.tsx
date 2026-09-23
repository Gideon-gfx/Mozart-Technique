import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import CallGridScreen from './CallGridScreen';
import KidHeadphonesIllustration from './KidHeadphonesIllustration';
import PhoneMock from './PhoneMock';
import { useFloat } from './useFloat';
import type { ThemeColors } from '../../theme/colors';

// Two phones leaning like a V (bottoms close, tops apart) - front (left) is
// on a call and shows the illustrated call grid + kid; back (right) is
// turned away, just a soft white glow spilling off its edge.
export default function SlideOneArt({ colors }: { colors: ThemeColors }) {
  const frontFloat = useFloat(4000, 300);
  const backFloat = useFloat(4600, 0);

  return (
    <View style={styles.rig}>
      <Animated.View style={[styles.back, { transform: [{ translateY: backFloat }, { rotate: '11deg' }] }]}>
        <View style={styles.glow} />
        <PhoneMock colors={colors} screenBackground="#fafafa" />
      </Animated.View>
      <View style={styles.ground} />
      <Animated.View style={[styles.front, { transform: [{ translateY: frontFloat }, { rotate: '-11deg' }] }]}>
        <PhoneMock colors={colors}>
          <KidHeadphonesIllustration />
        </PhoneMock>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  rig: { width: '100%', height: 250, alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', left: '52%' },
  front: { position: 'absolute', left: '30%' },
  ground: {
    position: 'absolute',
    bottom: 14,
    width: 150,
    height: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(23,19,15,0.15)',
  },
  glow: {
    position: 'absolute',
    top: '50%',
    right: -30,
    marginTop: -45,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOpacity: 0.9,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    opacity: 0.8,
  },
});

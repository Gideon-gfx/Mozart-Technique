import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import LaptopMock from './LaptopMock';
import LibraryCardScreen from './LibraryCardScreen';
import PhoneMock from './PhoneMock';
import { useFloat } from './useFloat';
import type { ThemeColors } from '../../theme/colors';

// Laptop and phone standing straight, side by side, both playing the same
// lesson from the technique library - matches the real library card style.
export default function SlideTwoArt({ colors }: { colors: ThemeColors }) {
  const laptopFloat = useFloat(4800, 0);
  const phoneFloat = useFloat(4200, 350);

  return (
    <View style={styles.rig}>
      <Animated.View style={{ transform: [{ translateY: laptopFloat }] }}>
        <LaptopMock colors={colors} screenBackground="#fff">
          <LibraryCardScreen title="Line Rider — The Barber of Seville" />
        </LaptopMock>
      </Animated.View>
      <Animated.View style={[styles.phone, { transform: [{ translateY: phoneFloat }] }]}>
        <PhoneMock colors={colors} screenBackground="#fff" style={styles.phoneSize}>
          <LibraryCardScreen title="Mozart Body Percussion" />
        </PhoneMock>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  rig: { width: '100%', height: 250, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 16 },
  phone: { marginBottom: 4 },
  phoneSize: { width: 100, height: 176 },
});

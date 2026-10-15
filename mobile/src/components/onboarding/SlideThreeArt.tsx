import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import ChatSyncScreen from './ChatSyncScreen';
import LaptopMock from './LaptopMock';
import PhoneMock from './PhoneMock';
import TvMock from './TvMock';
import { useFloat } from './useFloat';
import type { ThemeColors } from '../../theme/colors';

// TV, laptop and phone all on the chat page - the same message fades in on
// each, staggered, to read as syncing live across every device.
export default function SlideThreeArt({ colors }: { colors: ThemeColors }) {
  const tvFloat = useFloat(4600, 0);
  const laptopFloat = useFloat(4200, 250);
  const phoneFloat = useFloat(3800, 500);

  return (
    <View style={styles.rig}>
      <Animated.View style={[styles.tv, { transform: [{ translateY: tvFloat }] }]}>
        <TvMock colors={colors} screenBackground="#FBF7F0">
          <ChatSyncScreen delayMs={0} />
        </TvMock>
      </Animated.View>
      <Animated.View style={[styles.laptop, { transform: [{ translateY: laptopFloat }] }]}>
        <LaptopMock colors={colors} screenBackground="#FBF7F0">
          <ChatSyncScreen delayMs={500} />
        </LaptopMock>
      </Animated.View>
      <View style={styles.ground} />
      <Animated.View style={[styles.phone, { transform: [{ translateY: phoneFloat }, { rotate: '-5deg' }] }]}>
        <PhoneMock colors={colors} screenBackground="#FBF7F0">
          <ChatSyncScreen delayMs={1000} />
        </PhoneMock>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  rig: { width: '100%', height: 250, alignItems: 'center', justifyContent: 'flex-end' },
  tv: { position: 'absolute', left: 4, top: 0 },
  laptop: { position: 'absolute', left: '26%', bottom: 18 },
  phone: { position: 'absolute', right: 6, bottom: -4 },
  ground: { position: 'absolute', left: '30%', bottom: 12, width: 190, height: 14, borderRadius: 999, backgroundColor: 'rgba(23,19,15,0.12)' },
});

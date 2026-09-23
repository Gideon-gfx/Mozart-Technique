import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

interface Props {
  symbol?: string;
  delayMs?: number;
  color: string;
  style?: any;
}

// A small musical note that drifts up and fades, looping - used to give the
// badge callouts a bit of life instead of sitting static.
export default function FloatingNote({ symbol = '♪', delayMs = 0, color, style }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(progress, { toValue: 1, duration: 2600, useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(400),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delayMs, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });
  const opacity = progress.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] });

  return (
    <Animated.Text style={[styles.note, { color, opacity, transform: [{ translateY }] }, style]}>
      {symbol}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  note: {
    position: 'absolute',
    fontSize: 38,
    fontWeight: '700',
  },
});

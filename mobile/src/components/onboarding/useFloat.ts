import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

// A gentle infinite bob, used to make the device mockups feel alive instead
// of static - matches the floatY keyframe from the design preview.
export function useFloat(duration = 4000, delayMs = 0, distance = 7) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(value, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [duration, delayMs, value]);

  const translateY = value.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] });
  return translateY;
}

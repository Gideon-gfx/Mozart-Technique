import React, { useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, type PressableProps, type View } from 'react-native';
import { useMotion } from '../context/MotionContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// iOS keeps a tight, barely-there squish (matches Liquid Glass's refined
// feel); Android leans into Material 3 Expressive's springier, more
// tactile press feedback - a bigger squish with a bouncier, lower-damping
// spring. Only applies when motion isn't reduced (see animate() below).
const PRESS_SCALE = Platform.OS === 'android' ? 0.94 : 0.97;
// Slowed down from the first pass (lower stiffness, higher mass on both) -
// Android keeps its lower damping ratio for the expressive bounce, just
// unfolding more gradually now instead of snapping.
const SPRING_CONFIG = Platform.OS === 'android'
  ? { stiffness: 300, damping: 13, mass: 1.1 }
  : { stiffness: 260, damping: 24, mass: 0.9 };

// forwardRef so a tour step's useTourTarget() ref (or any other caller
// that needs the underlying node, e.g. to measureInWindow) can attach
// directly to this wrapper the same way it would to a plain RN Pressable.
const LiquidPressable = React.forwardRef<View, PressableProps>(function LiquidPressable({ style, onPressIn, onPressOut, ...props }, ref) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const { reduceMotion } = useMotion();
  function animate(toValue: number) {
    Animated.spring(scale, { toValue: reduceMotion ? 1 : toValue, ...SPRING_CONFIG, useNativeDriver: true }).start();
  }
  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  const transform = StyleSheet.flatten(resolved)?.transform;
  return <AnimatedPressable {...props} ref={ref} style={[resolved, { transform: [...(Array.isArray(transform) ? transform : []), { scale }] }]}
    onPressIn={(event) => { setPressed(true); animate(PRESS_SCALE); onPressIn?.(event); }}
    onPressOut={(event) => { setPressed(false); animate(1); onPressOut?.(event); }} />;
});

export default LiquidPressable;

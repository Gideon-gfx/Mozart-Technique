import { BlurView } from 'expo-blur';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/useTheme';

// Mirrors the web app's #mt-page-loader (public/assets/nav-auth.js): a
// blurred backdrop with the logo pulsing inside a spinning ring. Shown for
// exactly as long as the real request it's covering takes - no artificial
// minimum here, since "it should work with internet speed" was the whole
// point (a fixed-duration fake spinner would lie about how long a slow
// connection is actually taking).
export default function FullScreenLoader() {
  const { scheme } = useTheme();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.overlay}>
      <BlurView intensity={30} tint={scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={styles.shell}>
        <Animated.View style={[styles.ring, { transform: [{ rotate }] }]} />
        <Image source={require('../../assets/mozart-logo.png')} style={styles.logo} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  shell: {
    width: 108,
    height: 108,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(204,0,0,0.12)',
  },
  ring: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: '#cc0000',
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
  },
  logo: {
    width: 62,
    height: 62,
    borderRadius: 999,
  },
});

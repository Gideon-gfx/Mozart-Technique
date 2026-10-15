import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { fonts } from '../theme/fonts';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/useTheme';

interface Props {
  onFinish: () => void;
}

// A brief, one-time in-app splash (separate from the native launch splash,
// which is already gone by the time this mounts): small centered logo
// first, then the wordmark writes in underneath it, then the whole thing
// dims out before handing off to onboarding.
export default function SplashScreen({ onFinish }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(wordmarkOpacity, { toValue: 1, duration: 480, delay: 120, useNativeDriver: true }),
      Animated.delay(550),
      Animated.timing(screenOpacity, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onFinish();
    });
  }, [logoOpacity, wordmarkOpacity, screenOpacity, onFinish]);

  return (
    <Animated.View style={[styles.screen, { opacity: screenOpacity }]}>
      <Animated.Image
        source={require('../../assets/mozart-logo.png')}
        style={[styles.logo, { opacity: logoOpacity }]}
      />
      <Animated.Text style={[styles.wordmark, { opacity: wordmarkOpacity }]}>Mozart Techniques</Animated.Text>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logo: {
      width: 56,
      height: 56,
      borderRadius: 16,
      marginBottom: 14,
    },
    wordmark: {
      fontFamily: fonts.display,
      fontSize: 19,
      letterSpacing: 0.2,
      color: colors.text,
    },
  });
}

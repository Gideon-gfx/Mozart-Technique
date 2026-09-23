import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import Pressable from './LiquidPressable';
import GlassSurface from './GlassSurface';

import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/useTheme';

interface Props {
  onPress: () => void;
}

// The one circular back button used everywhere it appears (onboarding,
// login, sign up) instead of the native-stack header's default chevron -
// consistent look, and callers control its position/safe-area margin
// themselves rather than fighting the native header's own spacing.
export default function BackButton({ onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable style={styles.button} onPress={onPress} hitSlop={10}>
      <GlassSurface clear style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><Text style={styles.text}>‹</Text></GlassSurface>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      fontSize: 22,
      color: colors.text,
      marginTop: -2,
    },
  });
}

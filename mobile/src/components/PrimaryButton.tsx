import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

// The one shared primary-CTA look (the red gradient from nav-auth.js's
// ".mt-auth-login-btn") - every screen's main button goes through this
// instead of re-declaring the gradient/colors each time.
export default function PrimaryButton({ title, onPress, disabled, loading, style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(), []);
  const isDisabled = disabled || loading;

  return (
    <Pressable onPress={onPress} disabled={isDisabled} style={[styles.wrapper, isDisabled && styles.disabled, style]}>
      <LinearGradient colors={colors.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
        {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.text, { color: colors.onPrimary }]}>{title}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

function createStyles() {
  return StyleSheet.create({
    wrapper: {
      borderRadius: 999,
      overflow: 'hidden',
    },
    disabled: {
      opacity: 0.5,
    },
    gradient: {
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
    },
  });
}

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import GoogleLogo from './GoogleLogo';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

interface Props {
  onPress: () => void;
  disabled?: boolean;
}

export default function GoogleButton({ onPress, disabled }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable style={[styles.button, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      <GoogleLogo size={18} />
      <Text style={styles.text}>Continue with Google</Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderRadius: 999,
      paddingVertical: 15,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    disabled: {
      opacity: 0.5,
    },
    text: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: colors.text,
    },
  });
}

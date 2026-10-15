import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export default function Checkbox({ checked, onChange, label }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable style={styles.row} onPress={() => onChange(!checked)} hitSlop={6}>
      <Pressable
        style={[styles.box, checked && { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed }]}
        onPress={() => onChange(!checked)}
        hitSlop={8}
      >
        {checked ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : null}
      </Pressable>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    box: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 9,
    },
    label: {
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.textSoft,
    },
  });
}

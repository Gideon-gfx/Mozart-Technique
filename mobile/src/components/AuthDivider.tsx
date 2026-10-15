import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

export default function AuthDivider({ label = 'or continue with' }: { label?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginVertical: 18,
    },
    line: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    label: {
      fontSize: 12,
      fontFamily: fonts.body,
      color: colors.textFaint,
    },
  });
}

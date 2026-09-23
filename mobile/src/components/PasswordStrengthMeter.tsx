import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

const LEVELS = [
  { label: 'Too short', color: '#DC2626' },
  { label: 'Weak', color: '#DC2626' },
  { label: 'Fair', color: '#F59E0B' },
  { label: 'Good', color: '#EAB308' },
  { label: 'Strong', color: '#059669' },
] as const;

function scoreFor(password: string) {
  if (!password) return -1;
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, LEVELS.length - 1);
}

// Shows the instant a password field has any content at all (score -1 =
// nothing typed yet = render nothing), not just once it clears some
// minimum length.
export default function PasswordStrengthMeter({ password }: { password: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const score = scoreFor(password);
  if (score < 0) return null;
  const level = LEVELS[score];

  return (
    <View style={styles.wrapper}>
      <View style={styles.bars}>
        {LEVELS.slice(1).map((_, i) => (
          <View
            key={i}
            style={[styles.bar, i <= score - 1 && { backgroundColor: level.color }]}
          />
        ))}
      </View>
      <Text style={[styles.label, { color: level.color }]}>{level.label}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrapper: {
      marginTop: -6,
      marginBottom: 12,
    },
    bars: {
      flexDirection: 'row',
      gap: 5,
      marginBottom: 5,
    },
    bar: {
      flex: 1,
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.border,
    },
    label: {
      fontSize: 11,
      fontFamily: fonts.bodySemiBold,
    },
  });
}

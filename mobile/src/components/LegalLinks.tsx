import React, { useMemo } from 'react';
import { Linking, StyleSheet, Text } from 'react-native';

import { API_BASE_URL } from '../api/client';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

// Both pages already exist on the web app (public/terms-of-service.html,
// public/privacy-policy.html) - no need to duplicate them natively, just
// hand off to the browser.
export default function LegalLinks() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Text style={styles.text}>
      By continuing, you agree to our{' '}
      <Text style={styles.link} onPress={() => Linking.openURL(`${API_BASE_URL}/terms-of-service`)}>
        Terms of Service
      </Text>{' '}
      and{' '}
      <Text style={styles.link} onPress={() => Linking.openURL(`${API_BASE_URL}/privacy-policy`)}>
        Privacy Policy
      </Text>
      .
    </Text>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    text: {
      marginTop: 22,
      fontSize: 12,
      fontFamily: fonts.body,
      color: colors.textFaint,
      textAlign: 'center',
      lineHeight: 18,
    },
    link: {
      color: colors.primaryRed,
      fontFamily: fonts.bodySemiBold,
    },
  });
}

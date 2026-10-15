import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

// Shared shell for a tab that has its bottom-nav slot wired up but no real
// screen built yet - honest placeholder, not a blank white screen, so it's
// obvious this is intentional and pending rather than broken.
export default function ComingSoonScreen({ icon, title, body }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.screen}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={32} color={colors.primaryRed} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
      paddingBottom: 60,
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    title: {
      fontSize: 19,
      fontFamily: fonts.displayBlack,
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    body: {
      fontSize: 13.5,
      lineHeight: 20,
      fontFamily: fonts.body,
      color: colors.textSoft,
      textAlign: 'center',
    },
  });
}

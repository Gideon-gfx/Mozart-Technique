import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import BackButton from '../components/BackButton';
import ComingSoonScreen from '../components/ComingSoonScreen';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'Placeholder'>;

export default function PlaceholderScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { title, icon, body } = route.params;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>
      <ComingSoonScreen icon={icon as keyof typeof Ionicons.glyphMap} title={title} body={body} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
  });
}

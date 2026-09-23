import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { API_BASE_URL } from '../api/client';
import type { MainStackParamList } from '../navigation/types';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

// Web-target build of TeachingToolsScreen - same idea (chrome + iframed
// tool), restyled with the same theme tokens/fonts as the native version.
export default function TeachingToolsScreen({ navigation }: NativeStackScreenProps<MainStackParamList, 'TeachingTools'>) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Pressable onPress={() => navigation.goBack()} style={{ padding: 16 }}>
        <Text style={{ color: colors.primaryRed, fontFamily: fonts.bodyBold, fontSize: 15 }}>‹ Back to chat</Text>
      </Pressable>
      {React.createElement('iframe', {
        src: `${API_BASE_URL}/teaching-tools/index.html`,
        title: 'Mozart teaching tools',
        allow: 'microphone; midi',
        style: { border: 0, width: '100%', flex: 1 },
      })}
    </View>
  );
}

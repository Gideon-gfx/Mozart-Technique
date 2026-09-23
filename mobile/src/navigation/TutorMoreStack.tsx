import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import type { TutorMoreStackParamList } from './types';
import LiveSupportScreen from '../screens/LiveSupportScreen';
import TutorMoreScreen from '../screens/tutor/TutorMoreScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/useTheme';

const Stack = createNativeStackNavigator<TutorMoreStackParamList>();

// Same shape as MoreStack.tsx, pointed at the tutor-mode More screen -
// Live Support and Settings are real shared screens, reused as-is.
export default function TutorMoreStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="TutorMoreHome" component={TutorMoreScreen} />
      <Stack.Screen name="LiveSupport" component={LiveSupportScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

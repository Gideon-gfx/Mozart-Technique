import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import type { PerformerMoreStackParamList } from './types';
import LiveSupportScreen from '../screens/LiveSupportScreen';
import PerformerHistoryScreen from '../screens/performer/PerformerHistoryScreen';
import PerformerMessagesScreen from '../screens/performer/PerformerMessagesScreen';
import PerformerMessageThreadScreen from '../screens/performer/PerformerMessageThreadScreen';
import PerformerMoreScreen from '../screens/performer/PerformerMoreScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/useTheme';

const Stack = createNativeStackNavigator<PerformerMoreStackParamList>();

// Same shape as TutorMoreStack.tsx, pointed at the performer-mode More
// screen - Live Support and Settings are real shared screens, reused as-is.
export default function PerformerMoreStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="PerformerMoreHome" component={PerformerMoreScreen} />
      <Stack.Screen name="PerformerHistory" component={PerformerHistoryScreen} />
      <Stack.Screen name="PerformerMessages" component={PerformerMessagesScreen} />
      <Stack.Screen name="PerformerMessageThread" component={PerformerMessageThreadScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="LiveSupport" component={LiveSupportScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

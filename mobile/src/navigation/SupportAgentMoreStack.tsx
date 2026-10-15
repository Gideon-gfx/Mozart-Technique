import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import type { SupportAgentMoreStackParamList } from './types';
import LiveSupportScreen from '../screens/LiveSupportScreen';
import SupportAgentMoreScreen from '../screens/support-agent/SupportAgentMoreScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/useTheme';

const Stack = createNativeStackNavigator<SupportAgentMoreStackParamList>();

// Same shape as every other mode's More stack - Live Support and Settings
// are real shared screens, reused as-is.
export default function SupportAgentMoreStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="SupportAgentMoreHome" component={SupportAgentMoreScreen} />
      <Stack.Screen name="LiveSupport" component={LiveSupportScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import type { MoreStackParamList } from './types';
import LiveSupportScreen from '../screens/LiveSupportScreen';
import MoreScreen from '../screens/MoreScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/useTheme';

const Stack = createNativeStackNavigator<MoreStackParamList>();

// The More tab is its own small stack (not a flat tab screen) so Live
// Support and Settings can push on top of it and back out, the same way
// the rest of the app's screens navigate.
export default function MoreStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="MoreHome" component={MoreScreen} />
      <Stack.Screen name="LiveSupport" component={LiveSupportScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

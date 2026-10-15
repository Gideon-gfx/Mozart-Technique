import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import type { SponsorMoreStackParamList } from './types';
import LiveSupportScreen from '../screens/LiveSupportScreen';
import SponsorMoreScreen from '../screens/sponsor/SponsorMoreScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/useTheme';

const Stack = createNativeStackNavigator<SponsorMoreStackParamList>();

// Same shape as TutorMoreStack.tsx/OrgTutorMoreStack.tsx, pointed at the
// Sponsor mode's own More screen - Live Support and Settings are real
// shared screens, reused as-is.
export default function SponsorMoreStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="SponsorMoreHome" component={SponsorMoreScreen} />
      <Stack.Screen name="LiveSupport" component={LiveSupportScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

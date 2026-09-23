import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import type { OrganizationMoreStackParamList } from './types';
import LiveSupportScreen from '../screens/LiveSupportScreen';
import OrganizationMoreScreen from '../screens/organization/OrganizationMoreScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/useTheme';

const Stack = createNativeStackNavigator<OrganizationMoreStackParamList>();

// Same shape as SponsorMoreStack.tsx/OrgTutorMoreStack.tsx, pointed at the
// Organization mode's own More screen - Live Support and Settings are real
// shared screens, reused as-is.
export default function OrganizationMoreStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="OrganizationMoreHome" component={OrganizationMoreScreen} />
      <Stack.Screen name="LiveSupport" component={LiveSupportScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

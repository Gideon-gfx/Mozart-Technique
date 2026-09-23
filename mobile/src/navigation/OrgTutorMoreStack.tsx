import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import type { OrgTutorMoreStackParamList } from './types';
import LiveSupportScreen from '../screens/LiveSupportScreen';
import OrgTutorMoreScreen from '../screens/org-tutor/OrgTutorMoreScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/useTheme';

const Stack = createNativeStackNavigator<OrgTutorMoreStackParamList>();

// Same shape as TutorMoreStack.tsx, pointed at the Org Tutor mode's own
// More screen - Live Support and Settings are real shared screens, reused
// as-is.
export default function OrgTutorMoreStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="OrgTutorMoreHome" component={OrgTutorMoreScreen} />
      <Stack.Screen name="LiveSupport" component={LiveSupportScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

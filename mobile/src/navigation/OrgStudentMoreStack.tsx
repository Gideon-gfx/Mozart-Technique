import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import type { OrgStudentMoreStackParamList } from './types';
import LiveSupportScreen from '../screens/LiveSupportScreen';
import OrgStudentMoreScreen from '../screens/org-student/OrgStudentMoreScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/useTheme';

const Stack = createNativeStackNavigator<OrgStudentMoreStackParamList>();

// Same shape as MoreStack.tsx/TutorMoreStack.tsx, pointed at Org Student
// mode's own More screen.
export default function OrgStudentMoreStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="OrgStudentMoreHome" component={OrgStudentMoreScreen} />
      <Stack.Screen name="LiveSupport" component={LiveSupportScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

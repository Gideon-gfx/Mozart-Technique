import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AdminMoreStack from './AdminMoreStack';
import type { AdminTabParamList } from './types';
import { LiquidTabBarBackground, useLiquidTabMotion, liquidTabBarStyle, liquidTabBarVisuals, liquidTabItemStyle } from '../components/LiquidTabBar';
import AdminAnalyticsScreen from '../screens/admin/AdminAnalyticsScreen';
import AdminApplicantsUsersScreen from '../screens/admin/AdminApplicantsUsersScreen';
import AdminEducatorToolsScreen from '../screens/admin/AdminEducatorToolsScreen';
import AdminTutorMatchingScreen from '../screens/admin/AdminTutorMatchingScreen';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

const Tab = createBottomTabNavigator<AdminTabParamList>();

const ICONS: Record<keyof AdminTabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Analytics: { on: 'stats-chart', off: 'stats-chart-outline' },
  ApplicantsUsers: { on: 'people', off: 'people-outline' },
  TutorMatching: { on: 'git-compare', off: 'git-compare-outline' },
  EducatorTools: { on: 'school', off: 'school-outline' },
  More: { on: 'person-circle', off: 'person-circle-outline' },
};

// The admin console's tab set - shared by Country Admin and Main Admin
// alike, mounted instead of every other mode's tabs while
// RoleModeContext's mode is 'admin'. Each screen adapts to the account's
// actual permissions (isPrimaryAdmin/adminCountryCode from publicUser()),
// same as the web app's single /admin page does server-side - there's no
// separate "country admin mode" vs "main admin mode."
export default function AdminTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const motion = useLiquidTabMotion(insets);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        ...motion,
        tabBarActiveTintColor: colors.primaryRed,
        tabBarInactiveTintColor: colors.textFaint,
        ...liquidTabBarVisuals(colors),
        tabBarStyle: liquidTabBarStyle(colors, insets),
        tabBarBackground: () => <LiquidTabBarBackground />,
        tabBarItemStyle: liquidTabItemStyle,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontFamily: fonts.bodySemiBold,
          fontSize: 10.5,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icon = ICONS[route.name as keyof AdminTabParamList];
          return <Ionicons name={focused ? icon.on : icon.off} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Analytics" component={AdminAnalyticsScreen} />
      <Tab.Screen name="ApplicantsUsers" component={AdminApplicantsUsersScreen} options={{ tabBarLabel: 'Applicants' }} />
      <Tab.Screen name="TutorMatching" component={AdminTutorMatchingScreen} options={{ tabBarLabel: 'Matching' }} />
      <Tab.Screen name="EducatorTools" component={AdminEducatorToolsScreen} options={{ tabBarLabel: 'Educator' }} />
      <Tab.Screen name="More" component={AdminMoreStack} />
    </Tab.Navigator>
  );
}

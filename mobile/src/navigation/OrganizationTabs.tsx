import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import OrganizationMoreStack from './OrganizationMoreStack';
import type { OrganizationTabParamList } from './types';
import { LiquidTabBarBackground, useLiquidTabMotion, liquidTabBarStyle, liquidTabBarVisuals, liquidTabItemStyle } from '../components/LiquidTabBar';
import StoreStack from './StoreStack';
import OrganizationClassroomScreen from '../screens/organization/OrganizationClassroomScreen';
import OrganizationMessagesScreen from '../screens/organization/OrganizationMessagesScreen';
import OrganizationOverviewScreen from '../screens/organization/OrganizationOverviewScreen';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

const Tab = createBottomTabNavigator<OrganizationTabParamList>();

const ICONS: Record<keyof OrganizationTabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  // Same icon ngo-dashboard.html's own sidebar uses for Overview (fa-chart-pie).
  Overview: { on: 'pie-chart', off: 'pie-chart-outline' },
  Classroom: { on: 'school', off: 'school-outline' },
  Messages: { on: 'chatbubble', off: 'chatbubble-outline' },
  Store: { on: 'storefront', off: 'storefront-outline' },
  More: { on: 'person-circle', off: 'person-circle-outline' },
};

// The Organization tab set - its own navigator, mounted instead of
// MainTabs/TutorTabs/SponsorTabs/etc. while RoleModeContext's mode is
// 'organization'. Deliberately NOT SponsorTabs relabeled: Sponsor is an
// Individual Sponsor's single-student relationship, Organization is the
// NGO/Institution's own dashboard with students, tutors, and its own
// Classroom - a fully separate mode, matching ngo-dashboard.html's own
// Overview/Classroom/Messages footer shape. Store is the exact same shared
// screen every other mode reuses.
export default function OrganizationTabs() {
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
          fontSize: 11,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icon = ICONS[route.name as keyof OrganizationTabParamList];
          return <Ionicons name={focused ? icon.on : icon.off} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Overview" component={OrganizationOverviewScreen} />
      <Tab.Screen name="Classroom" component={OrganizationClassroomScreen} />
      <Tab.Screen name="Messages" component={OrganizationMessagesScreen} />
      <Tab.Screen name="Store" component={StoreStack} />
      <Tab.Screen name="More" component={OrganizationMoreStack} />
    </Tab.Navigator>
  );
}

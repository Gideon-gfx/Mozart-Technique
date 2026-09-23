import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import OrgStudentMoreStack from './OrgStudentMoreStack';
import type { OrgStudentTabParamList } from './types';
import { LiquidTabBarBackground, useLiquidTabMotion, liquidTabBarStyle, liquidTabBarVisuals, liquidTabItemStyle } from '../components/LiquidTabBar';
import OrgStudentGamesScreen from '../screens/org-student/OrgStudentGamesScreen';
import OrgStudentMessagesScreen from '../screens/org-student/OrgStudentMessagesScreen';
import OrgStudentOverviewScreen from '../screens/org-student/OrgStudentOverviewScreen';
import StoreStack from './StoreStack';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

const Tab = createBottomTabNavigator<OrgStudentTabParamList>();

const ICONS: Record<keyof OrgStudentTabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Overview: { on: 'home', off: 'home-outline' },
  Games: { on: 'game-controller', off: 'game-controller-outline' },
  Messages: { on: 'chatbubble', off: 'chatbubble-outline' },
  Store: { on: 'storefront', off: 'storefront-outline' },
  More: { on: 'person-circle', off: 'person-circle-outline' },
};

// The Org Student tab set - same footer nav shape as MainTabParamList
// (Home becomes Overview, Library becomes Games), mounted instead of
// MainTabs while RoleModeContext's mode is 'org-student'. Store is the
// exact same shared screen the regular student tabs use; Games and
// Messages are this mode's own (see their own files for why).
export default function OrgStudentTabs() {
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
          const icon = ICONS[route.name as keyof OrgStudentTabParamList];
          return <Ionicons name={focused ? icon.on : icon.off} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Overview" component={OrgStudentOverviewScreen} />
      <Tab.Screen name="Games" component={OrgStudentGamesScreen} />
      <Tab.Screen name="Messages" component={OrgStudentMessagesScreen} />
      <Tab.Screen name="Store" component={StoreStack} />
      <Tab.Screen name="More" component={OrgStudentMoreStack} />
    </Tab.Navigator>
  );
}

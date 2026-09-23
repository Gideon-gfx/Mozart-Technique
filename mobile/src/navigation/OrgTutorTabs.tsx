import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import OrgTutorMoreStack from './OrgTutorMoreStack';
import type { OrgTutorTabParamList } from './types';
import { LiquidTabBarBackground, useLiquidTabMotion, liquidTabBarStyle, liquidTabBarVisuals, liquidTabItemStyle } from '../components/LiquidTabBar';
import StoreStack from './StoreStack';
import OrgMessagesScreen from '../screens/org-tutor/OrgMessagesScreen';
import OrgTutorOverviewScreen from '../screens/org-tutor/OrgTutorOverviewScreen';
import OrgTutorStudentsScreen from '../screens/org-tutor/OrgTutorStudentsScreen';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

const Tab = createBottomTabNavigator<OrgTutorTabParamList>();

const ICONS: Record<keyof OrgTutorTabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Overview: { on: 'business', off: 'business-outline' },
  Students: { on: 'people', off: 'people-outline' },
  Messages: { on: 'chatbubble', off: 'chatbubble-outline' },
  Store: { on: 'storefront', off: 'storefront-outline' },
  More: { on: 'person-circle', off: 'person-circle-outline' },
};

// The Organization Tutor tab set - same shape as TutorTabs.tsx (footer nav
// is deliberately identical): Overview / Students / Messages / Store /
// More, mounted instead of TutorTabs/MainTabs while RoleModeContext's mode
// is 'org-tutor'. Messages and Store are the exact same shared screens
// Tutor mode reuses.
export default function OrgTutorTabs() {
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
          const icon = ICONS[route.name as keyof OrgTutorTabParamList];
          return <Ionicons name={focused ? icon.on : icon.off} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Overview" component={OrgTutorOverviewScreen} />
      <Tab.Screen name="Students" component={OrgTutorStudentsScreen} />
      <Tab.Screen name="Messages" component={OrgMessagesScreen} />
      <Tab.Screen name="Store" component={StoreStack} />
      <Tab.Screen name="More" component={OrgTutorMoreStack} />
    </Tab.Navigator>
  );
}

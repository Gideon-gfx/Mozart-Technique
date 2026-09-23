import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TutorMoreStack from './TutorMoreStack';
import type { TutorTabParamList } from './types';
import { LiquidTabBarBackground, useLiquidTabMotion, liquidTabBarStyle, liquidTabBarVisuals, liquidTabItemStyle } from '../components/LiquidTabBar';
import MessagesScreen from '../screens/MessagesScreen';
import StoreStack from './StoreStack';
import TutorDashboardScreen from '../screens/tutor/TutorDashboardScreen';
import TutorStudentsScreen from '../screens/tutor/TutorStudentsScreen';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

const Tab = createBottomTabNavigator<TutorTabParamList>();

const ICONS: Record<keyof TutorTabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Tutor: { on: 'easel', off: 'easel-outline' },
  Students: { on: 'people', off: 'people-outline' },
  Messages: { on: 'chatbubble', off: 'chatbubble-outline' },
  Store: { on: 'storefront', off: 'storefront-outline' },
  More: { on: 'person-circle', off: 'person-circle-outline' },
};

// The tutor-mode tab set: Tutor (dashboard) / Students / Messages / Store /
// More - mounted instead of MainTabs while RoleModeContext's mode is
// 'tutor' (see TabsRouter.tsx). Messages and Store are the exact same
// screens the student tabs use.
export default function TutorTabs() {
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
          const icon = ICONS[route.name as keyof TutorTabParamList];
          return <Ionicons name={focused ? icon.on : icon.off} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Tutor" component={TutorDashboardScreen} />
      <Tab.Screen name="Students" component={TutorStudentsScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Store" component={StoreStack} />
      <Tab.Screen name="More" component={TutorMoreStack} />
    </Tab.Navigator>
  );
}

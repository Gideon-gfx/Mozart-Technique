import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SponsorMoreStack from './SponsorMoreStack';
import type { SponsorTabParamList } from './types';
import { LiquidTabBarBackground, useLiquidTabMotion, liquidTabBarStyle, liquidTabBarVisuals, liquidTabItemStyle } from '../components/LiquidTabBar';
import StoreStack from './StoreStack';
import SponsorDashboardScreen from '../screens/sponsor/SponsorDashboardScreen';
import SponsorMessagesScreen from '../screens/sponsor/SponsorMessagesScreen';
import SponsorStudentsScreen from '../screens/sponsor/SponsorStudentsScreen';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

const Tab = createBottomTabNavigator<SponsorTabParamList>();

const ICONS: Record<keyof SponsorTabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Sponsor: { on: 'heart', off: 'heart-outline' },
  Students: { on: 'people', off: 'people-outline' },
  Messages: { on: 'chatbubble', off: 'chatbubble-outline' },
  Store: { on: 'storefront', off: 'storefront-outline' },
  More: { on: 'person-circle', off: 'person-circle-outline' },
};

// The Sponsor tab set - same footer nav shape as Tutor/Org Tutor: Sponsor
// (status/codes dashboard) / Students / Messages / Store / More, mounted
// instead of MainTabs/TutorTabs/OrgTutorTabs while RoleModeContext's mode
// is 'sponsor'. Store is the exact same shared screen every other mode
// reuses.
export default function SponsorTabs() {
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
          const icon = ICONS[route.name as keyof SponsorTabParamList];
          return <Ionicons name={focused ? icon.on : icon.off} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Sponsor" component={SponsorDashboardScreen} />
      <Tab.Screen name="Students" component={SponsorStudentsScreen} />
      <Tab.Screen name="Messages" component={SponsorMessagesScreen} />
      <Tab.Screen name="Store" component={StoreStack} />
      <Tab.Screen name="More" component={SponsorMoreStack} />
    </Tab.Navigator>
  );
}

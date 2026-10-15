import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SupportAgentMoreStack from './SupportAgentMoreStack';
import type { SupportAgentTabParamList } from './types';
import { LiquidTabBarBackground, useLiquidTabMotion, liquidTabBarStyle, liquidTabBarVisuals, liquidTabItemStyle } from '../components/LiquidTabBar';
import SupportAgentInboxScreen from '../screens/support-agent/SupportAgentInboxScreen';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

const Tab = createBottomTabNavigator<SupportAgentTabParamList>();

const ICONS: Record<keyof SupportAgentTabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Inbox: { on: 'chatbubbles', off: 'chatbubbles-outline' },
  More: { on: 'menu', off: 'menu-outline' },
};

// The support-agent-mode tab set: Inbox / More - mounted instead of
// MainTabs while RoleModeContext's mode is 'support-agent'. Just two tabs
// by design (see types.ts's own note) - this role has one job.
export default function SupportAgentTabs() {
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
          const icon = ICONS[route.name as keyof SupportAgentTabParamList];
          return <Ionicons name={focused ? icon.on : icon.off} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Inbox" component={SupportAgentInboxScreen} />
      <Tab.Screen name="More" component={SupportAgentMoreStack} />
    </Tab.Navigator>
  );
}

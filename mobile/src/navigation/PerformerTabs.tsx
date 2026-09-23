import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PerformerMoreStack from './PerformerMoreStack';
import type { PerformerTabParamList } from './types';
import { LiquidTabBarBackground, useLiquidTabMotion, liquidTabBarStyle, liquidTabBarVisuals, liquidTabItemStyle } from '../components/LiquidTabBar';
import StoreStack from './StoreStack';
import PerformerMediaScreen from '../screens/performer/PerformerMediaScreen';
import PerformerProfileScreen from '../screens/performer/PerformerProfileScreen';
import PerformerRequestsScreen from '../screens/performer/PerformerRequestsScreen';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

const Tab = createBottomTabNavigator<PerformerTabParamList>();

const ICONS: Record<keyof PerformerTabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Requests: { on: 'briefcase', off: 'briefcase-outline' },
  Profile: { on: 'person-circle', off: 'person-circle-outline' },
  Media: { on: 'images', off: 'images-outline' },
  Store: { on: 'storefront', off: 'storefront-outline' },
  More: { on: 'menu', off: 'menu-outline' },
};

// The performer-mode tab set: Requests / Profile / Media / Store / More -
// mounted instead of MainTabs while RoleModeContext's mode is 'performer'.
// Store is the exact same screen every other mode's tabs reuse.
export default function PerformerTabs() {
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
          const icon = ICONS[route.name as keyof PerformerTabParamList];
          return <Ionicons name={focused ? icon.on : icon.off} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Requests" component={PerformerRequestsScreen} />
      <Tab.Screen name="Profile" component={PerformerProfileScreen} />
      <Tab.Screen name="Media" component={PerformerMediaScreen} />
      <Tab.Screen name="Store" component={StoreStack} />
      <Tab.Screen name="More" component={PerformerMoreStack} />
    </Tab.Navigator>
  );
}

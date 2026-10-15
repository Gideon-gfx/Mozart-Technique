import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import type { StoreStackParamList } from './types';
import CategoryScreen from '../screens/CategoryScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import StoreScreen from '../screens/StoreScreen';
import { useTheme } from '../theme/useTheme';

const Stack = createNativeStackNavigator<StoreStackParamList>();

// The Store tab is its own small stack (mirrors MoreStack.tsx) so
// ProductDetail/Category can push on top of it and back out while the
// bottom tab bar stays visible underneath, instead of covering the whole
// app the way a MainStack-level push does. Used identically across every
// role's tab set that has a Store tab (all but Support Agent).
export default function StoreStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="StoreHome" component={StoreScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="Category" component={CategoryScreen} />
    </Stack.Navigator>
  );
}

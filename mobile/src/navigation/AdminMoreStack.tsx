import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import type { AdminMoreStackParamList } from './types';
import AdminActivityScreen from '../screens/admin/AdminActivityScreen';
import AdminMarketplaceScreen from '../screens/admin/AdminMarketplaceScreen';
import AdminMoreScreen from '../screens/admin/AdminMoreScreen';
import AdminPayoutsScreen from '../screens/admin/AdminPayoutsScreen';
import AdminStoreOrdersScreen from '../screens/admin/AdminStoreOrdersScreen';
import AdminStoreProductsScreen from '../screens/admin/AdminStoreProductsScreen';
import LiveSupportScreen from '../screens/LiveSupportScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/useTheme';

const Stack = createNativeStackNavigator<AdminMoreStackParamList>();

export default function AdminMoreStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="AdminMoreHome" component={AdminMoreScreen} />
      <Stack.Screen name="AdminActivity" component={AdminActivityScreen} />
      <Stack.Screen name="AdminPayouts" component={AdminPayoutsScreen} />
      <Stack.Screen name="AdminMarketplace" component={AdminMarketplaceScreen} />
      <Stack.Screen name="AdminStoreProducts" component={AdminStoreProductsScreen} />
      <Stack.Screen name="AdminStoreOrders" component={AdminStoreOrdersScreen} />
      <Stack.Screen name="LiveSupport" component={LiveSupportScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

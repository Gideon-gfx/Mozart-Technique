import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import React, { useContext, type Ref } from 'react';
import { FlatList as NativeFlatList, ScrollView as NativeScrollView, StyleSheet, type FlatListProps, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function useDockPadding(style: StyleProp<ViewStyle>) {
  const barHeight = useContext(BottomTabBarHeightContext);
  const insets = useSafeAreaInsets();
  if (barHeight == null) return style;
  const original = StyleSheet.flatten(style);
  const existing = original?.paddingBottom ?? original?.paddingVertical ?? original?.padding ?? 0;
  return [style, { paddingBottom: (typeof existing === 'number' ? existing : 0) + barHeight + Math.max(insets.bottom, 10) + 12 }];
}

// Content can scroll underneath clear glass, while the last row can always
// be brought above the dock. Pushed pages outside tabs keep their own insets.
export type ScrollView = NativeScrollView;
export function ScrollView({ contentContainerStyle, ref, ...props }: ScrollViewProps & { ref?: Ref<NativeScrollView> }) {
  const padded = useDockPadding(contentContainerStyle);
  return <NativeScrollView {...props} ref={ref} contentContainerStyle={padded} />;
}

export type FlatList<ItemT> = NativeFlatList<ItemT>;
export function FlatList<ItemT>({ contentContainerStyle, ref, inverted, horizontal, ...props }: FlatListProps<ItemT> & { ref?: Ref<NativeFlatList<ItemT>> }) {
  const padded = useDockPadding(contentContainerStyle);
  return <NativeFlatList {...props} inverted={inverted} horizontal={horizontal} ref={ref} contentContainerStyle={inverted || horizontal ? contentContainerStyle : padded} />;
}

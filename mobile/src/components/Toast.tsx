import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';

export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

const ICON: Record<ToastVariant, keyof typeof Ionicons.glyphMap> = {
  info: 'information-circle',
  success: 'checkmark-circle',
  error: 'alert-circle',
};

// The themed replacement for Alert.alert's single-button informational
// popups - a real message bubble that slides in from the top and dismisses
// itself, styled like the rest of the app instead of the OS's black-on-white
// system dialog.
export default function ToastStack({ items, onDismiss, colors }: { items: ToastItem[]; onDismiss: (id: number) => void; colors: ThemeColors }) {
  const insets = useSafeAreaInsets();
  if (!items.length) return null;
  return (
    <View style={[styles.stack, { top: insets.top + 8 }]} pointerEvents="box-none">
      {items.map((item) => (
        <ToastRow key={item.id} item={item} onDismiss={() => onDismiss(item.id)} colors={colors} />
      ))}
    </View>
  );
}

function ToastRow({ item, onDismiss, colors }: { item: ToastItem; onDismiss: () => void; colors: ThemeColors }) {
  const translateY = useRef(new Animated.Value(-40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [translateY, opacity]);

  const tint = item.variant === 'error' ? colors.danger : item.variant === 'success' ? colors.success : colors.primaryRed;

  return (
    <Animated.View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity, transform: [{ translateY }] }]}>
      <Pressable style={styles.rowInner} onPress={onDismiss}>
        <View style={[styles.iconWrap, { backgroundColor: `${tint}17` }]}>
          <Ionicons name={ICON[item.variant]} size={16} color={tint} />
        </View>
        <Text style={[styles.message, { color: colors.text }]} numberOfLines={3}>{item.message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 10000,
    gap: 8,
  },
  row: {
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.bodySemiBold,
    lineHeight: 18,
  },
});

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useNotificationsBadge } from '../context/NotificationsContext';
import { useTheme } from '../theme/useTheme';

// Drop-in replacement for a bare <Ionicons name="notifications" .../> bell -
// every mode's header uses this now instead, so the red unread-dot shows up
// consistently everywhere rather than being wired one header at a time.
export default function NotificationBell({ size = 20, color }: { size?: number; color?: string }) {
  const { hasUnread } = useNotificationsBadge();
  const { colors } = useTheme();

  return (
    <View>
      <Ionicons name="notifications" size={size} color={color || colors.text} />
      {hasUnread ? <View style={[styles.dot, { backgroundColor: colors.danger }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

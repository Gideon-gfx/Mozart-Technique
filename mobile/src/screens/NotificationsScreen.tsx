import { FlatList } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import * as notificationsApi from '../api/notifications';
import type { AppNotification } from '../api/types';
import BackButton from '../components/BackButton';
import { useToast } from '../context/ToastContext';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'Notifications'>;

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Real data from server.js's /api/notifications - the same list the web
// bell shows, not a native-only stand-in.
export default function NotificationsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { toast } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    notificationsApi
      .fetchNotifications()
      .then((data) => setItems(data.notifications))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onPressItem(item: AppNotification) {
    if (!item.read) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      notificationsApi.markNotificationRead(item.id).catch(() => {});
    }

    // Native destinations we actually have, matched from the notification
    // type/href - anything else falls back to just showing the full text,
    // rather than redirecting out to a web page for it.
    if (item.type === 'chat') {
      navigation.navigate('Tabs', { screen: 'Messages' });
      return;
    }
    // Booking invites are sent only to matched performers. When the account
    // is in Performer mode, take them straight to the detailed request card
    // (including the event description and any uploaded media/links).
    if (item.type === 'marketplace_request_invite') {
      navigation.navigate('Tabs', { screen: 'Requests' } as never);
      return;
    }
    if (item.href && item.href.includes('open-live-support')) {
      navigation.navigate('Tabs', { screen: 'More', params: { screen: 'LiveSupport' } });
      return;
    }
    if (item.type === 'orientation' || item.type === 'orientation-required') {
      navigation.navigate('Orientation');
      return;
    }
    toast(item.message);
  }

  async function onMarkAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    notificationsApi.markAllNotificationsRead().catch(() => {});
  }

  const hasUnread = items.some((n) => !n.read);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Notifications</Text>
        <Pressable onPress={onMarkAllRead} disabled={!hasUnread} hitSlop={10}>
          <Text style={[styles.markAll, !hasUnread && styles.markAllDisabled]}>Mark all read</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>Nothing here yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onPressItem(item)}>
              {!item.read ? <View style={styles.dot} /> : <View style={styles.dotSpacer} />}
              <View style={styles.rowBody}>
                <Text style={[styles.message, !item.read && styles.messageUnread]}>{item.message}</Text>
                <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
              </View>
              {item.href ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
    title: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text },
    markAll: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.primaryRed },
    markAllDisabled: { color: colors.textFaint },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, fontSize: 13 },
    listContent: { paddingHorizontal: 16, paddingBottom: 24 },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primaryRed, marginTop: 6 },
    dotSpacer: { width: 8 },
    rowBody: { flex: 1 },
    message: { fontSize: 14, fontFamily: fonts.body, color: colors.textSoft, lineHeight: 20 },
    messageUnread: { fontFamily: fonts.bodySemiBold, color: colors.text },
    time: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 3 },
  });
}

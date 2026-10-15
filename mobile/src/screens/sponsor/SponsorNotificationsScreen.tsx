import { FlatList } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { ApiError } from '../../api/client';
import * as notificationsApi from '../../api/notifications';
import * as organizationsApi from '../../api/organizations';
import type { SponsorNotification } from '../../api/organizations';
import BackButton from '../../components/BackButton';
import { useToast } from '../../context/ToastContext';
import type { MainStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'SponsorNotifications'>;

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// The Sponsor tab's own notification bell - only things related to this
// account's own organization (application/subscription updates), unlike the
// generic Notifications screen which shows the account's whole history.
export default function SponsorNotificationsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { toast } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<SponsorNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return organizationsApi
      .fetchSponsorNotifications()
      .then((data) => {
        setItems(data.notifications);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your notifications.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  async function onMarkAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    notificationsApi.markAllNotificationsRead().catch(() => {});
  }

  const hasUnread = items.some((n) => n.read === false);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Sponsorship Notifications</Text>
        <Pressable onPress={onMarkAllRead} disabled={!hasUnread} hitSlop={10}>
          <Text style={[styles.markAll, !hasUnread && styles.markAllDisabled]}>Mark all read</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>Nothing about your sponsorship yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => toast(item.message)}>
              {item.read === false ? <View style={styles.dot} /> : <View style={styles.dotSpacer} />}
              <View style={styles.rowBody}>
                <Text style={[styles.message, item.read === false && styles.messageUnread]}>{item.message}</Text>
                <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
              </View>
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
      gap: 10,
    },
    title: { flex: 1, fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text },
    markAll: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primaryRed },
    markAllDisabled: { color: colors.textFaint },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, fontSize: 13, textAlign: 'center' },
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

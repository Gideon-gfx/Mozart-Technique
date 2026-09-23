import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../api/client';
import * as supportAgentApi from '../../api/supportAgent';
import type { AgentSupportThread } from '../../api/supportAgent';
import Avatar from '../../components/Avatar';
import GlassSurface from '../../components/GlassSurface';
import NotificationBell from '../../components/NotificationBell';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { SupportAgentTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<SupportAgentTabParamList, 'Inbox'>;

const STATUS_LABEL: Record<AgentSupportThread['status'], string> = {
  ai: 'With AI',
  waiting_for_agent: 'Waiting',
  assigned: 'Assigned',
  closed: 'Closed',
};

// Mirrors public/support-agent's own inbox - waiting conversations any
// agent can claim, plus whatever's already assigned to this one (or, for
// role==='admin', every conversation - see server.js's own filter on
// GET /api/support-agent/threads, reproduced client-side here as two
// grouped sections instead of one flat list).
export default function SupportAgentInboxScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threads, setThreads] = useState<AgentSupportThread[]>([]);
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const load = useCallback(() => {
    return supportAgentApi
      .fetchAgentThreads()
      .then((res) => {
        setThreads(res.threads);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the inbox.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function claim(thread: AgentSupportThread) {
    setClaimingId(thread.id);
    try {
      await supportAgentApi.claimThread(thread.id);
      toast('Conversation claimed.', 'success');
      load();
      navigation.getParent()?.navigate('SupportThread', { threadId: thread.id });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not claim that conversation.', 'error');
    } finally {
      setClaimingId(null);
    }
  }

  const waiting = threads.filter((t) => t.status === 'waiting_for_agent');
  const mine = threads.filter((t) => t.status !== 'waiting_for_agent' && (t.assignedAgentId === user?.id || user?.role === 'admin'));

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View style={styles.header}>
        <GlassSurface clear pointerEvents="none" style={[StyleSheet.absoluteFill, styles.headerGlass]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Support Inbox</Text>
          <Text style={styles.subtitle}>{waiting.length} waiting · {mine.length} assigned</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={() => navigation.getParent()?.navigate('Notifications')} hitSlop={10}>
          <NotificationBell size={20} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => navigation.getParent()?.navigate('Profile')} hitSlop={10}>
          <Avatar name={user?.name || '?'} photoUrl={user?.photoUrl} size={34} viewable={false} />
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
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryRed} />}
        >
          <Text style={styles.sectionTitle}>Waiting for an agent</Text>
          {waiting.length === 0 ? (
            <Text style={styles.emptyText}>Nothing waiting right now.</Text>
          ) : (
            waiting.map((thread, i) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                colors={colors}
                style={i > 0 ? { marginTop: 8 } : undefined}
                onPress={() => navigation.getParent()?.navigate('SupportThread', { threadId: thread.id })}
                trailing={
                  <Pressable style={styles.claimBtn} onPress={() => claim(thread)} disabled={claimingId === thread.id}>
                    {claimingId === thread.id ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Text style={styles.claimBtnText}>Claim</Text>}
                  </Pressable>
                }
              />
            ))
          )}

          <Text style={styles.sectionTitle}>Your conversations</Text>
          {mine.length === 0 ? (
            <Text style={styles.emptyText}>No assigned conversations yet.</Text>
          ) : (
            mine.map((thread, i) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                colors={colors}
                style={i > 0 ? { marginTop: 8 } : undefined}
                onPress={() => navigation.getParent()?.navigate('SupportThread', { threadId: thread.id })}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ThreadRow({
  thread,
  colors,
  style,
  onPress,
  trailing,
}: {
  thread: AgentSupportThread;
  colors: ThemeColors;
  style?: object;
  onPress: () => void;
  trailing?: React.ReactNode;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const lastMessage = thread.messages[thread.messages.length - 1];
  return (
    <Pressable style={[styles.row, style]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{thread.userName}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{lastMessage ? lastMessage.text : 'No messages yet'}</Text>
      </View>
      <View style={styles.rowRight}>
        <View style={[styles.badge, thread.status === 'waiting_for_agent' ? styles.badgePending : styles.badgeNeutral]}>
          <Text style={[styles.badgeText, thread.status === 'waiting_for_agent' ? styles.badgeTextPending : styles.badgeTextNeutral]}>{STATUS_LABEL[thread.status]}</Text>
        </View>
        {trailing}
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 14,
      backgroundColor: 'transparent',
    },
    headerGlass: { borderRadius: 0 },
    title: { fontSize: 19, fontFamily: fonts.displayBlack, color: colors.text },
    subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    content: { padding: 20, paddingBottom: 40 },
    sectionTitle: { fontSize: 14, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 16, marginBottom: 10 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
    },
    rowTitle: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    rowMeta: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    rowRight: { alignItems: 'flex-end', gap: 6 },
    badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    badgePending: { backgroundColor: colors.statusPendingBg },
    badgeNeutral: { backgroundColor: colors.background },
    badgeText: { fontSize: 10, fontFamily: fonts.bodyBold },
    badgeTextPending: { color: colors.statusPendingText },
    badgeTextNeutral: { color: colors.textFaint },
    claimBtn: { backgroundColor: colors.primaryRed, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, minWidth: 56, alignItems: 'center' },
    claimBtnText: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
  });
}

import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../api/client';
import * as marketplaceChatApi from '../../api/marketplaceChat';
import type { MarketplaceChatSummary } from '../../api/marketplaceChat';
import Avatar from '../../components/Avatar';
import BackButton from '../../components/BackButton';
import GlassSurface from '../../components/GlassSurface';
import type { PerformerMoreStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<PerformerMoreStackParamList, 'PerformerMessages'>;

function clientOf(chat: MarketplaceChatSummary) {
  return chat.client || chat.requester || chat.participant || {
    id: 0,
    name: chat.clientName || 'Event client',
    photoUrl: chat.clientPhotoUrl || null,
  };
}

function eventLabel(chat: MarketplaceChatSummary) {
  const name = chat.eventType?.trim() || 'Accepted event';
  if (!chat.eventDate) return name;
  const date = new Date(chat.eventDate);
  const pretty = Number.isNaN(date.getTime())
    ? chat.eventDate
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${name} · ${pretty}`;
}

function timeLabel(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Marketplace messages have their own inbox rather than appearing in lesson
// chat. Every thread represents an event the performer accepted, so clients
// can only contact the performer after the booking decision is made.
export default function PerformerMessagesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [chats, setChats] = useState<MarketplaceChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await marketplaceChatApi.fetchMarketplaceChats();
      setChats(result.chats || []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your event messages.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openChat(chat: MarketplaceChatSummary) {
    const client = clientOf(chat);
    navigation.navigate('PerformerMessageThread', {
      chatId: chat.id,
      title: client.name,
      photoUrl: client.photoUrl || null,
      eventLabel: eventLabel(chat),
    });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <GlassSurface clear pointerEvents="none" style={[StyleSheet.absoluteFill, styles.headerGlass]} />
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Event messages</Text>
          <Text style={styles.subtitle}>Chat with clients after you accept their request.</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.primaryRed} /></View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={29} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primaryRed} />}
        >
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}><Ionicons name="lock-closed" size={17} color={colors.primaryRed} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Private event conversations</Text>
              <Text style={styles.infoText}>Only clients whose event request you have accepted can message you here.</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>{chats.length ? `${chats.length} accepted ${chats.length === 1 ? 'event' : 'events'}` : 'Your accepted events'}</Text>

          {chats.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><Ionicons name="chatbubbles-outline" size={29} color={colors.primaryRed} /></View>
              <Text style={styles.emptyTitle}>No event messages yet</Text>
              <Text style={styles.emptyText}>When you accept an event request, its client can message you here to coordinate the performance.</Text>
            </View>
          ) : (
            chats.map((chat) => {
              const client = clientOf(chat);
              const preview = chat.lastMessage?.text || chat.lastMessageText || 'Start planning this event together.';
              const when = timeLabel(chat.lastMessage?.createdAt || chat.updatedAt);
              return (
                <Pressable key={chat.id} style={styles.chatCard} onPress={() => openChat(chat)}>
                  <View style={styles.avatarWrap}>
                    <Avatar name={client.name} photoUrl={client.photoUrl} size={48} viewable={false} />
                    <View style={styles.acceptedDot}><Ionicons name="checkmark" size={10} color={colors.onPrimary} /></View>
                  </View>
                  <View style={styles.chatBody}>
                    <View style={styles.titleRow}>
                      <Text style={styles.clientName} numberOfLines={1}>{client.name}</Text>
                      {!!when && <Text style={styles.time}>{when}</Text>}
                    </View>
                    <Text style={styles.eventName} numberOfLines={1}>{eventLabel(chat)}</Text>
                    <Text style={styles.preview} numberOfLines={1}>{preview}</Text>
                  </View>
                  {(chat.unreadCount || 0) > 0 && <View style={styles.unread}><Text style={styles.unreadText}>{chat.unreadCount! > 9 ? '9+' : chat.unreadCount}</Text></View>}
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: 'transparent' },
    headerGlass: { borderRadius: 0 },
    headerCopy: { flex: 1 },
    title: { fontSize: 19, fontFamily: fonts.displayBlack, color: colors.text },
    subtitle: { marginTop: 2, fontSize: 11.5, lineHeight: 16, fontFamily: fonts.body, color: colors.textFaint },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
    errorText: { maxWidth: 300, textAlign: 'center', fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.danger },
    retryBtn: { backgroundColor: colors.primaryRed, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
    retryText: { color: colors.onPrimary, fontFamily: fonts.bodyBold, fontSize: 12.5 },
    content: { padding: 20, paddingBottom: 42 },
    infoCard: { flexDirection: 'row', gap: 11, backgroundColor: `${colors.primaryRed}0D`, borderWidth: 1, borderColor: `${colors.primaryRed}25`, borderRadius: 16, padding: 14, marginBottom: 20 },
    infoIcon: { width: 33, height: 33, borderRadius: 16.5, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.primaryRed}18` },
    infoTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    infoText: { marginTop: 3, fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16, color: colors.textSoft },
    sectionTitle: { fontFamily: fonts.displayBlack, fontSize: 14.5, color: colors.text, marginBottom: 10 },
    emptyCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 28, paddingVertical: 36, borderWidth: 1, borderColor: colors.border },
    emptyIcon: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.primaryRed}12`, marginBottom: 14 },
    emptyTitle: { color: colors.text, fontFamily: fonts.displayBlack, fontSize: 15.5 },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, marginTop: 6, textAlign: 'center' },
    chatCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 9 },
    avatarWrap: { position: 'relative' },
    acceptedDot: { position: 'absolute', right: -2, bottom: -1, width: 17, height: 17, borderRadius: 8.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success, borderWidth: 2, borderColor: colors.surface },
    chatBody: { flex: 1, minWidth: 0 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    clientName: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.text },
    time: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textFaint },
    eventName: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.primaryRed, marginTop: 2 },
    preview: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textFaint, marginTop: 3 },
    unread: { minWidth: 19, height: 19, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryRed },
    unreadText: { fontFamily: fonts.bodyBold, fontSize: 9.5, color: colors.onPrimary },
  });
}

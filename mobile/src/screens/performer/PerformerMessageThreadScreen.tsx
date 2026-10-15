import { FlatList } from '../../components/LiquidScroll';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../../api/client';
import * as marketplaceChatApi from '../../api/marketplaceChat';
import type { MarketplaceChatMessage } from '../../api/marketplaceChat';
import Avatar from '../../components/Avatar';
import BackButton from '../../components/BackButton';
import GlassSurface from '../../components/GlassSurface';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { PerformerMoreStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<PerformerMoreStackParamList, 'PerformerMessageThread'>;

const POLL_MS = 12000;

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// Deliberately a focused text-only thread for accepted marketplace requests.
// It keeps marketplace coordination separate from lesson chat and only the
// server can create a conversation (once the performer accepts the request).
export default function PerformerMessageThreadScreen({ navigation, route }: Props) {
  const { chatId, title, photoUrl, eventLabel } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const { toast } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [messages, setMessages] = useState<MarketplaceChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const listRef = useRef<FlatList<MarketplaceChatMessage>>(null);

  const load = useCallback(async () => {
    try {
      const result = await marketplaceChatApi.fetchMarketplaceChatMessages(chatId);
      setMessages(result.messages || []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load this conversation.');
    }
  }, [chatId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  function scrollToLatest() {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      const result = await marketplaceChatApi.sendMarketplaceChatMessage(chatId, text);
      setMessages((current) => current.some((message) => message.id === result.message.id) ? current : [...current, result.message]);
      scrollToLatest();
    } catch (err) {
      setDraft(text);
      toast(err instanceof ApiError ? err.message : 'Could not send your message.', 'error');
    } finally {
      setSending(false);
    }
  }

  const renderMessage = ({ item, index }: { item: MarketplaceChatMessage; index: number }) => {
    const mine = item.senderId === user?.id;
    const prior = index > 0 ? messages[index - 1] : null;
    const dayChanged = !prior || new Date(prior.createdAt).toDateString() !== new Date(item.createdAt).toDateString();
    return (
      <>
        {dayChanged && <Text style={styles.dayDivider}>{formatDay(item.createdAt)}</Text>}
        <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowTheirs]}>
          {!mine && <Avatar name={item.senderName || title} photoUrl={photoUrl} size={26} viewable={false} />}
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
            {!mine && !!item.senderName && <Text style={styles.senderName}>{item.senderName}</Text>}
            <Text style={[styles.messageText, mine && styles.messageTextMine]}>{item.text}</Text>
            <Text style={[styles.time, mine && styles.timeMine]}>{formatTime(item.createdAt)}</Text>
          </View>
        </View>
      </>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <View style={styles.header}>
        <GlassSurface clear pointerEvents="none" style={[StyleSheet.absoluteFill, styles.headerGlass]} />
        <BackButton onPress={() => navigation.goBack()} />
        <Avatar name={title} photoUrl={photoUrl} size={38} viewable={false} />
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <View style={styles.eventRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.eventText} numberOfLines={1}>{eventLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.notice}>
        <Ionicons name="shield-checkmark-outline" size={15} color={colors.primaryRed} />
        <Text style={styles.noticeText}>Keep event details and payment arrangements safely in Mozart Techniques.</Text>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.primaryRed} /></View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={29} color={colors.danger} />
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable style={styles.retryBtn} onPress={load}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={[styles.messageList, messages.length === 0 && styles.messageListEmpty]}
          onContentSizeChange={scrollToLatest}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><Ionicons name="sparkles-outline" size={26} color={colors.primaryRed} /></View>
              <Text style={styles.emptyTitle}>You’re connected</Text>
              <Text style={styles.emptyText}>Say hello and start coordinating {eventLabel.toLowerCase()}.</Text>
            </View>
          }
        />
      )}

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message…"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          multiline
          maxLength={2000}
          editable={!sending}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={() => { if (Platform.OS !== 'ios') send(); }}
        />
        <Pressable style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]} onPress={send} disabled={!draft.trim() || sending}>
          {sending ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Ionicons name="send" size={17} color={colors.onPrimary} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: 'transparent' },
    headerGlass: { borderRadius: 0 },
    headerCopy: { flex: 1, minWidth: 0 },
    title: { fontSize: 15.5, fontFamily: fonts.displayBlack, color: colors.text },
    eventRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
    eventText: { flex: 1, fontSize: 10.8, fontFamily: fonts.body, color: colors.textFaint },
    notice: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8, paddingHorizontal: 18, backgroundColor: `${colors.primaryRed}0A`, borderBottomWidth: 1, borderBottomColor: `${colors.primaryRed}16` },
    noticeText: { flex: 1, fontSize: 10.5, lineHeight: 14, fontFamily: fonts.body, color: colors.textSoft },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
    errorText: { textAlign: 'center', fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.danger },
    retryBtn: { backgroundColor: colors.primaryRed, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
    retryText: { color: colors.onPrimary, fontFamily: fonts.bodyBold, fontSize: 12.5 },
    messageList: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
    messageListEmpty: { justifyContent: 'center' },
    dayDivider: { alignSelf: 'center', marginTop: 8, marginBottom: 12, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 4, fontSize: 10.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint },
    messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 8 },
    messageRowMine: { justifyContent: 'flex-end' },
    messageRowTheirs: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '78%', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, borderRadius: 17, flexShrink: 1 },
    bubbleMine: { backgroundColor: colors.primaryRed, borderBottomRightRadius: 4 },
    bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
    senderName: { marginBottom: 2, fontFamily: fonts.bodyBold, fontSize: 10.5, color: colors.primaryRed },
    messageText: { flexShrink: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.text },
    messageTextMine: { color: colors.onPrimary },
    time: { alignSelf: 'flex-end', marginTop: 3, fontFamily: fonts.body, fontSize: 9.5, color: colors.textFaint },
    timeMine: { color: 'rgba(255,255,255,0.78)' },
    emptyState: { alignItems: 'center', paddingHorizontal: 34 },
    emptyIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.primaryRed}12`, marginBottom: 14 },
    emptyTitle: { fontFamily: fonts.displayBlack, fontSize: 16, color: colors.text },
    emptyText: { marginTop: 6, textAlign: 'center', lineHeight: 18, fontFamily: fonts.body, fontSize: 12.5, color: colors.textFaint },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    input: { flex: 1, minHeight: 42, maxHeight: 112, borderRadius: 21, paddingHorizontal: 15, paddingTop: 11, paddingBottom: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 18, color: colors.text, textAlignVertical: 'center' },
    sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryRed },
    sendBtnDisabled: { opacity: 0.42 },
  });
}

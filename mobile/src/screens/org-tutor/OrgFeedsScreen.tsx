import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, StyleSheet, Text, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../../api/client';
import * as orgChatApi from '../../api/orgChat';
import * as organizationsApi from '../../api/organizations';
import type { OrgContentItem } from '../../api/organizations';
import Avatar from '../../components/Avatar';
import BackButton from '../../components/BackButton';
import OrgContentComposer from '../../components/OrgContentComposer';
import { useAuth } from '../../context/AuthContext';
import { useRoleMode } from '../../context/RoleModeContext';
import { useToast } from '../../context/ToastContext';
import type { MainStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'OrgFeeds'>;

const REACTIONS = ['👍', '❤️', '😂', '😢', '🙏'];

function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|heic)(\?|$)/i.test(url);
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Styled like a community feed - every tutor and student linked to the
// organization sees the same posts, reacts with a long press (same 5-emoji
// picker as chat/Orientation), and can share any post straight into an
// org-chat thread. The org's own owner login gets a real composer here
// (text, photo, or video), gated on the workspace's isOrgOwner flag.
export default function OrgFeedsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { toast } = useToast();
  const { activeOrgId } = useRoleMode();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OrgContentItem[]>([]);
  const [isOrgOwner, setIsOrgOwner] = useState(false);
  const [orgLogo, setOrgLogo] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [reactTarget, setReactTarget] = useState<OrgContentItem | null>(null);
  const [shareTarget, setShareTarget] = useState<OrgContentItem | null>(null);

  const load = useCallback(() => {
    return organizationsApi
      .fetchTutorWorkspace(activeOrgId ?? undefined)
      .then((data) => {
        setItems(data.content.filter((item) => ['feed', 'photo', 'video'].includes(item.type)));
        setIsOrgOwner(data.isOrgOwner);
        setOrgLogo(resolveMediaUrl(data.organization.logoUrl));
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your organization feeds.'));
  }, [activeOrgId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function react(item: OrgContentItem, emoji: string) {
    setReactTarget(null);
    const prev = items;
    setItems((list) =>
      list.map((p) => {
        if (p.id !== item.id) return p;
        const toggledOff = p.myReaction === emoji;
        const reactions = p.reactions.filter((r) => r.userId !== user?.id);
        if (!toggledOff && user) reactions.push({ userId: user.id, emoji });
        return { ...p, reactions, myReaction: toggledOff ? null : emoji };
      }),
    );
    try {
      await organizationsApi.reactToOrgContent(item.id, emoji);
    } catch {
      setItems(prev);
      toast('Could not react to that post.', 'error');
    }
  }

  async function shareToConversation(item: OrgContentItem, conversationId: number) {
    setShareTarget(null);
    const fileUrl = resolveMediaUrl(item.fileUrl);
    try {
      if (fileUrl || item.url) {
        await orgChatApi.sendOrgConversationMessage(conversationId, item.text || '', { title: item.title, url: (fileUrl || item.url)! });
      } else {
        await orgChatApi.sendOrgConversationMessage(conversationId, `📌 ${item.title}${item.text ? `\n${item.text}` : ''}`);
      }
      toast('Shared to chat.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not share that post.', 'error');
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title} numberOfLines={1}>Organization Feeds</Text>
        {isOrgOwner ? (
          <Pressable style={styles.headerBtn} onPress={() => setComposeOpen(true)} hitSlop={8}>
            <Ionicons name="add-circle" size={24} color={colors.primaryRed} />
          </Pressable>
        ) : (
          <View style={{ width: 42 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="newspaper-outline" size={26} color={colors.textFaint} />
          <Text style={styles.emptyText}>No feed posts yet.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.map((item) => {
            const fileUrl = resolveMediaUrl(item.fileUrl);
            return (
              <Pressable key={item.id} style={styles.card} onLongPress={() => setReactTarget(item)} delayLongPress={280}>
                <View style={styles.cardHeaderRow}>
                  <Avatar name={item.createdByName} photoUrl={orgLogo} size={30} viewable={false} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardAuthor}>{item.createdByName}</Text>
                    <Text style={styles.cardTime}>{timeAgo(item.createdAt)}</Text>
                  </View>
                  <Pressable style={styles.shareBtn} onPress={() => setShareTarget(item)} hitSlop={8}>
                    <Ionicons name="arrow-redo-outline" size={18} color={colors.textFaint} />
                  </Pressable>
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {item.text ? <Text style={styles.cardBody}>{item.text}</Text> : null}
                {fileUrl && isImageUrl(fileUrl) ? (
                  <Image source={{ uri: fileUrl }} style={styles.image} resizeMode="cover" />
                ) : fileUrl || item.url ? (
                  <Pressable style={styles.openBtn} onPress={() => Linking.openURL((fileUrl || item.url)!)}>
                    <Ionicons name={item.type === 'video' ? 'play-circle-outline' : 'open-outline'} size={14} color={colors.primaryRed} />
                    <Text style={styles.openBtnText}>{item.type === 'video' ? 'Play video' : 'Open'}</Text>
                  </Pressable>
                ) : null}
                {item.reactions.length ? (
                  <View style={[styles.reactionsPill, item.myReaction && styles.reactionsPillActive]}>
                    <Text style={styles.reactionsPillText}>
                      {Array.from(new Set(item.reactions.map((r) => r.emoji))).join('')}
                      {item.reactions.length > 1 ? ` ${item.reactions.length}` : ''}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <ReactSheet post={reactTarget} onClose={() => setReactTarget(null)} onReact={react} colors={colors} />
      <ShareSheet post={shareTarget} onClose={() => setShareTarget(null)} onShare={shareToConversation} colors={colors} />
      <OrgContentComposer
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        mode="feed"
        colors={colors}
        onPosted={(item) => {
          setComposeOpen(false);
          if (['feed', 'photo', 'video'].includes(item.type)) setItems((list) => [item, ...list]);
          toast('Posted to the feed.', 'success');
        }}
      />
    </View>
  );
}

function ReactSheet({
  post,
  onClose,
  onReact,
  colors,
}: {
  post: OrgContentItem | null;
  onClose: () => void;
  onReact: (post: OrgContentItem, emoji: string) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!post) return null;
  return (
    <Modal visible={!!post} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.reactSheetBackdrop} onPress={onClose}>
        <View style={styles.reactSheetRow}>
          {REACTIONS.map((emoji) => {
            const active = post.myReaction === emoji;
            return (
              <Pressable
                key={emoji}
                style={[styles.reactionBtn, active && styles.reactionBtnActive]}
                onPress={() => onReact(post, emoji)}
              >
                <Text style={styles.reactSheetEmoji}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

function ShareSheet({
  post,
  onClose,
  onShare,
  colors,
}: {
  post: OrgContentItem | null;
  onClose: () => void;
  onShare: (post: OrgContentItem, conversationId: number) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<orgChatApi.OrgConversation[]>([]);
  const [organizationName, setOrganizationName] = useState('');

  useEffect(() => {
    if (!post) return;
    setLoading(true);
    orgChatApi
      .fetchMyOrgConversations()
      .then((data) => {
        setConversations(data.conversations);
        setOrganizationName(data.organizationName);
      })
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [post]);

  if (!post) return null;

  return (
    <Modal visible={!!post} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.shareSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Share to chat</Text>
          {loading ? (
            <ActivityIndicator color={colors.primaryRed} style={{ marginVertical: 20 }} />
          ) : conversations.length === 0 ? (
            <Text style={styles.emptyText}>No conversations to share to yet.</Text>
          ) : (
            conversations.map((conv) => {
              const isGroup = conv.type === 'group' || conv.type === 'tutor-group';
              const label = conv.title && conv.title !== 'Conversation' ? conv.title : isGroup ? 'Group chat' : organizationName || 'Organization';
              return (
                <Pressable key={conv.id} style={styles.shareRow} onPress={() => onShare(post, conv.id)}>
                  <Ionicons name={isGroup ? 'people' : 'business'} size={17} color={colors.primaryRed} />
                  <Text style={styles.shareRowText}>{label}</Text>
                </Pressable>
              );
            })
          )}
        </Pressable>
      </Pressable>
    </Modal>
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
    title: { flex: 1, fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center' },
    headerBtn: { width: 42, alignItems: 'flex-end' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 8 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, textAlign: 'center', fontSize: 13 },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 12,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    cardAuthor: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text },
    cardTime: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 1 },
    shareBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 14.5, fontFamily: fonts.bodyBold, color: colors.text },
    cardBody: { fontSize: 13, fontFamily: fonts.body, color: colors.textSoft, marginTop: 6, lineHeight: 19 },
    image: { width: '100%', height: 180, borderRadius: 12, marginTop: 10, backgroundColor: colors.background },
    openBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, alignSelf: 'flex-start' },
    openBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    reactionsPill: { alignSelf: 'flex-start', backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginTop: 10 },
    reactionsPillActive: { backgroundColor: `${colors.primaryRed}17` },
    reactionsPillText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textSoft },
    reactSheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
    reactSheetRow: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    reactionBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    reactionBtnActive: { backgroundColor: `${colors.primaryRed}17` },
    reactSheetEmoji: { fontSize: 22 },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    shareSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.border },
    shareRowText: { fontSize: 14, fontFamily: fonts.bodyMedium, color: colors.text },
    cardMeta: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 10 },
  });
}

import { FlatList } from '../../components/LiquidScroll';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../../api/client';
import * as supportAgentApi from '../../api/supportAgent';
import type { AgentSupportThread } from '../../api/supportAgent';
import type { SupportMessage } from '../../api/types';
import BackButton from '../../components/BackButton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { MainStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'SupportThread'>;

const POLL_MS = 4000;

// The agent side of the exact conversation LiveSupportScreen.tsx renders
// for the customer - same bubble styling and composer, mirrored here. No
// single-thread GET route exists server-side (only the full inbox list),
// so this polls the same list and picks its own thread out of it, same
// cost as a dedicated fetch would be at this data size.
export default function SupportThreadScreen({ route, navigation }: Props) {
  const { threadId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm, actionSheet } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [thread, setThread] = useState<AgentSupportThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [closing, setClosing] = useState(false);
  const listRef = useRef<FlatList<SupportMessage>>(null);

  const load = useCallback(async () => {
    try {
      const res = await supportAgentApi.fetchAgentThreads();
      const found = res.threads.find((t) => t.id === threadId);
      if (found) setThread(found);
    } catch {
      // Silent - polling retries on its own.
    }
  }, [threadId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const isMine = thread && (thread.assignedAgentId === user?.id || user?.role === 'admin');
  const canReply = thread && (thread.assignedAgentId === user?.id || (user?.role === 'admin' && thread.status !== 'waiting_for_agent'));

  async function claim() {
    if (!thread) return;
    setClaiming(true);
    try {
      const res = await supportAgentApi.claimThread(thread.id);
      setThread(res.thread);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not claim this conversation.', 'error');
    } finally {
      setClaiming(false);
    }
  }

  async function send() {
    if (!thread) return;
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      const res = await supportAgentApi.sendAgentMessage(thread.id, text);
      setThread(res.thread);
    } catch (err) {
      setDraft(text);
      toast(err instanceof ApiError ? err.message : 'Could not send that reply.', 'error');
    } finally {
      setSending(false);
    }
  }

  async function sendAttachment(file: { uri: string; name: string; type: string }) {
    if (!thread || attaching) return;
    setAttaching(true);
    try {
      const res = await supportAgentApi.sendAgentAttachment(thread.id, file);
      setThread(res.thread);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send that attachment.', 'error');
    } finally {
      setAttaching(false);
    }
  }

  // Guards against expo-document-picker/expo-image-picker's
  // PickingInProgressException - only one native picking session is
  // allowed at a time, and these two functions are both reachable from the
  // same attachment menu, so a second tap before the first sheet appears
  // used to throw this completely unhandled.
  const pickerBusyRef = useRef(false);

  async function pickPhotoOrVideo() {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast('Allow photo library access to add a photo or video.', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const fallbackName = asset.type === 'video' ? 'video.mp4' : 'photo.jpg';
      await sendAttachment({ uri: asset.uri, name: asset.fileName || asset.uri.split('/').pop() || fallbackName, type: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg') });
    } catch {
      toast('Could not open the photo picker. Try again in a moment.', 'error');
    } finally {
      pickerBusyRef.current = false;
    }
  }

  async function pickDocument() {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await sendAttachment({ uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' });
    } catch {
      toast('Could not open the file picker. Try again in a moment.', 'error');
    } finally {
      pickerBusyRef.current = false;
    }
  }

  function pickAttachment() {
    if (!thread || attaching) return;
    actionSheet({
      title: 'Attach to reply',
      actions: [
        { label: 'Photo or video', onPress: pickPhotoOrVideo },
        { label: 'Document or other file', onPress: pickDocument },
      ],
    });
  }

  async function closeConversation() {
    if (!thread) return;
    const ok = await confirm({ title: 'Close conversation?', message: 'The customer can still start a new one later.', confirmLabel: 'Close', destructive: true });
    if (!ok) return;
    setClosing(true);
    try {
      const res = await supportAgentApi.closeThread(thread.id);
      setThread(res.thread);
      toast('Conversation closed.', 'success');
      navigation.goBack();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not close this conversation.', 'error');
    } finally {
      setClosing(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{thread?.userName || 'Conversation'}</Text>
          {thread ? <Text style={styles.subtitle}>{thread.userEmail}</Text> : null}
        </View>
        {thread && thread.status !== 'closed' ? (
          isMine ? (
            <Pressable onPress={closeConversation} disabled={closing} hitSlop={8}>
              {closing ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.closeLink}>Close</Text>}
            </Pressable>
          ) : (
            <Pressable style={styles.claimBtn} onPress={claim} disabled={claiming}>
              {claiming ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Text style={styles.claimBtnText}>Claim</Text>}
            </Pressable>
          )
        ) : (
          <View style={{ width: 42 }} />
        )}
      </View>

      {loading || !thread ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={thread.messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const mine = item.sender === 'agent' || item.sender === 'admin';
            return (
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[styles.bubbleText, mine && { color: colors.onPrimary }]}>{item.text}</Text>
                <SupportAttachment attachment={item.attachment} mine={mine} colors={colors} />
              </View>
            );
          }}
        />
      )}

      {thread && thread.status !== 'closed' ? (
        canReply ? (
          <View style={styles.composer}>
            <Pressable style={styles.clipBtn} onPress={pickAttachment} disabled={attaching} hitSlop={8}>
              {attaching ? <ActivityIndicator size="small" color={colors.textFaint} /> : <Ionicons name="attach" size={22} color={colors.textFaint} />}
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="Reply..."
              placeholderTextColor={colors.textFaint}
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <Pressable style={styles.sendBtn} onPress={send} disabled={sending || !draft.trim()}>
              {sending ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Ionicons name="send" size={17} color={colors.onPrimary} />}
            </Pressable>
          </View>
        ) : (
          <View style={styles.claimNotice}>
            <Text style={styles.claimNoticeText}>Claim this conversation to reply.</Text>
          </View>
        )
      ) : null}
    </KeyboardAvoidingView>
  );
}

function SupportAttachment({ attachment, mine, colors }: { attachment: unknown; mine: boolean; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const file = attachment && typeof attachment === 'object' ? attachment as { url?: string; name?: string; type?: string } : null;
  const url = resolveMediaUrl(file?.url);
  if (!file || !url) return null;
  return (
    <Pressable style={[styles.attachmentRow, mine && styles.attachmentRowMine]} onPress={() => Linking.openURL(url)}>
      <Ionicons name={file.type?.startsWith('image/') ? 'image-outline' : file.type?.startsWith('video/') ? 'videocam-outline' : 'document-outline'} size={16} color={mine ? colors.onPrimary : colors.text} />
      <Text style={[styles.attachmentName, mine && { color: colors.onPrimary }]} numberOfLines={1}>{file.name || 'Open attachment'}</Text>
      <Ionicons name="open-outline" size={14} color={mine ? colors.onPrimary : colors.textFaint} />
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
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text },
    subtitle: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 1 },
    closeLink: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.danger },
    claimBtn: { backgroundColor: colors.primaryRed, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
    claimBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    listContent: { padding: 16, gap: 8, flexGrow: 1 },
    bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.primaryRed, borderBottomRightRadius: 4 },
    bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
    bubbleText: { fontSize: 14, fontFamily: fonts.body, color: colors.text, lineHeight: 20 },
    attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: colors.border, maxWidth: 230 },
    attachmentRowMine: { borderTopColor: 'rgba(255,255,255,0.35)' },
    attachmentName: { flex: 1, fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, textDecorationLine: 'underline' },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    clipBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    input: {
      flex: 1,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
    },
    sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryRed, alignItems: 'center', justifyContent: 'center' },
    claimNotice: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, alignItems: 'center' },
    claimNoticeText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint },
  });
}

import { FlatList } from '../components/LiquidScroll';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,  } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as supportApi from '../api/support';
import type { SupportMessage } from '../api/types';
import BackButton from '../components/BackButton';
import { useToast } from '../context/ToastContext';
import type { MoreStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MoreStackParamList, 'LiveSupport'>;

const POLL_MS = 4000;

// Real thread - server.js's POST /api/mozart-ai/message auto-escalates to a
// human agent (same as the web widget), it's not a scripted bot here.
export default function LiveSupportScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const listRef = useRef<FlatList<SupportMessage>>(null);

  const load = useCallback(async () => {
    try {
      const data = await supportApi.fetchSupportThread();
      setMessages(data.thread.messages);
    } catch {
      // Silent - polling retries on its own, no need to flash an error for
      // one missed refresh.
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      const data = await supportApi.sendSupportMessage(text);
      setMessages(data.thread.messages);
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  async function pickAttachment() {
    if (attaching) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast('Permission needed: allow photo library access to send an attachment.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setAttaching(true);
    try {
      const name = asset.fileName || asset.uri.split('/').pop() || 'attachment.jpg';
      const type = asset.mimeType || 'image/jpeg';
      const data = await supportApi.sendSupportAttachment({ uri: asset.uri, name, type });
      setMessages(data.thread.messages);
    } catch {
      toast('Could not send that attachment. Try again in a moment.', 'error');
    } finally {
      setAttaching(false);
    }
  }

  function onVoiceNotePress() {
    toast("Voice notes aren't available yet - type your message for now.");
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Live support</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>Send a message and we'll get back to you.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.sender === 'user';
            return (
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[styles.bubbleText, mine && { color: colors.onPrimary }]}>{item.text}</Text>
              </View>
            );
          }}
        />
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable style={styles.clipBtn} onPress={pickAttachment} disabled={attaching} hitSlop={8}>
          {attaching ? (
            <ActivityIndicator size="small" color={colors.textFaint} />
          ) : (
            <Ionicons name="attach" size={22} color={colors.textFaint} />
          )}
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Message support…"
          placeholderTextColor={colors.textFaint}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        {draft.trim().length > 0 ? (
          <Pressable style={styles.sendBtn} onPress={send} disabled={sending}>
            <Ionicons name="send" size={17} color={colors.onPrimary} />
          </Pressable>
        ) : (
          <Pressable style={styles.sendBtn} onPress={onVoiceNotePress}>
            <Ionicons name="mic" size={19} color={colors.onPrimary} />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
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
    headerSpacer: { width: 36 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
    listContent: { padding: 16, gap: 8, flexGrow: 1 },
    bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.primaryRed, borderBottomRightRadius: 4 },
    bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
    bubbleText: { fontSize: 14, fontFamily: fonts.body, color: colors.text, lineHeight: 20 },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    clipBtn: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    sendBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primaryRed,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

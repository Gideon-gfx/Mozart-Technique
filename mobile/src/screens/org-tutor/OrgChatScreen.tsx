import { FlatList } from '../../components/LiquidScroll';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEvent } from 'expo';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, Share, StyleSheet, Text, TextInput, View,  } from 'react-native';

import { ApiError, resolveMediaUrl } from '../../api/client';
import * as libraryApi from '../../api/library';
import * as orgChatApi from '../../api/orgChat';
import type { OrgChatMessage, OrgChatPoll } from '../../api/orgChat';
import * as organizationsApi from '../../api/organizations';
import type { OrgLibraryItem } from '../../api/organizations';
import * as threadsApi from '../../api/threads';
import type { MuteDuration } from '../../api/threads';
import type { ChatAttachment, LibraryItem } from '../../api/types';
import Avatar from '../../components/Avatar';
import BackButton from '../../components/BackButton';
import LocationMapView from '../../components/LocationMapView';
import { useAuth } from '../../context/AuthContext';
import { useRoleMode } from '../../context/RoleModeContext';
import { useToast } from '../../context/ToastContext';
import type { MainStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'OrgChat'>;

const POLL_MS = 15000; // org-chat has no websocket layer on the server - polling is the real, only mechanism here (matches web's own ChatKit behavior).
const REACTIONS = ['👍', '❤️', '😂', '😢', '🙏'];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function messagePreview(m: OrgChatMessage) {
  if (m.deleted) return 'This message was deleted';
  if (m.text) return m.text;
  if (m.attachment) return ({ image: 'Photo', video: 'Video', audio: 'Audio' } as Record<string, string>)[m.attachment.kind] || m.attachment.name;
  if (m.libraryItem) return `Clip: ${m.libraryItem.title}`;
  if (m.poll) return `Poll: ${m.poll.question}`;
  if (m.location) return 'Location';
  return 'Message';
}

// A real org-chat thread (org<->tutor direct, or a classroom group) - the
// same backend (data/org-chat.js) org-tutor.html's ChatKit-mounted panel
// uses, with the same attachment/poll/location/reaction/pin/delete
// features as the per-assignment ChatScreen (that backend already
// supported all of it - this screen just wires up the client for it).
export default function OrgChatScreen({ navigation, route }: Props) {
  const { conversationId, title, photoUrl: headerPhotoUrl } = route.params;
  const { user } = useAuth();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [voicePaused, setVoicePaused] = useState(false);
  const [voiceReady, setVoiceReady] = useState<{ uri: string; durationMillis: number } | null>(null);
  const { colors } = useTheme();
  const { toast, confirm } = useToast();
  const { mode } = useRoleMode();
  // Only matters for an account that also owns the org it's linked to as a
  // tutor - without this, the server would resolve every message this
  // account sends here as role 'org' (checked first), which would never
  // mark its own messages read on the tutor side and make them show up as
  // unread there. Undefined (Sponsor mode, or a normal single-role
  // account) leaves the server's own default resolution in place.
  const asRole = mode === 'org-tutor' ? 'tutor' : undefined;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [messages, setMessages] = useState<OrgChatMessage[]>([]);
  const [conversation, setConversation] = useState<orgChatApi.OrgConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [clipMenuOpen, setClipMenuOpen] = useState(false);
  const [clipPickerOpen, setClipPickerOpen] = useState(false);
  const [pollSheetOpen, setPollSheetOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [muteSubmenuOpen, setMuteSubmenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // Starts optimistic (no seed fetch exists yet for org-chat thread prefs,
  // unlike /api/conversations for lesson chat) - correct as soon as either
  // is toggled this visit, same as a freshly-favorited/muted thread would
  // read before its list-level enrichment catches up.
  const [prefs, setPrefs] = useState({ favorite: false, muted: false });
  const [msgMenuItem, setMsgMenuItem] = useState<OrgChatMessage | null>(null);
  const [reactTarget, setReactTarget] = useState<OrgChatMessage | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const listRef = useRef<FlatList<OrgChatMessage>>(null);

  const load = useCallback(() => {
    return orgChatApi
      .fetchOrgConversationMessages(conversationId, asRole)
      .then((data) => {
        setMessages(data.messages);
        setConversation(data.conversation);
      })
      .catch(() => {});
  }, [conversationId, asRole]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  function scrollToEnd() {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      await orgChatApi.sendOrgConversationMessage(conversationId, text, undefined, asRole);
      await load();
      scrollToEnd();
    } catch (err) {
      setDraft(text);
      toast(err instanceof ApiError ? err.message : 'Could not send that message.', 'error');
    } finally {
      setSending(false);
    }
  }

  async function sendFileAsset(uri: string, name: string, type: string) {
    setAttaching(true);
    try {
      await orgChatApi.sendOrgAttachment(conversationId, { uri, name, type }, asRole);
      await load();
      scrollToEnd();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send that attachment. Try again in a moment.', 'error');
    } finally {
      setAttaching(false);
    }
  }

  async function startVoiceNote() {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        toast('Permission needed: allow microphone access to send a voice note.', 'error');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setVoicePaused(false);
      setVoiceReady(null);
    } catch {
      toast('Could not start recording. Try again.', 'error');
    }
  }

  function togglePauseVoiceNote() {
    if (voicePaused) {
      recorder.record();
      setVoicePaused(false);
    } else {
      recorder.pause();
      setVoicePaused(true);
    }
  }

  async function cancelVoiceNote() {
    try {
      await recorder.stop();
    } catch {
      // nothing to clean up either way
    }
    setVoicePaused(false);
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }

  async function finishVoiceNote() {
    const hadRecorded = recorderState.durationMillis > 600;
    const durationMillis = recorderState.durationMillis;
    try {
      await recorder.stop();
    } catch {
      // still attempt to use whatever uri exists below
    }
    setVoicePaused(false);
    // Recording flips the shared audio session to allowsRecording:true -
    // flip it back now that recording is done, so playback isn't left
    // fighting a session still configured for recording.
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    if (hadRecorded && recorder.uri) {
      setVoiceReady({ uri: recorder.uri, durationMillis });
    } else {
      toast('Recording was too short.', 'error');
    }
  }

  function discardVoiceReady() {
    setVoiceReady(null);
  }

  function sendVoiceReady() {
    if (!voiceReady) return;
    sendFileAsset(voiceReady.uri, `voice-note-${Date.now()}.m4a`, 'audio/m4a');
    setVoiceReady(null);
  }

  // See ChatScreen.tsx's identical guard for why: expo-document-picker
  // allows only one picking session at a time and throws
  // PickingInProgressException (completely unhandled here before, so it
  // crashed the app like an uncaught promise rejection) if a second picker
  // call fires while one's still open - easy to hit since the clip menu's
  // buttons are all tappable at once.
  const pickerBusyRef = useRef(false);

  async function pickDocument() {
    setClipMenuOpen(false);
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      sendFileAsset(asset.uri, asset.name, asset.mimeType || 'application/octet-stream');
    } catch {
      toast('Could not open the file picker. Try again in a moment.', 'error');
    } finally {
      pickerBusyRef.current = false;
    }
  }

  async function pickMedia() {
    setClipMenuOpen(false);
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast('Permission needed: allow photo library access to send photos or videos.', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const fileName = asset.fileName || asset.uri.split('/').pop() || 'attachment';
      const type = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      sendFileAsset(asset.uri, fileName, type);
    } catch {
      toast('Could not open the photo picker. Try again in a moment.', 'error');
    } finally {
      pickerBusyRef.current = false;
    }
  }

  async function pickCamera() {
    setClipMenuOpen(false);
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        toast('Permission needed: allow camera access to take a photo.', 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      sendFileAsset(asset.uri, asset.fileName || 'photo.jpg', asset.mimeType || 'image/jpeg');
    } catch {
      toast('Could not open the camera. Try again in a moment.', 'error');
    } finally {
      pickerBusyRef.current = false;
    }
  }

  async function pickAudio() {
    setClipMenuOpen(false);
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      // A bare 'audio/*' wildcard doesn't reliably match real files against
      // iOS's UTType-based picker filter (it can show nothing selectable) -
      // listing the common audio types alongside the wildcard is the
      // documented workaround.
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      sendFileAsset(asset.uri, asset.name, asset.mimeType || 'audio/mpeg');
    } catch {
      toast('Could not open the file picker. Try again in a moment.', 'error');
    } finally {
      pickerBusyRef.current = false;
    }
  }

  async function shareLocation() {
    setClipMenuOpen(false);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      toast('Permission needed: allow location access to share your location.', 'error');
      return;
    }
    try {
      const position = await Location.getCurrentPositionAsync({});
      await orgChatApi.sendOrgLocation(conversationId, position.coords.latitude, position.coords.longitude, asRole);
      await load();
      scrollToEnd();
    } catch {
      toast('Could not share your location. Try again in a moment.', 'error');
    }
  }

  async function sendPollSubmit(question: string, options: string[]) {
    await orgChatApi.sendOrgPoll(conversationId, question, options, asRole);
    await load();
    setPollSheetOpen(false);
    scrollToEnd();
  }

  async function sendClip(item: { title: string; url: string }) {
    setClipPickerOpen(false);
    try {
      await orgChatApi.sendOrgConversationMessage(conversationId, '', item, asRole);
      await load();
      scrollToEnd();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not share that clip.', 'error');
    }
  }

  async function voteOnPoll(m: OrgChatMessage, optionId: number) {
    try {
      const data = await orgChatApi.voteOrgPoll(conversationId, m.id, optionId, asRole);
      setMessages((prev) => prev.map((x) => (x.id === data.message.id ? data.message : x)));
    } catch {
      toast('Could not vote. Try again in a moment.', 'error');
    }
  }

  async function reactToMessage(m: OrgChatMessage, emoji: string) {
    setReactTarget(null);
    setMsgMenuItem(null);
    try {
      const data = await orgChatApi.reactToOrgMessage(conversationId, m.id, emoji, asRole);
      setMessages((prev) => prev.map((x) => (x.id === data.message.id ? data.message : x)));
    } catch {
      toast('Could not react to that message.', 'error');
    }
  }

  async function togglePinMessage(m: OrgChatMessage) {
    setMsgMenuItem(null);
    try {
      const data = await orgChatApi.toggleOrgMessagePin(conversationId, m.id, asRole);
      setMessages((prev) => prev.map((x) => (x.id === data.message.id ? data.message : x)));
    } catch {
      toast('Could not pin that message.', 'error');
    }
  }

  async function copyMessage(m: OrgChatMessage) {
    setMsgMenuItem(null);
    await Clipboard.setStringAsync(m.text || '');
    toast('Copied.', 'success');
  }

  async function deleteMessage(m: OrgChatMessage) {
    setMsgMenuItem(null);
    try {
      const data = await orgChatApi.deleteOrgMessage(conversationId, m.id, asRole);
      setMessages((prev) => prev.map((x) => (x.id === data.message.id ? data.message : x)));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete that message.', 'error');
    }
  }

  function insertEmoji(emoji: string) {
    setDraft((prev) => prev + emoji);
  }

  async function onMeetingPress() {
    if (conversation?.meetingLink) {
      navigation.navigate('MeetingWebView', { url: conversation.meetingLink });
      return;
    }
    const link = 'https://meet.google.com/new';
    navigation.navigate('MeetingWebView', { url: link });
    try {
      const result = await orgChatApi.setOrgConversationMeetingLink(conversationId, link);
      setConversation(result.conversation);
    } catch {
      // Non-fatal - the meet link still opened, it just won't be reused next time.
    }
  }

  async function sendCallLink() {
    setMoreMenuOpen(false);
    if (!conversation?.meetingLink) {
      toast('No meeting link set: set one first using the call icon.', 'error');
      return;
    }
    try {
      await orgChatApi.sendOrgConversationMessage(conversationId, `📹 Join our call: ${conversation.meetingLink}`, undefined, asRole);
      await load();
      scrollToEnd();
    } catch {
      toast('Could not send call link. Try again in a moment.', 'error');
    }
  }

  async function exportTranscript() {
    setMoreMenuOpen(false);
    const lines = messages.filter((m) => !m.deleted).map((m) => {
      const who = m.senderId === user?.id ? 'You' : m.senderName;
      return `[${new Date(m.createdAt).toLocaleString()}] ${who}: ${messagePreview(m)}`;
    });
    try {
      await Share.share({ message: lines.join('\n') || 'No messages yet.' });
    } catch {
      // User cancelled the share sheet.
    }
  }

  async function toggleFavorite() {
    try {
      const data = await threadsApi.toggleFavorite('org', conversationId);
      setPrefs((p) => ({ ...p, favorite: data.favorite }));
    } catch {
      toast('Could not update favorite. Try again in a moment.', 'error');
    }
  }

  async function setMute(duration: MuteDuration | null) {
    setMuteSubmenuOpen(false);
    setMoreMenuOpen(false);
    try {
      await threadsApi.setMute('org', conversationId, duration);
      setPrefs((p) => ({ ...p, muted: Boolean(duration) }));
    } catch {
      toast('Could not update notifications. Try again in a moment.', 'error');
    }
  }

  async function clearChat() {
    setMoreMenuOpen(false);
    const ok = await confirm({ title: 'Clear this chat?', message: 'This removes all messages for you only.', confirmLabel: 'Clear', destructive: true });
    if (!ok) return;
    try {
      await threadsApi.clearThread('org', conversationId);
      load();
    } catch {
      toast('Could not clear chat. Try again in a moment.', 'error');
    }
  }

  async function deleteChat() {
    setMoreMenuOpen(false);
    const ok = await confirm({ title: 'Delete this chat?', message: "It'll disappear from your messages list until a new message arrives.", confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await threadsApi.deleteThread('org', conversationId);
      navigation.goBack();
    } catch {
      toast('Could not delete chat. Try again in a moment.', 'error');
    }
  }

  const pinnedMessage = messages.find((m) => m.pinned);
  const searchResults = searchQuery.trim()
    ? messages.filter((m) => !m.deleted && messagePreview(m).toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerIdentity}>
          <Avatar name={title} photoUrl={headerPhotoUrl} size={34} viewable={false} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {conversation?.type === 'group' || conversation?.type === 'tutor-group' ? `${conversation.participants.length} members` : 'Organization'}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerIconBtn} onPress={onMeetingPress} hitSlop={6}>
            <Ionicons name="videocam" size={18} color={colors.primaryRed} />
          </Pressable>
          <Pressable style={styles.headerIconBtn} onPress={() => setSearchOpen((v) => !v)} hitSlop={6}>
            <Ionicons name="search" size={17} color={colors.textFaint} />
          </Pressable>
          <Pressable style={styles.headerIconBtn} onPress={() => setMoreMenuOpen(true)} hitSlop={6}>
            <Ionicons name="ellipsis-vertical" size={17} color={colors.textFaint} />
          </Pressable>
        </View>
      </View>

      {searchOpen ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={15} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search in this conversation"
            placeholderTextColor={colors.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.trim() ? <Text style={styles.searchCount}>{searchResults.length}</Text> : null}
          <Pressable onPress={() => { setSearchOpen(false); setSearchQuery(''); }} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.textFaint} />
          </Pressable>
        </View>
      ) : null}

      {pinnedMessage && !searchOpen ? (
        <Pressable style={styles.pinnedBar} onPress={() => togglePinMessage(pinnedMessage)}>
          <Ionicons name="pin" size={13} color={colors.primaryRed} />
          <Text style={styles.pinnedBarText} numberOfLines={1}>{messagePreview(pinnedMessage)}</Text>
          <Ionicons name="close" size={14} color={colors.textFaint} />
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : searchOpen && searchQuery.trim() ? (
        <FlatList
          data={searchResults}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<View style={styles.centered}><Text style={styles.emptyText}>No matches.</Text></View>}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.senderId === user?.id ? styles.bubbleMine : styles.bubbleTheirs, { alignSelf: item.senderId === user?.id ? 'flex-end' : 'flex-start' }]}>
              {item.senderId !== user?.id ? <Text style={styles.senderName}>{item.senderName}</Text> : null}
              <Text style={[styles.bubbleText, item.senderId === user?.id && { color: colors.onPrimary }]}>{messagePreview(item)}</Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No messages yet - say hello.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.senderId === user?.id;
            if (item.deleted) {
              return (
                <View style={[styles.bubble, styles.bubbleDeleted, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}>
                  <Text style={styles.deletedText}>This message was deleted</Text>
                </View>
              );
            }
            return (
              <Pressable
                onLongPress={() => setMsgMenuItem(item)}
                style={[styles.bubbleRow, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}
              >
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {item.pinned ? <Ionicons name="pin" size={11} color={mine ? 'rgba(255,255,255,0.85)' : colors.textFaint} style={styles.pinIcon} /> : null}
                  {!mine ? <Text style={styles.senderName}>{item.senderName}</Text> : null}
                  {item.attachment ? <AttachmentView attachment={item.attachment} mine={mine} colors={colors} onOpenImage={setViewerUrl} /> : null}
                  {item.libraryItem ? (
                    <Pressable style={styles.clipBox} onPress={() => Linking.openURL(item.libraryItem!.url)}>
                      <Ionicons name="play-circle" size={18} color={mine ? '#fff' : colors.primaryRed} />
                      <Text style={[styles.clipText, mine && { color: '#fff' }]} numberOfLines={2}>{item.libraryItem.title}</Text>
                    </Pressable>
                  ) : null}
                  {item.poll ? <PollView poll={item.poll} myUserId={user?.id} mine={mine} onVote={(optionId) => voteOnPoll(item, optionId)} colors={colors} /> : null}
                  {item.location ? <LocationMapView lat={item.location.lat} lng={item.location.lng} /> : null}
                  {item.text ? <Text style={[styles.bubbleText, mine && { color: colors.onPrimary }]}>{item.text}</Text> : null}
                  <Text style={[styles.bubbleTime, mine && { color: 'rgba(255,255,255,0.75)' }]}>{formatTime(item.createdAt)}</Text>
                </View>
                {item.reactions.length ? (
                  <View style={[styles.reactionsPill, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}>
                    <Text style={styles.reactionsPillText}>
                      {Array.from(new Set(item.reactions.map((r) => r.emoji))).join('')}
                      {item.reactions.length > 1 ? ` ${item.reactions.length}` : ''}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      <View style={styles.composer}>
        {recorderState.isRecording || voicePaused ? (
          <>
            <Pressable style={styles.recordCancelBtn} onPress={cancelVoiceNote} hitSlop={8}>
              <Ionicons name="trash-outline" size={19} color={colors.danger} />
            </Pressable>
            <View style={[styles.composerBar, styles.recordingRow]}>
              <Pressable style={styles.pauseBtn} onPress={togglePauseVoiceNote} hitSlop={8}>
                <Ionicons name={voicePaused ? 'play' : 'pause'} size={15} color={colors.primaryRed} />
              </Pressable>
              {!voicePaused ? <View style={styles.recordingDot} /> : null}
              <Text style={styles.recordingTime}>
                {Math.floor(recorderState.durationMillis / 60000)}:{String(Math.floor((recorderState.durationMillis % 60000) / 1000)).padStart(2, '0')}
              </Text>
              <Text style={styles.recordingHint}>{voicePaused ? 'Paused' : 'Recording voice note…'}</Text>
            </View>
            <Pressable style={styles.sendBtn} onPress={finishVoiceNote}>
              <Ionicons name="checkmark" size={19} color={colors.onPrimary} />
            </Pressable>
          </>
        ) : voiceReady ? (
          <>
            <Pressable style={styles.recordCancelBtn} onPress={discardVoiceReady} hitSlop={8}>
              <Ionicons name="trash-outline" size={19} color={colors.danger} />
            </Pressable>
            <View style={[styles.composerBar, styles.recordingRow]}>
              <Ionicons name="mic" size={16} color={colors.primaryRed} />
              <Text style={styles.recordingHint}>
                Voice note · {Math.floor(voiceReady.durationMillis / 60000)}:{String(Math.floor((voiceReady.durationMillis % 60000) / 1000)).padStart(2, '0')}
              </Text>
            </View>
            <Pressable style={styles.sendBtn} onPress={sendVoiceReady}>
              <Ionicons name="send" size={17} color={colors.onPrimary} />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={styles.clipBtn} onPress={() => setClipMenuOpen(true)} disabled={attaching} hitSlop={8}>
              {attaching ? <ActivityIndicator size="small" color={colors.textFaint} /> : <Ionicons name="attach" size={22} color={colors.textFaint} />}
            </Pressable>
            <View style={styles.composerBar}>
              <TextInput
                style={styles.composerInput}
                placeholder={`Message ${title.split(' ')[0]}...`}
                placeholderTextColor={colors.textFaint}
                value={draft}
                onChangeText={setDraft}
                multiline
              />
              <Pressable style={styles.emojiBtn} onPress={() => setEmojiPickerOpen(true)} hitSlop={8}>
                <Ionicons name="happy-outline" size={20} color={colors.textFaint} />
              </Pressable>
            </View>
            {draft.trim().length > 0 ? (
              <Pressable style={styles.sendBtn} onPress={send} disabled={sending}>
                <Ionicons name="send" size={17} color={colors.onPrimary} />
              </Pressable>
            ) : (
              <Pressable style={styles.sendBtn} onPress={startVoiceNote}>
                <Ionicons name="mic" size={19} color={colors.onPrimary} />
              </Pressable>
            )}
          </>
        )}
      </View>

      <ClipMenu
        visible={clipMenuOpen}
        onClose={() => setClipMenuOpen(false)}
        onDocument={pickDocument}
        onMedia={pickMedia}
        onCamera={pickCamera}
        onAudio={pickAudio}
        onLibrary={() => { setClipMenuOpen(false); setClipPickerOpen(true); }}
        onTeachingTools={mode === 'org-tutor' ? () => { setClipMenuOpen(false); navigation.navigate('TeachingTools'); } : undefined}
        onPoll={() => { setClipMenuOpen(false); setPollSheetOpen(true); }}
        onLocation={shareLocation}
        colors={colors}
      />
      <OrgLibraryClipPicker visible={clipPickerOpen} onClose={() => setClipPickerOpen(false)} onPick={sendClip} colors={colors} />
      <PollComposer visible={pollSheetOpen} onClose={() => setPollSheetOpen(false)} onSubmit={sendPollSubmit} colors={colors} />
      <MessageActionSheet
        item={msgMenuItem}
        myUserId={user?.id}
        onClose={() => setMsgMenuItem(null)}
        onReact={() => { setReactTarget(msgMenuItem); setMsgMenuItem(null); }}
        onCopy={copyMessage}
        onPin={togglePinMessage}
        onDelete={deleteMessage}
        colors={colors}
      />
      <ReactSheet message={reactTarget} myUserId={user?.id} onClose={() => setReactTarget(null)} onReact={reactToMessage} colors={colors} />
      <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />
      <EmojiPicker visible={emojiPickerOpen} onClose={() => setEmojiPickerOpen(false)} onPick={insertEmoji} colors={colors} />
      <MoreMenu
        visible={moreMenuOpen}
        onClose={() => { setMoreMenuOpen(false); setMuteSubmenuOpen(false); }}
        muteSubmenuOpen={muteSubmenuOpen}
        onOpenMuteSubmenu={() => setMuteSubmenuOpen(true)}
        onSearch={() => { setMoreMenuOpen(false); setSearchOpen(true); }}
        onMute={setMute}
        muted={prefs.muted}
        onFavorite={() => { setMoreMenuOpen(false); toggleFavorite(); }}
        favorite={prefs.favorite}
        onExport={exportTranscript}
        onClose2={() => { setMoreMenuOpen(false); navigation.goBack(); }}
        onSendCallLink={sendCallLink}
        onReport={() => { setMoreMenuOpen(false); setReportOpen(true); }}
        onClear={clearChat}
        onDelete={deleteChat}
        colors={colors}
      />
      <ReportSheet visible={reportOpen} onClose={() => setReportOpen(false)} conversationId={conversationId} colors={colors} />
    </KeyboardAvoidingView>
  );
}

function MoreMenu({
  visible,
  onClose,
  muteSubmenuOpen,
  onOpenMuteSubmenu,
  onSearch,
  onMute,
  muted,
  onFavorite,
  favorite,
  onExport,
  onClose2,
  onSendCallLink,
  onReport,
  onClear,
  onDelete,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  muteSubmenuOpen: boolean;
  onOpenMuteSubmenu: () => void;
  onSearch: () => void;
  onMute: (d: MuteDuration | null) => void;
  muted: boolean;
  onFavorite: () => void;
  favorite: boolean;
  onExport: () => void;
  onClose2: () => void;
  onSendCallLink: () => void;
  onReport: () => void;
  onClear: () => void;
  onDelete: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <View style={styles.popover}>
          <Pressable style={styles.popoverItem} onPress={onSearch}>
            <Ionicons name="search" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Search</Text>
          </Pressable>

          {!muteSubmenuOpen ? (
            <Pressable style={styles.popoverItem} onPress={() => (muted ? onMute(null) : onOpenMuteSubmenu())}>
              <Ionicons name={muted ? 'notifications-off' : 'notifications'} size={16} color={colors.text} />
              <Text style={styles.popoverItemText}>{muted ? 'Muted (tap to unmute)' : 'Notifications'}</Text>
              {!muted ? <Ionicons name="chevron-forward" size={13} color={colors.textFaint} style={{ marginLeft: 'auto' }} /> : null}
            </Pressable>
          ) : (
            <View style={styles.muteSubmenu}>
              <Pressable style={styles.popoverItem} onPress={() => onMute('8h')}><Text style={styles.popoverItemText}>8 hours</Text></Pressable>
              <Pressable style={styles.popoverItem} onPress={() => onMute('1w')}><Text style={styles.popoverItemText}>1 week</Text></Pressable>
              <Pressable style={styles.popoverItem} onPress={() => onMute('always')}><Text style={styles.popoverItemText}>Always</Text></Pressable>
            </View>
          )}

          <Pressable style={styles.popoverItem} onPress={onFavorite}>
            <Ionicons name={favorite ? 'star' : 'star-outline'} size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>{favorite ? 'Remove from Favorite' : 'Add to Favorite'}</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={onExport}>
            <Ionicons name="share-outline" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Export chat</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={onClose2}>
            <Ionicons name="close" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Close chat</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={onSendCallLink}>
            <Ionicons name="videocam" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Send call link</Text>
          </Pressable>
          <View style={styles.popoverDivider} />
          <Pressable style={styles.popoverItem} onPress={onReport}>
            <Ionicons name="flag" size={16} color={colors.danger} />
            <Text style={[styles.popoverItemText, { color: colors.danger }]}>Report</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={onClear}>
            <Ionicons name="brush" size={16} color={colors.danger} />
            <Text style={[styles.popoverItemText, { color: colors.danger }]}>Clear chat</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={onDelete}>
            <Ionicons name="trash" size={16} color={colors.danger} />
            <Text style={[styles.popoverItemText, { color: colors.danger }]}>Delete chat</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function ReportSheet({ visible, onClose, conversationId, colors }: { visible: boolean; onClose: () => void; conversationId: number; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { if (visible) setReason(''); }, [visible]);

  async function submit() {
    if (!reason.trim()) {
      toast('A short reason is required.', 'error');
      return;
    }
    setSending(true);
    try {
      await threadsApi.reportThread(`org:${conversationId}`, reason.trim());
      onClose();
      toast('Report submitted. Our team will review it.', 'success');
    } catch {
      toast('Could not submit report. Try again in a moment.', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Report this conversation</Text>
          <TextInput
            style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
            value={reason}
            onChangeText={setReason}
            placeholder="What's the issue?"
            placeholderTextColor={colors.textFaint}
            multiline
          />
          <Pressable style={styles.reportSubmitBtn} onPress={submit} disabled={sending}>
            {sending ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Text style={styles.reportSubmitBtnText}>Submit report</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ClipMenu({
  visible,
  onClose,
  onDocument,
  onMedia,
  onCamera,
  onAudio,
  onLibrary,
  onTeachingTools,
  onPoll,
  onLocation,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onDocument: () => void;
  onMedia: () => void;
  onCamera: () => void;
  onAudio: () => void;
  onLibrary: () => void;
  onTeachingTools?: () => void;
  onPoll: () => void;
  onLocation: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          {onTeachingTools ? <Pressable style={styles.popoverItem} onPress={onTeachingTools}><Ionicons name="musical-notes-outline" size={16} color={colors.text} /><Text style={styles.popoverItemText}>Teaching tools</Text></Pressable> : null}
          <Pressable style={styles.popoverItem} onPress={onDocument}>
            <Ionicons name="document-text-outline" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Documents</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={onMedia}>
            <Ionicons name="image-outline" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Photos &amp; Videos</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={onCamera}>
            <Ionicons name="camera" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Camera</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={onAudio}>
            <Ionicons name="musical-notes" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Audio</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={onLibrary}>
            <Ionicons name="videocam-outline" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Library clip</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={onPoll}>
            <Ionicons name="bar-chart" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Poll</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={onLocation}>
            <Ionicons name="location" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Location</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PollComposer({
  visible,
  onClose,
  onSubmit,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (question: string, options: string[]) => Promise<void>;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setQuestion(''); setOptions(['', '']); setError(null); }
  }, [visible]);

  function updateOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  async function submit() {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) {
      setError('A poll needs a question and at least 2 options.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSubmit(question.trim(), cleanOptions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create that poll.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Create a poll</Text>
          <TextInput style={styles.input} value={question} onChangeText={setQuestion} placeholder="Ask a question" placeholderTextColor={colors.textFaint} />
          {options.map((opt, i) => (
            <TextInput
              key={i}
              style={[styles.input, { marginTop: 8 }]}
              value={opt}
              onChangeText={(v) => updateOption(i, v)}
              placeholder={`Option ${i + 1}`}
              placeholderTextColor={colors.textFaint}
            />
          ))}
          {options.length < 6 ? (
            <Pressable style={styles.addOptionBtn} onPress={() => setOptions((prev) => [...prev, ''])}>
              <Ionicons name="add" size={14} color={colors.primaryRed} />
              <Text style={styles.addOptionText}>Add option</Text>
            </Pressable>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable style={[styles.sendBtn, styles.pollSubmitBtn]} onPress={submit} disabled={sending}>
            {sending ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Text style={styles.pollSubmitText}>Create poll</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const EMOJI_SET = [
  '😀', '😂', '😍', '🥰', '😊', '😉', '😢', '😭', '😡', '😮',
  '👍', '👎', '👏', '🙏', '💪', '🤝', '👋', '✌️', '🤞', '🙌',
  '❤️', '🔥', '🎉', '🎵', '🎹', '🎸', '🎤', '⭐', '✨', '💯',
];

function EmojiPicker({ visible, onClose, onPick, colors }: { visible: boolean; onClose: () => void; onPick: (emoji: string) => void; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.emojiGrid}>
            {EMOJI_SET.map((e) => (
              <Pressable key={e} style={styles.emojiGridBtn} onPress={() => { onPick(e); onClose(); }}>
                <Text style={styles.reactSheetEmoji}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PollView({
  poll,
  myUserId,
  mine,
  onVote,
  colors,
}: {
  poll: OrgChatPoll;
  myUserId: number | undefined;
  mine: boolean;
  onVote: (optionId: number) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const totalVotes = poll.votes.length;
  const myVote = poll.votes.find((v) => v.userId === myUserId)?.optionId;
  return (
    <View style={styles.pollBox}>
      <View style={styles.pollHeaderRow}>
        <Ionicons name="bar-chart" size={14} color={mine ? '#fff' : colors.primaryRed} />
        <Text style={[styles.pollQuestion, mine && { color: '#fff' }]}>{poll.question}</Text>
      </View>
      {poll.options.map((opt) => {
        const count = poll.votes.filter((v) => v.optionId === opt.id).length;
        const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
        const isMyVote = myVote === opt.id;
        return (
          <Pressable key={opt.id} style={[styles.pollOption, mine && styles.pollOptionMine]} onPress={() => onVote(opt.id)}>
            <View style={[styles.pollOptionFill, { width: `${pct}%` }, mine && styles.pollOptionFillMine]} />
            <View style={styles.pollOptionRow}>
              <Text style={[styles.pollOptionText, mine && { color: '#fff' }]}>{isMyVote ? '✓ ' : ''}{opt.text}</Text>
              <Text style={[styles.pollOptionPct, mine && { color: 'rgba(255,255,255,0.85)' }]}>{pct}%</Text>
            </View>
          </Pressable>
        );
      })}
      <Text style={[styles.pollTotal, mine && { color: 'rgba(255,255,255,0.75)' }]}>{totalVotes} vote{totalVotes === 1 ? '' : 's'}</Text>
    </View>
  );
}

const ATTACHMENT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  video: 'videocam',
  audio: 'musical-note',
  file: 'document',
};

function AttachmentView({
  attachment,
  mine,
  colors,
  onOpenImage,
}: {
  attachment: ChatAttachment;
  mine: boolean;
  colors: ThemeColors;
  onOpenImage: (url: string) => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const url = resolveMediaUrl(attachment.url);

  if (attachment.kind === 'image' && url) {
    return (
      <Pressable onPress={() => onOpenImage(url)}>
        <Image source={{ uri: url }} style={styles.attachmentImage} />
      </Pressable>
    );
  }
  if (attachment.kind === 'video' && url) {
    return <ChatVideoAttachmentPlayer url={url} styles={styles} />;
  }
  if (attachment.kind === 'audio' && url) {
    return <ChatAudioAttachment url={url} mine={mine} colors={colors} styles={styles} />;
  }
  return (
    <Pressable style={styles.attachmentFile} onPress={() => url && Linking.openURL(url)}>
      <Ionicons name={ATTACHMENT_ICON[attachment.kind] || 'document'} size={16} color={mine ? colors.onPrimary : colors.text} />
      <Text style={[styles.attachmentName, mine && { color: colors.onPrimary }]} numberOfLines={1}>{attachment.name}</Text>
    </Pressable>
  );
}

function ChatVideoAttachmentPlayer({ url, styles }: { url: string; styles: ReturnType<typeof createStyles> }) {
  const player = useVideoPlayer(url, (p) => { p.loop = false; });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  return (
    <View style={styles.attachmentVideo}>
      <VideoView player={player} style={styles.attachmentVideoInner} contentFit="cover" nativeControls />
      {status === 'loading' ? (
        <View style={styles.attachmentVideoOverlay} pointerEvents="none">
          <ActivityIndicator color="#fff" size="small" />
        </View>
      ) : null}
    </View>
  );
}

// Same as ChatScreen.tsx's own ChatAudioAttachment - a voice note (or any
// picked audio file) plays inline with a tap-to-toggle control and
// progress bar, instead of falling through to the generic file chip.
function ChatAudioAttachment({
  url,
  mine,
  colors,
  styles,
}: {
  url: string;
  mine: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const player = useAudioPlayer(url, { keepAudioSessionActive: true });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || 0;
  const current = status.currentTime || 0;
  const remaining = status.playing || current > 0 ? Math.max(0, duration - current) : duration;
  const label = `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;
  const tint = mine ? colors.onPrimary : colors.primaryRed;

  async function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      // Still attempt to play even if re-asserting the mode failed.
    }
    player.play();
  }

  return (
    <Pressable style={styles.attachmentAudio} onPress={toggle}>
      <Ionicons name={status.playing ? 'pause-circle' : 'play-circle'} size={32} color={tint} />
      <View style={styles.attachmentAudioBar}>
        <View style={[styles.attachmentAudioBarFill, { width: `${duration ? Math.min(100, (current / duration) * 100) : 0}%`, backgroundColor: tint }]} />
      </View>
      <Text style={[styles.attachmentAudioTime, mine && { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

function ImageViewer({ url, onClose }: { url: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' }} onPress={onClose}>
        {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
        <Pressable style={{ position: 'absolute', top: 60, right: 20 }} onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MessageActionSheet({
  item,
  myUserId,
  onClose,
  onReact,
  onCopy,
  onPin,
  onDelete,
  colors,
}: {
  item: OrgChatMessage | null;
  myUserId: number | undefined;
  onClose: () => void;
  onReact: () => void;
  onCopy: (m: OrgChatMessage) => void;
  onPin: (m: OrgChatMessage) => void;
  onDelete: (m: OrgChatMessage) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!item) return null;
  const mine = item.senderId === myUserId;
  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Pressable style={styles.popoverItem} onPress={onReact}>
            <Ionicons name="happy-outline" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>React</Text>
          </Pressable>
          {item.text ? (
            <Pressable style={styles.popoverItem} onPress={() => onCopy(item)}>
              <Ionicons name="copy-outline" size={16} color={colors.text} />
              <Text style={styles.popoverItemText}>Copy</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.popoverItem} onPress={() => onPin(item)}>
            <Ionicons name="pin" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>{item.pinned ? 'Unpin' : 'Pin'}</Text>
          </Pressable>
          {mine ? (
            <Pressable style={styles.popoverItem} onPress={() => onDelete(item)}>
              <Ionicons name="trash" size={16} color={colors.danger} />
              <Text style={[styles.popoverItemText, { color: colors.danger }]}>Delete</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ReactSheet({
  message,
  myUserId,
  onClose,
  onReact,
  colors,
}: {
  message: OrgChatMessage | null;
  myUserId: number | undefined;
  onClose: () => void;
  onReact: (m: OrgChatMessage, emoji: string) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!message) return null;
  const myReaction = message.reactions.find((r) => r.userId === myUserId)?.emoji;
  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.reactSheetBackdrop} onPress={onClose}>
        <View style={styles.reactSheetRow}>
          {REACTIONS.map((emoji) => (
            <Pressable
              key={emoji}
              style={[styles.reactionBtn, myReaction === emoji && styles.reactionBtnActive]}
              onPress={() => onReact(message, emoji)}
            >
              <Text style={styles.reactSheetEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const CLIP_TABS: { key: 'mine' | 'org'; label: string }[] = [
  { key: 'mine', label: 'My Library' },
  { key: 'org', label: "Organization's Library" },
];

// Common shape both the tutor's own library items (LibraryItem) and the
// organization's library items (OrgLibraryItem) get normalized into, so the
// picker list below can render one FlatList regardless of which tab is
// active instead of juggling two differently-shaped item types.
interface ClipPickItem {
  id: number;
  title: string;
  category: string | null;
  url: string | null;
}

// The clip picker for an Org Tutor chat draws from the tutor's own
// technique-video uploads AND the organization's shared library - not the
// Mozart-wide shared Library the per-assignment ChatScreen's picker uses,
// since those two are the libraries actually relevant to this conversation.
function OrgLibraryClipPicker({
  visible,
  onClose,
  onPick,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (item: { title: string; url: string }) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<'mine' | 'org'>('mine');
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<ClipPickItem[]>([]);
  const [org, setOrg] = useState<ClipPickItem[]>([]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setTab('mine');
    Promise.all([
      libraryApi.fetchMyTutorLibrary().catch(() => ({ items: [] as LibraryItem[] })),
      organizationsApi.fetchOrgLibrary().catch(() => ({ general: [] as OrgLibraryItem[] })),
    ])
      .then(([mineData, orgData]) => {
        setMine(mineData.items.map((item) => ({ id: item.id, title: item.title, category: item.category, url: item.url })));
        setOrg(('general' in orgData ? orgData.general : []).map((item) => ({ id: item.id, title: item.title, category: item.category, url: item.url || item.fileUrl })));
      })
      .finally(() => setLoading(false));
  }, [visible]);

  const items = tab === 'mine' ? mine : org;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Choose a clip to send</Text>
          <View style={styles.pickerTabsRow}>
            {CLIP_TABS.map((t) => {
              const active = tab === t.key;
              return (
                <Pressable key={t.key} style={[styles.pickerTab, active && styles.pickerTabActive]} onPress={() => setTab(t.key)}>
                  <Text style={[styles.pickerTabText, active && styles.pickerTabTextActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {loading ? (
            <ActivityIndicator color={colors.primaryRed} style={{ marginVertical: 20 }} />
          ) : items.length === 0 ? (
            <Text style={styles.emptyPickerText}>Nothing here yet.</Text>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(i) => String(i.id)}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => {
                const resolvedUrl = resolveMediaUrl(item.url) || item.url || '';
                return (
                  <Pressable style={styles.pickerRow} onPress={() => onPick({ title: item.title, url: resolvedUrl })}>
                    <Ionicons name="play-circle-outline" size={18} color={colors.primaryRed} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerRowTitle} numberOfLines={1}>{item.title}</Text>
                      {item.category ? <Text style={styles.pickerRowMeta}>{item.category}</Text> : null}
                    </View>
                  </Pressable>
                );
              }}
            />
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
    headerIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
    title: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text },
    subtitle: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 1 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    headerIconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    searchInput: { flex: 1, fontSize: 13.5, fontFamily: fonts.body, color: colors.text },
    searchCount: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint },
    pinnedBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: `${colors.primaryRed}12`,
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    pinnedBarText: { flex: 1, fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
    listContent: { padding: 16, gap: 8, flexGrow: 1 },
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, maxWidth: '84%' },
    bubble: { borderRadius: 16, paddingHorizontal: 9, paddingVertical: 6, overflow: 'hidden', flexShrink: 1 },
    bubbleMine: { backgroundColor: colors.primaryRed, borderBottomRightRadius: 4 },
    bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
    bubbleDeleted: { opacity: 0.6, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    deletedText: { fontSize: 13, fontFamily: fonts.body, fontStyle: 'italic', color: colors.textFaint },
    pinIcon: { position: 'absolute', top: 6, right: 6 },
    senderName: { fontSize: 10.5, fontFamily: fonts.bodyBold, color: colors.primaryRed, marginBottom: 2 },
    bubbleText: { fontSize: 14, fontFamily: fonts.body, color: colors.text, lineHeight: 20 },
    bubbleTime: { fontSize: 10, fontFamily: fonts.body, color: colors.textFaint, marginTop: 3, alignSelf: 'flex-end' },
    clipBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 10, padding: 8, marginBottom: 4 },
    clipText: { flex: 1, fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
    locationBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 10, padding: 8, marginBottom: 4 },
    reactionsPill: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3 },
    reactionsPillText: { fontSize: 12 },
    attachmentImage: { width: 200, height: 150 },
    attachmentVideo: { width: 220, height: 165, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
    attachmentVideoInner: { width: '100%', height: '100%' },
    attachmentVideoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
    attachmentFile: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    attachmentName: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text, maxWidth: 160 },
    attachmentAudio: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 190, marginBottom: 4 },
    attachmentAudioBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.3)', overflow: 'hidden' },
    attachmentAudioBarFill: { height: '100%', borderRadius: 2 },
    attachmentAudioTime: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint, fontVariant: ['tabular-nums'] },
    pollBox: { marginBottom: 4, minWidth: 200 },
    pollHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    pollQuestion: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text, flex: 1 },
    pollOption: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 6, overflow: 'hidden', backgroundColor: colors.background },
    pollOptionMine: { borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.1)' },
    pollOptionFill: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: `${colors.primaryRed}22` },
    pollOptionFillMine: { backgroundColor: 'rgba(255,255,255,0.18)' },
    pollOptionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8 },
    pollOptionText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text, flexShrink: 1 },
    pollOptionPct: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.textFaint },
    pollTotal: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
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
    composerBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      backgroundColor: colors.background,
      paddingLeft: 14,
      paddingRight: 4,
    },
    composerInput: {
      flex: 1,
      maxHeight: 100,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
    },
    emojiBtn: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
    emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
    emojiGridBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
    },
    sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryRed, alignItems: 'center', justifyContent: 'center' },
    sendBtnDisabled: { opacity: 0.5 },
    recordCancelBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    pauseBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primaryRed}18`,
    },
    recordingRow: { alignItems: 'center', gap: 8, paddingVertical: 10 },
    recordingDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: colors.danger },
    recordingTime: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text, fontVariant: ['tabular-nums'] },
    recordingHint: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    actionSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    popoverItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.border },
    popoverItemText: { fontSize: 14.5, fontFamily: fonts.bodyMedium, color: colors.text },
    menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
    popover: {
      position: 'absolute',
      top: 100,
      right: 20,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      minWidth: 220,
    },
    muteSubmenu: {},
    popoverDivider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
    reportSubmitBtn: { backgroundColor: colors.primaryRed, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
    reportSubmitBtnText: { fontSize: 14.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    addOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    addOptionText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, fontSize: 12, marginTop: 8, textAlign: 'center' },
    pollSubmitBtn: { width: '100%', borderRadius: 12, marginTop: 16 },
    pollSubmitText: { fontSize: 14.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
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
    pickerSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
    pickerTabsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    pickerTab: { flex: 1, borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, alignItems: 'center' },
    pickerTabActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    pickerTabText: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    pickerTabTextActive: { color: colors.onPrimary },
    emptyPickerText: { fontSize: 13, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', paddingVertical: 20 },
    pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
    pickerRowTitle: { fontSize: 13.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    pickerRowMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
  });
}

import { FlatList } from '../components/LiquidScroll';
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
import { ActivityIndicator, Animated, Image, KeyboardAvoidingView, Linking, Modal, PanResponder, Platform, Pressable, Share, StyleSheet, Text, TextInput, View,  } from 'react-native';

import * as authApi from '../api/auth';
import * as chatApi from '../api/chat';
import { API_BASE_URL, ApiError, resolveMediaUrl } from '../api/client';
import * as libraryApi from '../api/library';
import * as threadsApi from '../api/threads';
import type { MuteDuration } from '../api/threads';
import type { AssignmentSummary, ChatMessage, LibraryItem } from '../api/types';
import Avatar from '../components/Avatar';
import BackButton from '../components/BackButton';
import LocationMapView from '../components/LocationMapView';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';
import { openBrowser } from '../utils/openBrowser';

type Props = NativeStackScreenProps<MainStackParamList, 'Chat'>;

const POLL_MS = 15000; // fallback only - the WebSocket is the primary path
const EDIT_WINDOW_MS = 30 * 60 * 1000;
const DELETE_EVERYONE_WINDOW_MS = 10 * 60 * 1000;
// Matches a full https://... URL, or a bare domain-looking word like
// "example.com" (no scheme). The trailing TLD segment must be 2+ letters
// (never digits) so numbers like "3.14" or "19.0.1" never match, and each
// label only allows word characters/hyphens, so ordinary sentence
// abbreviations like "e.g." or "Mr. Smith" (single-letter or space-broken)
// can't match either.
const URL_RE = /((?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/g;

// A library share link (LibraryScreen's libraryShareUrl - "<API_BASE_URL>/
// library?item=<slug>") should open the Library tab on that exact clip
// in-app, not the generic in-app browser every other link opens in. Only
// this app's own share links match.
const LIBRARY_SHARE_RE = new RegExp(`^${API_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/library\\?item=([^&\\s]+)`, 'i');
function libraryItemSlugFromUrl(url: string): string | null {
  const match = url.match(LIBRARY_SHARE_RE);
  return match ? decodeURIComponent(match[1]) : null;
}

const ATTACHMENT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  video: 'videocam',
  audio: 'musical-note',
  file: 'document',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Mirrors server.js's containsContactInfo() exactly - same two phone
// shapes (punctuated groups, or a bare 9+ digit run), tuned to skip
// ordinary numbers (times, dates, prices, order numbers) that a looser
// "any 7+ digits" check was flagging. Checked here too so a flagged
// message never even makes the round trip; the server stays the real
// enforcement point either way.
const CLIENT_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const CLIENT_PHONE_FORMATTED_RE = /(?:\+?\d{1,3}[\s.-])?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}\b/;
const CLIENT_PHONE_BARE_RE = /\d{9,15}/;
function containsContactInfo(text: string) {
  if (!text) return false;
  if (CLIENT_EMAIL_RE.test(text)) return true;
  if (CLIENT_PHONE_FORMATTED_RE.test(text)) return true;
  if (CLIENT_PHONE_BARE_RE.test(text)) return true;
  return false;
}

function messagePreview(m: ChatMessage) {
  if (m.deleted) return 'This message was deleted';
  if (m.text) return m.text;
  if (m.attachment) return ({ image: 'Photo', video: 'Video', audio: 'Voice note' } as Record<string, string>)[m.attachment.kind] || m.attachment.name;
  if (m.libraryItem) return `Clip: ${m.libraryItem.title}`;
  if (m.poll) return `Poll: ${m.poll.question}`;
  if (m.location) return 'Location';
  return 'Message';
}

function wsUrl() {
  return `${API_BASE_URL.replace(/^http/, 'ws')}/ws/chat`;
}

// Native rebuild of chat.html's core, connected to the same real backend:
// text/attachment send, reply/edit/pin/delete(for me or everyone), the
// header's call/search/more-options row, live delivery + typing over the
// real /ws/chat socket (falls back to polling if it drops), clickable
// links, and a tap-to-enlarge photo viewer. Reactions, polls, location
// sharing, and "Select messages" bulk delete aren't built here yet.
export default function ChatScreen({ navigation, route }: Props) {
  const { assignmentId, name, photoUrl } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm, actionSheet } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [clipMenuOpen, setClipMenuOpen] = useState(false);
  const [pollSheetOpen, setPollSheetOpen] = useState(false);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  // Recording no longer sends the instant you stop it - stop just moves it
  // into this "ready to send" holding state, staying in the composer bar
  // until you explicitly tap send (or discard it), same as a real voice
  // note picker. voicePaused tracks the middle pause/resume control
  // separately from recorderState.isRecording, since pausing turns that
  // false too and would otherwise look identical to "not recording yet".
  const [voicePaused, setVoicePaused] = useState(false);
  const [voiceReady, setVoiceReady] = useState<{ uri: string; durationMillis: number } | null>(null);
  // A picked photo/video/document/audio file (or a chosen library clip) no
  // longer sends the instant it's picked - it stays here, previewed in the
  // composer, until an explicit send (optionally with a typed caption) or
  // a cancel. Mirrors voiceReady's same "picked isn't sent yet" pattern
  // above, and chat.html's own attach-preview/pickedLibraryItem staging.
  const [pendingAttachment, setPendingAttachment] = useState<
    | { kind: 'image' | 'video' | 'document'; uri: string; name: string; type: string }
    | { kind: 'library'; item: LibraryItem }
    | null
  >(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const [record, setRecord] = useState<AssignmentSummary | null>(null);
  const [isTutorViewer, setIsTutorViewer] = useState(false);
  const [lessonActionBusy, setLessonActionBusy] = useState(false);
  // Keyed by session id, not one flag - the strip below only ever renders
  // one pending bill in practice, but nothing stops a busy state on one
  // from spuriously disabling a different one's button if this were shared.
  const [billActionBusyId, setBillActionBusyId] = useState<number | null>(null);
  const [myRole, setMyRole] = useState<'student' | 'tutor' | null>(null);
  const [prefs, setPrefs] = useState({ favorite: false, muted: false, blocked: false });

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [muteSubmenuOpen, setMuteSubmenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const [typingName, setTypingName] = useState<string | null>(null);
  const [msgMenuItem, setMsgMenuItem] = useState<ChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [revealedSeenId, setRevealedSeenId] = useState<number | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const highlightTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myUserId = user?.id;

  const visibleMessages = useMemo(
    () => messages.filter((m) => !(m.deletedForUserIds || []).includes(myUserId!)),
    [messages, myUserId],
  );

  const load = useCallback(async () => {
    try {
      const data = await chatApi.fetchMessages(assignmentId);
      setMessages(data.messages);
      setMyRole(data.role);
    } catch {
      // Silent - polling/socket retries on their own.
    }
  }, [assignmentId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Real-time delivery + typing over the same /ws/chat socket the web app
  // uses (data/realtime.js) - the poll above is just the safety net if this
  // drops. Reconnects on close since a lesson chat can stay open a long
  // time and mobile networks drop sockets often.
  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;

    function connect() {
      if (cancelled) return;
      socket = new WebSocket(wsUrl());
      ws.current = socket;
      socket.onopen = () => socket?.send(JSON.stringify({ type: 'join', assignmentId }));
      socket.onmessage = (event) => {
        let msg: { type: string; message?: ChatMessage; messageId?: number; userId?: number; name?: string; isTyping?: boolean; pinned?: boolean };
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.type === 'message' && msg.message) {
          setMessages((prev) => (prev.some((m) => m.id === msg.message!.id) ? prev : [...prev, msg.message!]));
        } else if ((msg.type === 'message_edited' || msg.type === 'message_pinned') && msg.message) {
          setMessages((prev) => prev.map((m) => (m.id === msg.message!.id ? msg.message! : m)));
        } else if (msg.type === 'message_deleted' && msg.messageId != null) {
          setMessages((prev) => prev.map((m) => (m.id === msg.messageId ? { ...m, deleted: true, text: '', attachment: null } : m)));
        } else if (msg.type === 'typing' && msg.userId !== myUserId) {
          if (remoteTypingTimeout.current) clearTimeout(remoteTypingTimeout.current);
          if (msg.isTyping) {
            setTypingName(msg.name || 'They');
            remoteTypingTimeout.current = setTimeout(() => setTypingName(null), 4000);
          } else {
            setTypingName(null);
          }
        }
      };
      socket.onclose = () => { if (!cancelled) setTimeout(connect, 3000); };
      socket.onerror = () => socket?.close();
    }

    connect();
    return () => {
      cancelled = true;
      socket?.close();
      if (remoteTypingTimeout.current) clearTimeout(remoteTypingTimeout.current);
    };
  }, [assignmentId, myUserId]);

  function notifyTyping(isTyping: boolean) {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'typing', isTyping, name: user?.name || '' }));
    }
  }

  function onDraftChange(value: string) {
    setDraft(value);
    notifyTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => notifyTyping(false), 2000);
  }

  // Meeting-link state and thread prefs (favorite/muted/blocked) live on
  // the assignment record and the conversations list respectively - same
  // two calls chat.html makes to seed its header icons.
  const loadAssignment = useCallback(() => {
    return authApi.fetchMyAssignments().then((data) => {
      const asTutorMatch = (data.asTutor || []).find((r) => r.id === assignmentId);
      const asStudentMatch = (data.asStudent || []).find((r) => r.id === assignmentId);
      setRecord(asStudentMatch || asTutorMatch || null);
      setIsTutorViewer(Boolean(asTutorMatch));
    }).catch(() => {});
  }, [assignmentId]);

  useEffect(() => {
    loadAssignment();
    chatApi.fetchConversations().then((data) => {
      const convo = data.conversations.find((c) => c.assignmentId === assignmentId);
      if (convo) setPrefs({ favorite: convo.favorite, muted: convo.muted, blocked: false });
    }).catch(() => {});
  }, [assignmentId, loadAssignment]);

  async function send() {
    const text = draft.trim();
    if (containsContactInfo(text)) {
      toast("Not allowed: Sharing an email address or phone number in chat isn't allowed - keep lesson coordination and payment on Mozart Techniques.", 'error');
      return;
    }
    if (editing) {
      if (!text) return;
      setSending(true);
      try {
        const data = await chatApi.editMessage(assignmentId, editing.id, text);
        setMessages((prev) => prev.map((m) => (m.id === data.message.id ? data.message : m)));
        setEditing(null);
        setDraft('');
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Could not save edit. Try again in a moment.', 'error');
      } finally {
        setSending(false);
      }
      return;
    }
    if ((!text && !pendingAttachment) || sending) return;
    setSending(true);
    const replyId = replyTo?.id;
    setReplyTo(null);
    if (pendingAttachment) {
      const pending = pendingAttachment;
      setPendingAttachment(null);
      setDraft('');
      notifyTyping(false);
      setAttaching(true);
      try {
        const data = pending.kind === 'library'
          ? await chatApi.sendLibraryClip(assignmentId, pending.item.id, text || undefined)
          : await chatApi.sendAttachment(assignmentId, pending, text || undefined, replyId);
        setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
      } catch (err) {
        setPendingAttachment(pending);
        setDraft(text);
        toast(err instanceof ApiError ? err.message : 'Could not send that. Try again in a moment.', 'error');
      } finally {
        setAttaching(false);
        setSending(false);
      }
      return;
    }
    setDraft('');
    notifyTyping(false);
    try {
      const data = await chatApi.sendMessage(assignmentId, text, replyId);
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
    } catch (err) {
      setDraft(text);
      if (err instanceof ApiError) toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  }

  // Only the live voice-note recorder still sends immediately on its own
  // "ready" send button (finishVoiceNote/sendVoiceReady above) - a picked
  // file stages into pendingAttachment via stageAttachment below instead.
  async function sendFileAsset(uri: string, name: string, type: string) {
    setAttaching(true);
    const replyId = replyTo?.id;
    setReplyTo(null);
    try {
      const data = await chatApi.sendAttachment(assignmentId, { uri, name, type }, undefined, replyId);
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send that attachment. Try again in a moment.', 'error');
    } finally {
      setAttaching(false);
    }
  }

  function stageAttachment(uri: string, name: string, type: string, kind: 'image' | 'video' | 'document') {
    setPendingAttachment({ uri, name, type, kind });
  }

  // Guards every picker entry point below against a second tap firing
  // while a first pick is still in flight - expo-document-picker's native
  // module allows exactly one picking session at a time and throws
  // PickingInProgressException on a second concurrent call (easy to hit:
  // the clip menu's buttons are all tappable at once, and the native file/
  // photo browser sheet takes a moment to appear). That exception was
  // completely unhandled here, so it surfaced as an uncaught promise
  // rejection - fatal in a dev build, silently broken in production,
  // exactly like the call-icon crash. The try/catch below is defense in
  // depth for any other picker failure; the busy guard removes the race
  // that was actually causing this one.
  const pickerBusyRef = useRef(false);

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
      stageAttachment(asset.uri, fileName, type, asset.type === 'video' ? 'video' : 'image');
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
      stageAttachment(asset.uri, asset.fileName || 'photo.jpg', asset.mimeType || 'image/jpeg', 'image');
    } catch {
      toast('Could not open the camera. Try again in a moment.', 'error');
    } finally {
      pickerBusyRef.current = false;
    }
  }

  async function pickDocument() {
    setClipMenuOpen(false);
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      stageAttachment(asset.uri, asset.name, asset.mimeType || 'application/octet-stream', 'document');
    } catch {
      toast('Could not open the file picker. Try again in a moment.', 'error');
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
      stageAttachment(asset.uri, asset.name, asset.mimeType || 'audio/mpeg', 'document');
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
      const data = await chatApi.sendLocation(assignmentId, position.coords.latitude, position.coords.longitude);
      setMessages((prev) => [...prev, data.message]);
    } catch {
      toast('Could not share your location. Try again in a moment.', 'error');
    }
  }

  async function sendPollSubmit(question: string, options: string[]) {
    const data = await chatApi.sendPoll(assignmentId, question, options);
    setMessages((prev) => [...prev, data.message]);
    setPollSheetOpen(false);
  }

  function pickLibraryClip(item: LibraryItem) {
    setLibraryPickerOpen(false);
    setPendingAttachment({ kind: 'library', item });
  }

  async function voteOnPoll(m: ChatMessage, optionId: number) {
    try {
      const data = await chatApi.votePoll(assignmentId, m.id, optionId);
      setMessages((prev) => prev.map((x) => (x.id === data.message.id ? data.message : x)));
    } catch {
      toast('Could not vote. Try again in a moment.', 'error');
    }
  }

  function insertEmoji(emoji: string) {
    setDraft((prev) => prev + emoji);
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

  // Cancel while still recording (or paused) - discards outright, no
  // "ready to send" state to clean up.
  async function cancelVoiceNote() {
    try {
      await recorder.stop();
    } catch {
      // nothing to clean up either way
    }
    setVoicePaused(false);
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }

  // Stop no longer sends - it moves the recording into voiceReady, which
  // stays in the composer bar until an explicit send or discard.
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
    // flip it back now that recording is done, so playback (this voice
    // note's own send button below, or any other message's) isn't left
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

  const meetingHasPassed = Boolean(record?.scheduledAt && new Date(record.scheduledAt).getTime() < Date.now());

  function onMeetingPress() {
    if (meetingHasPassed) {
      toast('This scheduled meeting has ended.');
      return;
    }
    if (record?.meetingLink) {
      navigation.navigate('MeetingWebView', { url: record.meetingLink });
      return;
    }
    if (!isTutorViewer) {
      toast('Your tutor has not shared a meeting link yet.');
      return;
    }
    navigation.navigate('MeetingWebView', { url: 'https://meet.google.com/new' });
  }

  // Mirrors chat.html's "Start lesson" / "End lesson & send bill" pair -
  // same two endpoints, same system-message-on-success pattern. The
  // in-person/studio arrival flow (reach-destination / confirm-tutor-seen)
  // that server.js requires before those lesson types can start is web-only
  // for now, so a blocked start there surfaces the server's own error
  // message rather than a working arrival UI.
  async function handleStartLesson() {
    if (!record || lessonActionBusy) return;
    setLessonActionBusy(true);
    try {
      const data = await authApi.startLesson(record.id);
      setRecord((prev) => (prev ? { ...prev, lessonStartedAt: data.lessonStartedAt } : prev));
      toast('Lesson started. End it when the class finishes to send the bill.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not start the lesson.', 'error');
    } finally {
      setLessonActionBusy(false);
    }
  }

  async function handleEndLessonAndSendBill() {
    if (!record || lessonActionBusy) return;
    setLessonActionBusy(true);
    try {
      const data = await authApi.endLessonAndSendBill(record.id);
      setRecord((prev) => (prev ? { ...prev, lessonStartedAt: null } : prev));
      toast(
        data.session.isFreeTrial
          ? 'Class ended. This first class is free.'
          : `Class ended. Lesson bill: $${data.session.totalUsd.toFixed(2)}.`,
        'success',
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not end the lesson.', 'error');
    } finally {
      setLessonActionBusy(false);
    }
  }

  // Mirrors chat.html's "Confirm class & pay" - a saved card gets charged
  // immediately (paidAutomatically), or, with no saved card yet, the
  // server hands back a Stripe Checkout URL to open instead. Either way
  // this is student-only; a sponsored student never sees this button at
  // all (see the pending-bills render below).
  async function handleConfirmAndPay(sessionId: number) {
    if (!record || billActionBusyId != null) return;
    setBillActionBusyId(sessionId);
    try {
      const result = await authApi.confirmSessionPayment(record.id, sessionId);
      if ('redirectToCheckout' in result && result.redirectToCheckout) {
        await openBrowser(result.checkoutUrl);
        // Checkout may or may not have actually completed by the time the
        // browser closes - re-fetch rather than assume, the same thing
        // chat.html gets for free from its success_url page reload.
        await loadAssignment();
        return;
      }
      setRecord((prev) => prev ? {
        ...prev,
        sessions: (prev.sessions || []).map((s) => (s.id === sessionId ? { ...s, paymentStatus: 'released' as const } : s)),
      } : prev);
      toast('Payment confirmed - this lesson is paid.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not confirm payment.', 'error');
    } finally {
      setBillActionBusyId(null);
    }
  }

  // Mirrors chat.html's "Cancel bill" - tutor-only, for a bill sent by
  // mistake (wrong duration, wrong lesson, etc.).
  async function handleCancelBill(sessionId: number) {
    if (!record || billActionBusyId != null) return;
    setBillActionBusyId(sessionId);
    try {
      await authApi.cancelSessionBill(record.id, sessionId);
      setRecord((prev) => prev ? {
        ...prev,
        sessions: (prev.sessions || []).map((s) => (s.id === sessionId ? { ...s, paymentStatus: 'cancelled' as const } : s)),
      } : prev);
      toast('Bill cancelled.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not cancel that bill.', 'error');
    } finally {
      setBillActionBusyId(null);
    }
  }

  async function sendCallLink() {
    setMoreMenuOpen(false);
    if (!record?.meetingLink) {
      toast('No meeting link set: set a meeting link first using the call icon.', 'error');
      return;
    }
    try {
      const data = await chatApi.sendMessage(assignmentId, `📹 Join our call: ${record.meetingLink}`);
      setMessages((prev) => [...prev, data.message]);
    } catch {
      toast('Could not send call link. Try again in a moment.', 'error');
    }
  }

  async function exportTranscript() {
    setMoreMenuOpen(false);
    const lines = visibleMessages.map((m) => {
      const who = m.senderId === myUserId ? 'You' : name;
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
      const data = await threadsApi.toggleFavorite('assignment', assignmentId);
      setPrefs((p) => ({ ...p, favorite: data.favorite }));
    } catch {
      toast('Could not update favorite. Try again in a moment.', 'error');
    }
  }

  async function setMute(duration: MuteDuration | null) {
    setMuteSubmenuOpen(false);
    setMoreMenuOpen(false);
    try {
      await threadsApi.setMute('assignment', assignmentId, duration);
      setPrefs((p) => ({ ...p, muted: Boolean(duration) }));
    } catch {
      toast('Could not update notifications. Try again in a moment.', 'error');
    }
  }

  async function toggleBlock() {
    setMoreMenuOpen(false);
    const ok = await confirm({
      message: `${prefs.blocked ? 'Unblock' : 'Block'} ${name}?`,
      confirmLabel: prefs.blocked ? 'Unblock' : 'Block',
      destructive: true,
    });
    if (!ok) return;
    try {
      const data = await threadsApi.toggleBlock(assignmentId);
      setPrefs((p) => ({ ...p, blocked: data.blocked }));
    } catch {
      toast('Could not update block status. Try again in a moment.', 'error');
    }
  }

  async function clearChat() {
    setMoreMenuOpen(false);
    const ok = await confirm({ title: 'Clear this chat?', message: 'This removes all messages for you only.', confirmLabel: 'Clear', destructive: true });
    if (!ok) return;
    try { await threadsApi.clearThread('assignment', assignmentId); load(); }
    catch { toast('Could not clear chat. Try again in a moment.', 'error'); }
  }

  async function deleteChat() {
    setMoreMenuOpen(false);
    const ok = await confirm({ title: 'Delete this chat?', message: "It'll disappear from your messages list until a new message arrives.", confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try { await threadsApi.deleteThread('assignment', assignmentId); navigation.goBack(); }
    catch { toast('Could not delete chat. Try again in a moment.', 'error'); }
  }

  function startReply(m: ChatMessage) {
    setMsgMenuItem(null);
    setEditing(null);
    setReplyTo(m);
  }

  // A library share link opens the Library tab on that exact clip in-app;
  // every other link opens inside the app too (MeetingWebView, reused here
  // as a general in-app browser) rather than Linking.openURL, which both
  // fully exits the app to a separate browser task AND carries the same
  // native-crash risk MeetingWebView's own comment explains (an arbitrary
  // link can just as easily deep-link into an app that needs a permission
  // this one doesn't hold).
  function handleLinkPress(url: string) {
    const slug = libraryItemSlugFromUrl(url);
    if (slug) navigation.navigate('Library', { openItemSlug: slug });
    else navigation.navigate('MeetingWebView', { url: /^https?:\/\//i.test(url) ? url : `https://${url}`, title: 'Link' });
  }

  async function copyMessage(m: ChatMessage) {
    setMsgMenuItem(null);
    await Clipboard.setStringAsync(m.text || '');
  }

  async function shareMessage(m: ChatMessage) {
    setMsgMenuItem(null);
    try { await Share.share({ message: m.text || messagePreview(m) }); } catch { /* cancelled */ }
  }

  async function togglePinMessage(m: ChatMessage) {
    setMsgMenuItem(null);
    try {
      const data = await chatApi.toggleMessagePin(assignmentId, m.id);
      setMessages((prev) => prev.map((x) => (x.id === data.message.id ? data.message : x)));
    } catch {
      toast('Could not update pin. Try again in a moment.', 'error');
    }
  }

  async function reactToMessage(m: ChatMessage, emoji: string) {
    setMsgMenuItem(null);
    try {
      const data = await chatApi.reactToMessage(assignmentId, m.id, emoji);
      setMessages((prev) => prev.map((x) => (x.id === data.message.id ? data.message : x)));
    } catch {
      toast('Could not react to that message. Try again in a moment.', 'error');
    }
  }

  function startEdit(m: ChatMessage) {
    setMsgMenuItem(null);
    setReplyTo(null);
    setEditing(m);
    setDraft(m.text || '');
  }

  function cancelEdit() {
    setEditing(null);
    setDraft('');
  }

  function askDelete(m: ChatMessage) {
    setMsgMenuItem(null);
    const mine = m.senderId === myUserId;
    const recipientSeen = m.senderRole === 'student' ? m.readByTutor : m.readByStudent;
    const tooOld = Date.now() - new Date(m.createdAt).getTime() > DELETE_EVERYONE_WINDOW_MS;
    const canDeleteForEveryone = mine && !recipientSeen && !tooOld;
    const actions: { label: string; onPress: () => void; destructive?: boolean }[] = [
      {
        label: 'Delete for me',
        destructive: true,
        onPress: async () => {
          try {
            const data = await chatApi.deleteMessageForMe(assignmentId, m.id);
            setMessages((prev) => prev.map((x) => (x.id === data.message.id ? data.message : x)));
          } catch {
            toast('Could not delete message. Try again in a moment.', 'error');
          }
        },
      },
    ];
    if (canDeleteForEveryone) {
      actions.push({
        label: 'Delete for everyone',
        destructive: true,
        onPress: async () => {
          try {
            const data = await chatApi.deleteMessageForEveryone(assignmentId, m.id);
            setMessages((prev) => prev.map((x) => (x.id === data.message.id ? data.message : x)));
          } catch (err) {
            toast(err instanceof ApiError ? err.message : 'Could not delete for everyone. Try again in a moment.', 'error');
          }
        },
      });
    }
    actionSheet({
      title: 'Delete message?',
      message: !mine ? 'Only the sender can delete this for everyone - you can still delete it for yourself.'
        : tooOld ? 'This message is more than 10 minutes old, so it can only be deleted for you.'
        : recipientSeen ? 'Already seen, so it can only be deleted for you.'
        : 'Deleting for everyone removes it for both of you.',
      actions,
    });
  }

  const pinnedMessage = [...visibleMessages].reverse().find((m) => m.pinned && !m.deleted) || null;

  const searchResults = searchQuery.trim()
    ? visibleMessages.filter((m) => messagePreview(m).toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];

  const canEditMine = editing ? Date.now() - new Date(editing.createdAt).getTime() <= EDIT_WINDOW_MS : true;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Pressable
          style={styles.headerIdentity}
          onPress={() => {
            const counterpartId = isTutorViewer ? record?.studentId : record?.tutorId;
            if (!counterpartId) return;
            navigation.navigate('CounterpartProfile', { type: isTutorViewer ? 'student' : 'tutor', id: counterpartId });
          }}
        >
          <Avatar name={name} photoUrl={photoUrl} size={34} viewable={false} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>{name}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {typingName ? `${typingName} is typing…` : [record?.category, record?.lessonType].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
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

      {isTutorViewer && record?.status === 'active' ? (
        <View style={styles.lessonStrip}>
          {record.lessonStartedAt ? (
            <>
              <View style={styles.lessonStripTag}>
                <View style={styles.lessonStripDot} />
                <Text style={styles.lessonStripTagText}>Lesson in progress</Text>
              </View>
              <Pressable style={styles.lessonStripBtn} onPress={handleEndLessonAndSendBill} disabled={lessonActionBusy}>
                {lessonActionBusy ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <>
                    <Ionicons name="stopwatch" size={14} color={colors.onPrimary} />
                    <Text style={styles.lessonStripBtnText}>End lesson & send bill</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.lessonStripBtn} onPress={handleStartLesson} disabled={lessonActionBusy}>
              {lessonActionBusy ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <>
                  <Ionicons name="play" size={14} color={colors.onPrimary} />
                  <Text style={styles.lessonStripBtnText}>Start lesson</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      ) : null}

      {/* Mirrors chat.html's amber pending-bill card - one row per session
          still awaiting confirm/cancel, independent of whether a lesson is
          currently active (a bill can sit pending after the lesson strip
          above has already gone back to its idle state). */}
      {(record?.sessions || []).filter((s) => s.paymentStatus === 'held').map((session) => (
        <View key={session.id} style={styles.billStrip}>
          <View style={styles.billStripRow}>
            <Ionicons name="receipt" size={15} color={colors.statusPendingText} />
            <Text style={styles.billStripTitle}>Lesson payment</Text>
          </View>
          <View style={styles.billStripRow}>
            <Text style={styles.billStripAmount}>
              {session.durationMinutes} min · ${Number(session.totalUsd || 0).toFixed(2)} awaiting confirmation
            </Text>
            {isTutorViewer ? (
              <Pressable style={styles.billStripCancelBtn} onPress={() => handleCancelBill(session.id)} disabled={billActionBusyId === session.id}>
                {billActionBusyId === session.id ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Text style={styles.billStripCancelText}>Cancel bill</Text>
                )}
              </Pressable>
            ) : record?.sponsoredBy ? (
              <Text style={styles.billStripSponsored}>Paid by {record.sponsoredBy.orgName}</Text>
            ) : (
              <Pressable style={styles.billStripConfirmBtn} onPress={() => handleConfirmAndPay(session.id)} disabled={billActionBusyId === session.id}>
                {billActionBusyId === session.id ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={styles.billStripConfirmText}>Confirm class & pay</Text>
                )}
              </Pressable>
            )}
          </View>
        </View>
      ))}

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
            <Pressable
              style={styles.searchResultRow}
              onPress={() => {
                setSearchOpen(false);
                setSearchQuery('');
                const target = visibleMessages.find((m) => m.id === item.id);
                if (!target) return;
                // A short delay lets the main thread FlatList mount/settle
                // after switching away from the search results list before
                // asking it to scroll - scrolling in the same tick as the
                // list swap is unreliable.
                setTimeout(() => {
                  listRef.current?.scrollToItem({ item: target, animated: true });
                  setHighlightedId(item.id);
                  if (highlightTimeout.current) clearTimeout(highlightTimeout.current);
                  highlightTimeout.current = setTimeout(() => setHighlightedId(null), 1200);
                }, 80);
              }}
            >
              <Text style={styles.searchResultTime}>{new Date(item.createdAt).toLocaleDateString()} · {formatTime(item.createdAt)}</Text>
              <Text style={styles.searchResultText} numberOfLines={2}>{messagePreview(item)}</Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={visibleMessages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No messages yet - say hello.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <MessageRow
              item={item}
              messages={messages}
              myUserId={myUserId}
              revealedSeenId={revealedSeenId}
              onToggleSeen={(id) => setRevealedSeenId((prev) => (prev === id ? null : id))}
              highlightedId={highlightedId}
              onLongPress={setMsgMenuItem}
              onSwipeReply={startReply}
              onOpenImage={setViewerUrl}
              onVotePoll={voteOnPoll}
              onForward={(m) => navigation.navigate('Tabs', { screen: 'Messages', params: { forward: { text: m.text, attachment: m.attachment } } })}
              onOpenLink={handleLinkPress}
              onJumpToQuote={(quotedId) => {
                const target = visibleMessages.find((m) => m.id === quotedId);
                if (!target) return;
                listRef.current?.scrollToItem({ item: target, animated: true });
                setHighlightedId(quotedId);
                if (highlightTimeout.current) clearTimeout(highlightTimeout.current);
                highlightTimeout.current = setTimeout(() => setHighlightedId(null), 1200);
              }}
              colors={colors}
              styles={styles}
            />
          )}
        />
      )}

      {replyTo ? (
        <View style={styles.replyBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.replyBannerName}>{replyTo.senderId === myUserId ? 'You' : name}</Text>
            <Text style={styles.replyBannerText} numberOfLines={1}>{messagePreview(replyTo)}</Text>
          </View>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={8}><Ionicons name="close" size={16} color={colors.textFaint} /></Pressable>
        </View>
      ) : null}
      {editing ? (
        <View style={styles.replyBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.replyBannerName}>Editing message</Text>
            {!canEditMine ? <Text style={styles.editWarning}>More than 30 minutes old - this save will likely fail.</Text> : null}
          </View>
          <Pressable onPress={cancelEdit} hitSlop={8}><Ionicons name="close" size={16} color={colors.textFaint} /></Pressable>
        </View>
      ) : null}

      {pendingAttachment && (pendingAttachment.kind === 'image' || pendingAttachment.kind === 'video') ? (
        <View style={styles.pendingMediaRow}>
          {pendingAttachment.kind === 'image' ? (
            <Pressable onPress={() => setViewerUrl(pendingAttachment.uri)}>
              <Image source={{ uri: pendingAttachment.uri }} style={styles.pendingMediaPreview} resizeMode="cover" />
            </Pressable>
          ) : (
            <PendingVideoPreview uri={pendingAttachment.uri} styles={styles} />
          )}
          <Pressable style={styles.pendingMediaCancelBtn} onPress={() => setPendingAttachment(null)} hitSlop={8}>
            <Ionicons name="close" size={18} color="#fff" />
          </Pressable>
        </View>
      ) : pendingAttachment && (pendingAttachment.kind === 'document' || pendingAttachment.kind === 'library') ? (
        <View style={styles.pendingAttachmentRow}>
          <View style={styles.pendingAttachmentIconWrap}>
            <Ionicons name={pendingAttachment.kind === 'library' ? 'play-circle-outline' : 'document-text-outline'} size={18} color={colors.textFaint} />
          </View>
          <Text style={styles.pendingAttachmentName} numberOfLines={1}>
            {pendingAttachment.kind === 'library' ? pendingAttachment.item.title : pendingAttachment.name}
          </Text>
          <Pressable onPress={() => setPendingAttachment(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.textFaint} />
          </Pressable>
        </View>
      ) : null}

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
              {attaching ? (
                <ActivityIndicator size="small" color={colors.textFaint} />
              ) : (
                <Ionicons name="attach" size={22} color={colors.textFaint} />
              )}
            </Pressable>
            <View style={styles.composerBar}>
              <TextInput
                style={styles.input}
                placeholder={editing ? 'Edit your message…' : pendingAttachment ? 'Add a caption…' : `Message ${name.split(' ')[0]}…`}
                placeholderTextColor={colors.textFaint}
                value={draft}
                onChangeText={onDraftChange}
                multiline
              />
              <Pressable style={styles.emojiBtn} onPress={() => setEmojiPickerOpen(true)} hitSlop={8}>
                <Ionicons name="happy-outline" size={20} color={colors.textFaint} />
              </Pressable>
            </View>
            {draft.trim().length > 0 || pendingAttachment ? (
              <Pressable style={styles.sendBtn} onPress={send} disabled={sending}>
                {sending ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Ionicons name={editing ? 'checkmark' : 'send'} size={17} color={colors.onPrimary} />}
              </Pressable>
            ) : (
              <Pressable style={styles.sendBtn} onPress={startVoiceNote}>
                <Ionicons name="mic" size={19} color={colors.onPrimary} />
              </Pressable>
            )}
          </>
        )}
      </View>

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
        onBlock={toggleBlock}
        blocked={prefs.blocked}
        onClear={clearChat}
        onDelete={deleteChat}
        colors={colors}
      />

      <MessageActionSheet
        item={msgMenuItem}
        myUserId={myUserId}
        onClose={() => setMsgMenuItem(null)}
        onReact={reactToMessage}
        onReply={startReply}
        onCopy={copyMessage}
        onShare={shareMessage}
        onPin={togglePinMessage}
        onEdit={startEdit}
        onDelete={askDelete}
        colors={colors}
      />

      <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} colors={colors} />

      <ReportSheet visible={reportOpen} onClose={() => setReportOpen(false)} assignmentId={assignmentId} colors={colors} />

      <ClipMenu
        visible={clipMenuOpen}
        onClose={() => setClipMenuOpen(false)}
        onDocument={pickDocument}
        onMedia={pickMedia}
        onCamera={pickCamera}
        onAudio={pickAudio}
        onPoll={() => { setClipMenuOpen(false); setPollSheetOpen(true); }}
        onLocation={shareLocation}
        onLibrary={isTutorViewer ? () => { setClipMenuOpen(false); setLibraryPickerOpen(true); } : undefined}
        onTeachingTools={isTutorViewer ? () => { setClipMenuOpen(false); navigation.navigate('TeachingTools'); } : undefined}
        showLocation={record?.lessonType ? record.lessonType !== 'online' : false}
        colors={colors}
      />
      <PollComposer visible={pollSheetOpen} onClose={() => setPollSheetOpen(false)} onSubmit={sendPollSubmit} colors={colors} />
      <LibraryClipPicker visible={libraryPickerOpen} onClose={() => setLibraryPickerOpen(false)} onPick={pickLibraryClip} colors={colors} />
      <EmojiPicker visible={emojiPickerOpen} onClose={() => setEmojiPickerOpen(false)} onPick={insertEmoji} colors={colors} />
    </KeyboardAvoidingView>
  );
}

const SWIPE_REPLY_THRESHOLD = 42;

// Swipe right to reply (a small reply icon fades in as you drag, released
// past the threshold triggers it and snaps back - the gesture stays
// horizontal-only so it doesn't fight the list's own vertical scroll).
// Tapping a bubble you sent reveals/hides a faint Seen/Delivered line,
// reading the real per-message readByStudent/readByTutor flag rather than
// showing anything synthetic.
function MessageRow({
  item,
  messages,
  myUserId,
  revealedSeenId,
  onToggleSeen,
  highlightedId,
  onLongPress,
  onSwipeReply,
  onOpenImage,
  onVotePoll,
  onForward,
  onOpenLink,
  onJumpToQuote,
  colors,
  styles,
}: {
  item: ChatMessage;
  messages: ChatMessage[];
  myUserId: number | undefined;
  revealedSeenId: number | null;
  onToggleSeen: (id: number) => void;
  highlightedId: number | null;
  onLongPress: (m: ChatMessage) => void;
  onSwipeReply: (m: ChatMessage) => void;
  onOpenImage: (url: string) => void;
  onVotePoll: (m: ChatMessage, optionId: number) => void;
  onForward: (m: ChatMessage) => void;
  onOpenLink: (url: string) => void;
  onJumpToQuote: (id: number) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const mine = item.senderId === myUserId;
  const quoted = item.replyToId ? messages.find((m) => m.id === item.replyToId) : null;
  const translateX = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const highlightOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (highlightedId === item.id) {
      highlightOpacity.setValue(1);
      Animated.timing(highlightOpacity, { toValue: 0, duration: 1000, useNativeDriver: true }).start();
    }
  }, [highlightedId, item.id, highlightOpacity]);

  const panResponder = useRef(
    PanResponder.create({
      // onStartShouldSetPanResponderCapture claims the gesture in the
      // capture phase (before it can bubble to anything else, including
      // the screen-edge gesture area) - onMoveShouldSetPanResponder alone
      // reacted too late for a short, right-near-the-edge swipe to ever
      // register as a swipe at all.
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderMove: (_, g) => {
        const dx = Math.max(0, Math.min(g.dx, 90));
        translateX.setValue(dx);
        iconOpacity.setValue(Math.min(1, dx / SWIPE_REPLY_THRESHOLD));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_REPLY_THRESHOLD) onSwipeReply(item);
        Animated.parallel([
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
          Animated.timing(iconOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        ]).start();
      },
      onPanResponderTerminate: () => {
        Animated.parallel([
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
          Animated.timing(iconOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        ]).start();
      },
    }),
  ).current;

  if (item.deleted) {
    return (
      <View style={[styles.bubble, styles.bubbleDeleted, mine ? styles.bubbleMine : styles.bubbleTheirs, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}>
        <Text style={styles.deletedText}>This message was deleted</Text>
      </View>
    );
  }

  const isImageOnly = !item.text && item.attachment?.kind === 'image';
  const seen = mine ? (item.senderRole === 'student' ? item.readByTutor : item.readByStudent) : false;

  return (
    <View style={styles.rowWrap} {...panResponder.panHandlers}>
      <Animated.View style={[styles.swipeReplyIcon, { opacity: iconOpacity }]}>
        <Ionicons name="arrow-undo" size={16} color={colors.primaryRed} />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }}>
        <View style={[styles.bubbleRow, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}>
          {mine ? (
            <Pressable style={styles.forwardBtn} onPress={() => onForward(item)} hitSlop={8}>
              <Ionicons name="arrow-redo-outline" size={15} color={colors.textFaint} />
            </Pressable>
          ) : null}
          <Pressable
            onLongPress={() => onLongPress(item)}
            onPress={() => mine && onToggleSeen(item.id)}
            style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, isImageOnly && styles.bubbleImageOnly]}
          >
            <Animated.View pointerEvents="none" style={[styles.highlightOverlay, { opacity: highlightOpacity }]} />
            {item.pinned ? <Ionicons name="pin" size={11} color={mine ? 'rgba(255,255,255,0.85)' : colors.textFaint} style={styles.pinIcon} /> : null}
            {quoted ? (
              <Pressable style={[styles.quoteBox, mine && styles.quoteBoxMine]} onPress={() => onJumpToQuote(quoted.id)}>
                <Text style={[styles.quoteText, mine && { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={1}>{messagePreview(quoted)}</Text>
              </Pressable>
            ) : null}
            {item.attachment ? (
              <AttachmentView attachment={item.attachment} mine={mine} colors={colors} onOpenImage={onOpenImage} />
            ) : null}
            {item.libraryItem ? (
              <View style={styles.libraryClipBox}>
                <Ionicons name="play-circle" size={18} color={mine ? '#fff' : colors.primaryRed} />
                <Text style={[styles.libraryClipText, mine && { color: '#fff' }]} numberOfLines={2}>{item.libraryItem.title}</Text>
              </View>
            ) : null}
            {item.poll ? <PollView poll={item.poll} myUserId={myUserId} mine={mine} onVote={(optionId) => onVotePoll(item, optionId)} colors={colors} /> : null}
            {item.location ? <LocationMapView lat={item.location.lat} lng={item.location.lng} /> : null}
            {item.text ? <LinkifiedText text={item.text} mine={mine} colors={colors} styles={styles} onOpenLink={onOpenLink} /> : null}
            {item.text ? <LinkPreviewCard text={item.text} styles={styles} onOpenLink={onOpenLink} /> : null}
            <View style={styles.bubbleFooter}>
              {item.editedAt ? <Text style={[styles.editedTag, mine && { color: 'rgba(255,255,255,0.7)' }]}>edited</Text> : null}
              <Text style={[styles.bubbleTime, mine && { color: 'rgba(255,255,255,0.75)' }]}>{formatTime(item.createdAt)}</Text>
            </View>
          </Pressable>
          {!mine ? (
            <Pressable style={styles.forwardBtn} onPress={() => onForward(item)} hitSlop={8}>
              <Ionicons name="arrow-redo-outline" size={15} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        {item.reactions && item.reactions.length ? (
          <View style={[styles.reactionsPill, { alignSelf: mine ? 'flex-end' : 'flex-start', marginRight: mine ? 26 : 0, marginLeft: mine ? 0 : 26 }]}>
            <Text style={styles.reactionsPillText}>
              {Array.from(new Set(item.reactions.map((r) => r.emoji))).join('')}
              {item.reactions.length > 1 ? ` ${item.reactions.length}` : ''}
            </Text>
          </View>
        ) : null}
        {mine && revealedSeenId === item.id ? (
          <Text style={styles.seenText}>{seen ? 'Seen' : 'Delivered'}</Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

function LinkifiedText({
  text,
  mine,
  colors,
  styles,
  onOpenLink,
}: {
  text: string;
  mine: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onOpenLink: (url: string) => void;
}) {
  // split() on a capturing-group regex alternates plain text (even index)
  // with matches (odd index) - checking that index parity instead of
  // re-running URL_RE.test() per part avoids a real bug re-testing would
  // have: URL_RE carries the /g flag, so a stateful lastIndex left over
  // from one .test() call made the very next one silently start mid-
  // string, intermittently missing real links.
  const parts = text.split(URL_RE);
  return (
    <Text style={[styles.bubbleText, mine && { color: colors.onPrimary }]}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={styles.linkText} onPress={() => onOpenLink(part)}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

// A per-URL cache shared across every LinkPreviewCard instance for this
// screen's lifetime - re-mounting a message row (list re-render, reaction,
// scroll recycling) shouldn't re-fetch a preview it already resolved.
const linkPreviewCache = new Map<string, chatApi.LinkPreview | null>();

// Renders a rich card (title/description/image) below a message's text
// when it contains a link, the way WhatsApp/iMessage preview shared links,
// instead of leaving it as plain underlined text with no context. Silent
// by design if no preview is available - same tolerant contract as the
// server route this calls.
function LinkPreviewCard({
  text,
  styles,
  onOpenLink,
}: {
  text: string;
  styles: ReturnType<typeof createStyles>;
  onOpenLink: (url: string) => void;
}) {
  const rawMatch = text.match(URL_RE);
  const rawUrl = rawMatch ? rawMatch[0] : null;
  const url = rawUrl ? (/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`) : null;
  const [preview, setPreview] = useState<chatApi.LinkPreview | null>(url ? linkPreviewCache.get(url) ?? null : null);

  useEffect(() => {
    if (!url || linkPreviewCache.has(url)) return;
    let cancelled = false;
    chatApi.fetchLinkPreview(url).then((data) => {
      linkPreviewCache.set(url, data.preview);
      if (!cancelled) setPreview(data.preview);
    }).catch(() => {
      linkPreviewCache.set(url, null);
    });
    return () => { cancelled = true; };
  }, [url]);

  if (!url || !preview) return null;
  const previewUrl = preview.url;

  return (
    <Pressable style={styles.linkPreviewCard} onPress={() => onOpenLink(previewUrl)}>
      {preview.image ? <Image source={{ uri: preview.image }} style={styles.linkPreviewImage} resizeMode="cover" /> : null}
      <View style={styles.linkPreviewBody}>
        {preview.title ? <Text style={styles.linkPreviewTitle} numberOfLines={2}>{preview.title}</Text> : null}
        {preview.description ? <Text style={styles.linkPreviewDescription} numberOfLines={2}>{preview.description}</Text> : null}
        <Text style={styles.linkPreviewSite} numberOfLines={1}>{preview.siteName}</Text>
      </View>
    </Pressable>
  );
}

// The fixed 5-reaction set data/reaction-emoji.js accepts - anything else
// is rejected server-side, so the picker only ever offers these.
const REACTIONS: { emoji: string; label: string }[] = [
  { emoji: '👍', label: 'Like' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '🙏', label: 'Thanks' },
];

function MessageActionSheet({
  item,
  myUserId,
  onClose,
  onReact,
  onReply,
  onCopy,
  onShare,
  onPin,
  onEdit,
  onDelete,
  colors,
}: {
  item: ChatMessage | null;
  myUserId: number | undefined;
  onClose: () => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onReply: (m: ChatMessage) => void;
  onCopy: (m: ChatMessage) => void;
  onShare: (m: ChatMessage) => void;
  onPin: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!item) return null;
  const mine = item.senderId === myUserId;
  const withinEditWindow = Date.now() - new Date(item.createdAt).getTime() <= EDIT_WINDOW_MS;
  const myReaction = (item.reactions || []).find((r) => r.userId === myUserId)?.emoji;

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.reactionRow}>
            {REACTIONS.map((r) => (
              <Pressable
                key={r.emoji}
                style={[styles.reactionBtn, myReaction === r.emoji && styles.reactionBtnActive]}
                onPress={() => onReact(item, r.emoji)}
              >
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.popoverItem} onPress={() => onReply(item)}>
            <Ionicons name="arrow-undo" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Reply</Text>
          </Pressable>
          {item.text ? (
            <Pressable style={styles.popoverItem} onPress={() => onCopy(item)}>
              <Ionicons name="copy-outline" size={16} color={colors.text} />
              <Text style={styles.popoverItemText}>Copy</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.popoverItem} onPress={() => onShare(item)}>
            <Ionicons name="share-outline" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Share</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={() => onPin(item)}>
            <Ionicons name="pin" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>{item.pinned ? 'Unpin' : 'Pin'}</Text>
          </Pressable>
          {mine && withinEditWindow ? (
            <Pressable style={styles.popoverItem} onPress={() => onEdit(item)}>
              <Ionicons name="pencil" size={16} color={colors.text} />
              <Text style={styles.popoverItemText}>Edit</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.popoverItem} onPress={() => onDelete(item)}>
            <Ionicons name="trash" size={16} color={colors.danger} />
            <Text style={[styles.popoverItemText, { color: colors.danger }]}>Delete</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ImageViewer({ url, onClose, colors }: { url: string | null; onClose: () => void; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.viewerBackdrop} onPress={onClose}>
        {url ? <Image source={{ uri: url }} style={styles.viewerImage} resizeMode="contain" /> : null}
        <Pressable style={styles.viewerClose} onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
      </Pressable>
    </Modal>
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
  onBlock,
  blocked,
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
  onBlock: () => void;
  blocked: boolean;
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
          <Pressable style={styles.popoverItem} onPress={onBlock}>
            <Ionicons name="ban" size={16} color={colors.danger} />
            <Text style={[styles.popoverItemText, { color: colors.danger }]}>{blocked ? 'Unblock' : 'Block'}</Text>
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

function ReportSheet({ visible, onClose, assignmentId, colors }: { visible: boolean; onClose: () => void; assignmentId: number; colors: ThemeColors }) {
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
      await threadsApi.reportThread(`assignment:${assignmentId}`, reason.trim());
      onClose();
      toast('Report submitted. Our team will review it.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not submit report. Try again in a moment.', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.reportSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.reportTitle}>Report this conversation</Text>
          <TextInput
            style={styles.reportInput}
            value={reason}
            onChangeText={setReason}
            placeholder="What happened?"
            placeholderTextColor={colors.textFaint}
            multiline
          />
          <Pressable style={styles.reportSubmit} onPress={submit} disabled={sending}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.reportSubmitText}>Submit report</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Mirrors chat.html's clip-menu exactly: Documents, Photos & Videos,
// Camera, Audio, Tutor library (approved tutors only), Poll, Location
// (in-person lessons only).
function ClipMenu({
  visible,
  onClose,
  onDocument,
  onMedia,
  onCamera,
  onAudio,
  onPoll,
  onLocation,
  onLibrary,
  onTeachingTools,
  showLocation,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onDocument: () => void;
  onMedia: () => void;
  onCamera: () => void;
  onAudio: () => void;
  onPoll: () => void;
  onLocation: () => void;
  onLibrary?: () => void;
  onTeachingTools?: () => void;
  showLocation: boolean;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
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
          {onLibrary ? (
            <Pressable style={styles.popoverItem} onPress={onLibrary}>
              <Ionicons name="videocam" size={16} color={colors.text} />
              <Text style={styles.popoverItemText}>Tutor library</Text>
            </Pressable>
          ) : null}
          {onTeachingTools ? <Pressable style={styles.popoverItem} onPress={onTeachingTools}><Ionicons name="musical-notes-outline" size={16} color={colors.text} /><Text style={styles.popoverItemText}>Teaching tools</Text></Pressable> : null}
          <Pressable style={styles.popoverItem} onPress={onPoll}>
            <Ionicons name="bar-chart" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Poll</Text>
          </Pressable>
          {showLocation ? (
            <Pressable style={styles.popoverItem} onPress={onLocation}>
              <Ionicons name="location" size={16} color={colors.text} />
              <Text style={styles.popoverItemText}>Location</Text>
            </Pressable>
          ) : null}
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
        <Pressable style={styles.reportSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.reportTitle}>Create a poll</Text>
          <TextInput style={styles.reportInput} value={question} onChangeText={setQuestion} placeholder="Ask a question" placeholderTextColor={colors.textFaint} />
          {options.map((opt, i) => (
            <TextInput
              key={i}
              style={[styles.pollOptionInput]}
              value={opt}
              onChangeText={(v) => updateOption(i, v)}
              placeholder={`Option ${i + 1}`}
              placeholderTextColor={colors.textFaint}
            />
          ))}
          {options.length < 6 ? (
            <Pressable style={styles.addOptionBtn} onPress={() => setOptions((prev) => [...prev, ''])}>
              <Ionicons name="add" size={15} color={colors.primaryRed} />
              <Text style={styles.addOptionText}>Add option</Text>
            </Pressable>
          ) : null}
          {error ? <Text style={styles.reportInputError}>{error}</Text> : null}
          <Pressable style={styles.reportSubmit} onPress={submit} disabled={sending}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.reportSubmitText}>Send poll</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Mirrors chat.html's own tutor-library-panel exactly: two tabs (the
// shared Mozart Techniques library and the tutor's own uploads) with one
// search box that filters whichever tab is currently active, rather than
// only ever offering the shared library like this used to.
function LibraryClipPicker({
  visible,
  onClose,
  onPick,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (item: LibraryItem) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<'mozart' | 'mine'>('mozart');
  const [items, setItems] = useState<{ mozart: LibraryItem[]; mine: LibraryItem[] }>({ mozart: [], mine: [] });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTab('mozart');
    setQuery('');
    setLoading(true);
    Promise.all([
      libraryApi.fetchLibraryItems({}).catch(() => ({ items: [] as LibraryItem[] })),
      libraryApi.fetchMyTutorLibrary().catch(() => ({ items: [] as LibraryItem[] })),
    ])
      .then(([mozartData, mineData]) => setItems({ mozart: mozartData.items, mine: mineData.items }))
      .finally(() => setLoading(false));
  }, [visible]);

  const q = query.trim().toLowerCase();
  const visibleItems = (items[tab] || []).filter(
    (item) => !q || `${item.title || ''} ${item.category || ''} ${item.description || ''}`.toLowerCase().includes(q),
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={[styles.reportSheet, { maxHeight: '75%' }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.libraryPickerHeader}>
            <Text style={styles.reportTitle}>Choose a clip to send</Text>
            <View style={styles.libraryTabRow}>
              <Pressable style={[styles.libraryTab, tab === 'mozart' && styles.libraryTabActive]} onPress={() => setTab('mozart')}>
                <Text style={[styles.libraryTabText, tab === 'mozart' && styles.libraryTabTextActive]}>Mozart Techniques</Text>
              </Pressable>
              <Pressable style={[styles.libraryTab, tab === 'mine' && styles.libraryTabActive]} onPress={() => setTab('mine')}>
                <Text style={[styles.libraryTabText, tab === 'mine' && styles.libraryTabTextActive]}>My Library</Text>
              </Pressable>
            </View>
          </View>
          <TextInput
            style={styles.librarySearchInput}
            placeholder="Search this library"
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
          />
          {loading ? (
            <ActivityIndicator color={colors.primaryRed} style={{ marginVertical: 20 }} />
          ) : visibleItems.length === 0 ? (
            <Text style={styles.hintText}>No matching videos in this library.</Text>
          ) : (
            <FlatList
              data={visibleItems}
              keyExtractor={(i) => String(i.id)}
              renderItem={({ item }) => (
                <Pressable style={styles.libraryPickerRow} onPress={() => onPick(item)}>
                  <Ionicons name="play-circle-outline" size={18} color={colors.primaryRed} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.popoverItemText}>{item.title}</Text>
                    <Text style={styles.hintText}>{item.category || 'All courses'}</Text>
                  </View>
                </Pressable>
              )}
            />
          )}
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
                <Text style={styles.reactionEmoji}>{e}</Text>
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
  poll: NonNullable<ChatMessage['poll']>;
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

function AttachmentView({
  attachment,
  mine,
  colors,
  onOpenImage,
}: {
  attachment: NonNullable<ChatMessage['attachment']>;
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
    return <ChatVideoAttachment url={url} styles={styles} />;
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

// A voice note (or any picked audio file) plays inline with a simple tap-
// to-toggle control and progress bar, instead of falling through to the
// generic "tap to open in browser" file chip every other attachment kind
// that isn't image/video gets.
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
  // keepAudioSessionActive defaults to false, which lets this player's
  // claim on the shared audio session get starved by the screen's own
  // always-mounted useAudioRecorder instance (for the mic button) -
  // without this, play() reports playing:true but produces no audible
  // output since the recorder's session category never actually yields.
  const player = useAudioPlayer(url, { keepAudioSessionActive: true });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || 0;
  const current = status.currentTime || 0;
  const remaining = status.playing || current > 0 ? Math.max(0, duration - current) : duration;
  const label = `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;
  const tint = mine ? colors.onPrimary : colors.primaryRed;

  // Re-asserted on every tap rather than trusted from whatever the mode
  // was left at elsewhere - recording a voice note switches the shared
  // session into allowsRecording:true, and it was never being switched
  // back, which is exactly the kind of state that makes playback work
  // once and then silently stop later in the same session.
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

// The composer's own pending-video preview, played straight from the
// local picked file - lets you actually watch what you're about to send
// before sending it, with the same native play/pause/scrub controls the
// sent-message video attachment gets.
function PendingVideoPreview({ uri, styles }: { uri: string; styles: ReturnType<typeof createStyles> }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; });
  return <VideoView player={player} style={styles.pendingMediaPreview} contentFit="cover" nativeControls />;
}

// A separate component so a retry (key remount) actually recreates
// useVideoPlayer's player instance instead of leaving the same, still-
// errored one in place - same reasoning as LibraryScreen's clip player.
function ChatVideoAttachment({ url, styles }: { url: string; styles: ReturnType<typeof createStyles> }) {
  const [retryTick, setRetryTick] = useState(0);
  return <ChatVideoAttachmentPlayer key={retryTick} url={url} styles={styles} onRetry={() => setRetryTick((n) => n + 1)} />;
}

function ChatVideoAttachmentPlayer({
  url,
  styles,
  onRetry,
}: {
  url: string;
  styles: ReturnType<typeof createStyles>;
  onRetry: () => void;
}) {
  const player = useVideoPlayer(url, (p) => { p.loop = false; });
  const { status, error: playerError } = useEvent(player, 'statusChange', { status: player.status });

  return (
    <View style={styles.attachmentVideo}>
      {/* Plays inline with the system's own controls (play/pause, 15s/5s
          skip, fullscreen) - tapping the video body toggles those, nothing
          else. No outer Pressable here on purpose: a wrapping tap handler
          is exactly what made this feel like a clickable link before. */}
      <VideoView player={player} style={styles.attachmentVideoInner} contentFit="cover" nativeControls />
      {status === 'loading' ? (
        <View style={styles.attachmentVideoOverlay} pointerEvents="none">
          <ActivityIndicator color="#fff" size="small" />
        </View>
      ) : null}
      {status === 'error' ? (
        <View style={styles.attachmentVideoOverlay}>
          <Ionicons name="alert-circle" size={16} color="#fff" />
          <Text style={styles.attachmentVideoErrorText} numberOfLines={2}>{playerError?.message || 'Could not play this video.'}</Text>
          <Pressable style={styles.attachmentVideoRetryBtn} onPress={onRetry}>
            <Text style={styles.attachmentVideoRetryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
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
    searchResultRow: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    searchResultTime: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint, marginBottom: 3 },
    searchResultText: { fontSize: 13.5, fontFamily: fonts.body, color: colors.text },
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
    lessonStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    lessonStripTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    lessonStripDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
    lessonStripTagText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textSoft },
    lessonStripBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primaryRed,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    lessonStripBtnText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    billStrip: {
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: `${colors.statusPendingText}14`,
      borderBottomWidth: 1,
      borderBottomColor: `${colors.statusPendingText}33`,
    },
    billStripRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    billStripTitle: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.statusPendingText },
    billStripAmount: { flex: 1, fontSize: 12.5, fontFamily: fonts.body, color: colors.text },
    billStripConfirmBtn: { backgroundColor: colors.primaryRed, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
    billStripConfirmText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    billStripCancelBtn: { borderWidth: 1, borderColor: colors.danger, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
    billStripCancelText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.danger },
    billStripSponsored: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.textSoft },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
    listContent: { padding: 16, gap: 8, flexGrow: 1 },
    rowWrap: { justifyContent: 'center' },
    swipeReplyIcon: { position: 'absolute', left: 4, top: '50%', marginTop: -13 },
    seenText: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint, alignSelf: 'flex-end', marginTop: 2, marginRight: 2 },
    reactionsPill: {
      marginTop: -10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    reactionsPillText: { fontSize: 11 },
    bubble: { borderRadius: 16, paddingHorizontal: 9, paddingVertical: 6, overflow: 'hidden', flexShrink: 1 },
    bubbleImageOnly: { padding: 0 },
    bubbleMine: { backgroundColor: colors.primaryRed, borderBottomRightRadius: 4 },
    bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, maxWidth: '84%' },
    forwardBtn: { width: 22, height: 30, alignItems: 'center', justifyContent: 'center' },
    highlightOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#FDE68A',
    },
    bubbleDeleted: { opacity: 0.6 },
    deletedText: { fontSize: 13, fontFamily: fonts.body, fontStyle: 'italic', color: colors.textFaint },
    bubbleText: { fontSize: 14, fontFamily: fonts.body, color: colors.text, lineHeight: 20 },
    linkText: { color: '#2563EB', textDecorationLine: 'underline' },
    linkPreviewCard: {
      marginTop: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      maxWidth: 260,
    },
    linkPreviewImage: { width: '100%', height: 120, backgroundColor: colors.background },
    linkPreviewBody: { padding: 10, gap: 2 },
    linkPreviewTitle: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text },
    linkPreviewDescription: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, lineHeight: 16 },
    linkPreviewSite: { fontSize: 10.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint, textTransform: 'uppercase', marginTop: 2 },
    pinIcon: { position: 'absolute', top: 6, right: 6 },
    quoteBox: {
      borderLeftWidth: 3,
      borderLeftColor: colors.primaryRed,
      backgroundColor: colors.background,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
      marginBottom: 6,
    },
    quoteBoxMine: { backgroundColor: 'rgba(255,255,255,0.18)', borderLeftColor: '#fff' },
    quoteText: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint },
    bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 4 },
    editedTag: { fontSize: 9.5, fontFamily: fonts.body, fontStyle: 'italic', color: colors.textFaint },
    bubbleTime: { fontSize: 10, fontFamily: fonts.body, color: colors.textFaint },
    attachmentImage: { width: 200, height: 150 },
    attachmentVideo: { width: 220, height: 165, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
    attachmentVideoInner: { width: '100%', height: '100%' },
    attachmentVideoOverlay: {
      position: 'absolute',
      inset: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.55)',
      gap: 6,
      paddingHorizontal: 12,
    },
    attachmentVideoErrorText: { color: '#fff', fontSize: 10.5, fontFamily: fonts.body, textAlign: 'center', lineHeight: 14 },
    attachmentVideoRetryBtn: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
    attachmentVideoRetryText: { color: '#fff', fontSize: 10.5, fontFamily: fonts.bodyBold },
    attachmentFile: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    attachmentName: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text, maxWidth: 160 },
    attachmentAudio: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 190, marginBottom: 4 },
    attachmentAudioBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.3)', overflow: 'hidden' },
    attachmentAudioBarFill: { height: '100%', borderRadius: 2 },
    attachmentAudioTime: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint, fontVariant: ['tabular-nums'] },
    // Deliberately plain (no card/bubble/border) - this is a pre-send
    // preview, not a message, and shouldn't look like one.
    pendingAttachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
    pendingAttachmentThumb: { width: 40, height: 40, borderRadius: 8 },
    pendingAttachmentIconWrap: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    pendingAttachmentName: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint },
    // A photo/video preview sits above the composer bar, not in place of
    // it - the clip button, text input (for a caption), and send button
    // all stay put and usable underneath, same as the document/library
    // pin row already does. Just a taller, real image instead of a small
    // icon, since a photo is the point of the message here.
    pendingMediaRow: { position: 'relative', marginHorizontal: 16, marginBottom: 8 },
    pendingMediaPreview: { width: '100%', height: 130, borderRadius: 12, backgroundColor: '#000' },
    pendingMediaVideoPreview: { alignItems: 'center', justifyContent: 'center' },
    pendingMediaCancelBtn: {
      position: 'absolute',
      top: 8,
      left: 8,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    replyBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    replyBannerName: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    replyBannerText: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 1 },
    editWarning: { fontSize: 11, fontFamily: fonts.body, color: colors.danger, marginTop: 1 },
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
    input: {
      flex: 1,
      maxHeight: 100,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
    },
    emojiBtn: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
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
    sendBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primaryRed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // More menu / message action sheet popover
    menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
    popover: {
      position: 'absolute',
      top: 100,
      right: 20,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 6,
      minWidth: 210,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    popoverItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
    popoverItemText: { fontSize: 13.5, fontFamily: fonts.bodyMedium, color: colors.text },
    popoverDivider: { height: 1, backgroundColor: colors.border, marginVertical: 6, marginHorizontal: 14 },
    muteSubmenu: { paddingLeft: 24 },
    // Bottom sheets (message actions, report)
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
    actionSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 30,
    },
    reactionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: 10,
      marginHorizontal: 2,
    },
    reactionBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    reactionBtnActive: { backgroundColor: `${colors.primaryRed}20` },
    reactionEmoji: { fontSize: 21 },
    reportSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 30,
    },
    reportTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14 },
    reportInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
      minHeight: 90,
      textAlignVertical: 'top',
    },
    reportSubmit: {
      backgroundColor: colors.danger,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
      marginTop: 16,
    },
    reportSubmitText: { fontSize: 14, fontFamily: fonts.bodyBold, color: '#fff' },
    reportInputError: { color: colors.danger, fontFamily: fonts.bodySemiBold, fontSize: 12.5, marginTop: 8 },
    hintText: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', paddingVertical: 14 },
    // Poll composer
    pollOptionInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 13.5,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
      marginTop: 8,
    },
    addOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, alignSelf: 'flex-start' },
    addOptionText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    // Library clip picker
    libraryPickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
    libraryTabRow: { flexDirection: 'row', gap: 6 },
    libraryTab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    libraryTabActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    libraryTabText: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint },
    libraryTabTextActive: { color: colors.onPrimary },
    librarySearchInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.surface,
      marginBottom: 10,
    },
    libraryPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
    // Emoji picker
    emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 4 },
    emojiGridBtn: { width: '18%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    // In-bubble poll
    pollBox: { minWidth: 200 },
    pollHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    pollQuestion: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text, flexShrink: 1 },
    pollOption: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 6,
      backgroundColor: colors.background,
    },
    pollOptionMine: { borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.12)' },
    pollOptionFill: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: `${colors.primaryRed}22` },
    pollOptionFillMine: { backgroundColor: 'rgba(255,255,255,0.18)' },
    pollOptionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
    pollOptionText: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    pollOptionPct: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.textFaint },
    pollTotal: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    // In-bubble library clip / location
    libraryClipBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, maxWidth: 220 },
    libraryClipText: { flex: 1, fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
    locationBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    // Full-screen image viewer
    viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
    viewerImage: { width: '100%', height: '80%' },
    viewerClose: { position: 'absolute', top: 60, right: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  });
}

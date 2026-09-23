import { FlatList, ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import * as authApi from '../api/auth';
import * as chatApi from '../api/chat';
import { ApiError } from '../api/client';
import * as threadsApi from '../api/threads';
import type { MuteDuration } from '../api/threads';
import type { Conversation } from '../api/types';
import Avatar from '../components/Avatar';
import PrimaryButton from '../components/PrimaryButton';
import ScreenWatermark from '../components/ScreenWatermark';
import { useRoleMode } from '../context/RoleModeContext';
import { useTourTarget } from '../context/TourTargetsContext';
import { useToast } from '../context/ToastContext';
import type { MainTabParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = BottomTabScreenProps<MainTabParamList, 'Messages'>;

function timeLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

// Native rebuild of messages.html - real /api/conversations data, real
// thread-preference routes for the long-press row menu and the header "..."
// menu (New group / Select chat / Mark all as read). Scoped to direct
// (student<->tutor) threads - existing group chats aren't listed here yet,
// though creating one (the "+" button, tutors only) is real.
export default function MessagesScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { mode } = useRoleMode();
  const { toast, confirm } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const headerTargetRef = useTourTarget('messages-main');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [actionSheetItem, setActionSheetItem] = useState<Conversation | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [forwarding, setForwarding] = useState(route.params?.forward || null);
  const [forwardingTo, setForwardingTo] = useState<number | null>(null);

  useEffect(() => {
    if (route.params?.forward) {
      setForwarding(route.params.forward);
      navigation.setParams({ forward: undefined });
    }
  }, [route.params?.forward, navigation]);

  const load = useCallback(async () => {
    try {
      const data = await chatApi.fetchConversations();
      setConversations(data.conversations);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your messages.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refetches every time the tab regains focus, not just on mount - the
  // unread count and last message both change from outside this screen
  // (a new message arriving, reading a thread), and there's no socket
  // subscription here to keep the list live otherwise.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function toggleSelected(assignmentId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  }

  async function bulkAction(action: 'archive' | 'mark-unread' | 'delete') {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (action === 'delete' && !(await confirm({ title: 'Delete chats?', message: `Delete ${ids.length} chat(s)? They'll disappear until a new message arrives.`, confirmLabel: 'Delete', destructive: true }))) return;
    try {
      await Promise.all(ids.map((id) => {
        if (action === 'archive') return threadsApi.toggleArchive('assignment', id);
        if (action === 'mark-unread') return threadsApi.markUnread('assignment', id);
        return threadsApi.deleteThread('assignment', id);
      }));
    } catch {
      toast('Some chats could not be updated.', 'error');
    }
    exitSelectMode();
    load();
  }

  async function onMarkAllRead() {
    setHeaderMenuOpen(false);
    try {
      await threadsApi.markAllRead();
      load();
    } catch {
      toast('Could not mark everything read. Try again in a moment.', 'error');
    }
  }

  // In tutor mode this only ever shows threads with the tutor's own
  // students - /api/conversations returns both a "student" row (for
  // assignments where this account is the student) and a "tutor" row (for
  // assignments where they're the tutor) when someone has both roles, so
  // the split has to happen here.
  const roleScoped = mode === 'tutor' ? conversations.filter((c) => c.role === 'tutor') : conversations;
  const visible = roleScoped.filter((c) => {
    if (!query.trim()) return true;
    return c.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View ref={headerTargetRef} collapsable={false} style={styles.header}>
        <Pressable
          style={styles.backBtn}
          // Typed against MainTabParamList (this screen is also reused
          // as-is under TutorTabParamList in tutor mode, which has no
          // "Home" route - just "Tutor") - the cast reflects that real
          // dual usage rather than a type gap.
          onPress={() => navigation.navigate((mode === 'tutor' ? 'Tutor' : 'Home') as 'Home')}
          hitSlop={8}
        >
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Messages</Text>
          <Text style={styles.subtitle}>{roleScoped.length} conversation{roleScoped.length === 1 ? '' : 's'}</Text>
        </View>
        <View style={styles.headerActions}>
          {mode !== 'student' ? (
            <Pressable style={styles.headerIconBtn} onPress={() => setCreateGroupOpen(true)} hitSlop={6}>
              <Ionicons name="add" size={20} color={colors.onPrimary} />
            </Pressable>
          ) : null}
          <Pressable style={styles.headerIconBtnGhost} onPress={() => setHeaderMenuOpen(true)} hitSlop={6}>
            <Ionicons name="ellipsis-vertical" size={18} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {forwarding ? (
        <View style={styles.forwardBanner}>
          <Ionicons name="arrow-redo" size={15} color={colors.primaryRed} />
          <Text style={styles.forwardBannerText} numberOfLines={1}>
            Forwarding: {forwarding.text || (forwarding.attachment ? 'Attachment' : 'Message')} - tap a conversation
          </Text>
          <Pressable onPress={() => setForwarding(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.textFaint} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations"
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {selectMode ? (
        <View style={styles.selectBar}>
          <Text style={styles.selectBarText}>{selected.size} selected</Text>
          <View style={styles.selectBarActions}>
            <Pressable onPress={() => bulkAction('archive')}><Text style={styles.selectBarAction}>Archive</Text></Pressable>
            <Pressable onPress={() => bulkAction('mark-unread')}><Text style={styles.selectBarAction}>Mark unread</Text></Pressable>
            <Pressable onPress={() => bulkAction('delete')}><Text style={[styles.selectBarAction, { color: colors.danger }]}>Delete</Text></Pressable>
            <Pressable onPress={exitSelectMode}><Text style={styles.selectBarAction}>Cancel</Text></Pressable>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="chatbubbles-outline" size={26} color={colors.textFaint} />
          <Text style={styles.emptyText}>{query ? 'No conversations match.' : 'No conversations yet - match with a tutor to start chatting.'}</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => String(item.assignmentId)}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={onRefresh}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.assignmentId);
            const isForwardingHere = forwardingTo === item.assignmentId;
            return (
              <Pressable
                style={[styles.row, isForwardingHere && { opacity: 0.5 }]}
                disabled={forwardingTo !== null}
                onPress={async () => {
                  if (selectMode) { toggleSelected(item.assignmentId); return; }
                  if (forwarding) {
                    setForwardingTo(item.assignmentId);
                    try {
                      await chatApi.forwardMessage(item.assignmentId, `↪ Forwarded\n${forwarding.text || ''}`.trimEnd(), forwarding.attachment);
                      setForwarding(null);
                      navigation.getParent()?.navigate('Chat', { assignmentId: item.assignmentId, name: item.name, photoUrl: item.photoUrl });
                    } catch {
                      toast('Could not forward that message. Try again in a moment.', 'error');
                    } finally {
                      setForwardingTo(null);
                    }
                    return;
                  }
                  navigation.getParent()?.navigate('Chat', { assignmentId: item.assignmentId, name: item.name, photoUrl: item.photoUrl });
                }}
                onLongPress={() => { if (!selectMode && !forwarding) setActionSheetItem(item); }}
              >
                {selectMode ? (
                  <View style={[styles.selectDot, isSelected && styles.selectDotChecked]}>
                    {isSelected ? <Ionicons name="checkmark" size={13} color={colors.onPrimary} /> : null}
                  </View>
                ) : (
                  <Avatar name={item.name} photoUrl={item.photoUrl} size={48} />
                )}
                <View style={styles.rowBody}>
                  <View style={styles.rowTopLine}>
                    <View style={styles.rowNameWrap}>
                      {item.pinned ? <Ionicons name="pin" size={11} color={colors.textFaint} /> : null}
                      <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                      {item.muted ? <Ionicons name="notifications-off" size={12} color={colors.textFaint} /> : null}
                      {item.favorite ? <Ionicons name="star" size={12} color="#EAB308" /> : null}
                    </View>
                    <Text style={styles.rowTime}>{timeLabel(item.lastAt)}</Text>
                  </View>
                  <View style={styles.rowBottomLine}>
                    <Text style={styles.rowLastMessage} numberOfLines={1}>{item.lastMessage || 'No messages yet'}</Text>
                    {item.unread > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <HeaderMenu
        visible={headerMenuOpen}
        onClose={() => setHeaderMenuOpen(false)}
        onNewGroup={mode !== 'student' ? () => { setHeaderMenuOpen(false); setCreateGroupOpen(true); } : null}
        onSelectChat={() => { setHeaderMenuOpen(false); setSelectMode(true); }}
        onMarkAllRead={onMarkAllRead}
        colors={colors}
      />
      <RowActionSheet item={actionSheetItem} onClose={() => setActionSheetItem(null)} onChanged={load} colors={colors} />
      <CreateGroupSheet visible={createGroupOpen} onClose={() => setCreateGroupOpen(false)} colors={colors} />
    </View>
  );
}

function HeaderMenu({
  visible,
  onClose,
  onNewGroup,
  onSelectChat,
  onMarkAllRead,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onNewGroup: (() => void) | null;
  onSelectChat: () => void;
  onMarkAllRead: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <View style={styles.popover}>
          {onNewGroup ? (
            <Pressable style={styles.popoverItem} onPress={onNewGroup}>
              <Ionicons name="people" size={16} color={colors.text} />
              <Text style={styles.popoverItemText}>New group</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.popoverItem} onPress={onSelectChat}>
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Select chat</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={onMarkAllRead}>
            <Ionicons name="mail-open" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Mark all as read</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const MUTE_OPTIONS: { value: MuteDuration; label: string }[] = [
  { value: '8h', label: '8 hours' },
  { value: '1w', label: '1 week' },
  { value: 'always', label: 'Always' },
];

function RowActionSheet({
  item,
  onClose,
  onChanged,
  colors,
}: {
  item: Conversation | null;
  onClose: () => void;
  onChanged: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast, confirm } = useToast();
  const [muteSubmenuOpen, setMuteSubmenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setMuteSubmenuOpen(false); }, [item]);

  if (!item) return null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch {
      toast('Something went wrong. Try again in a moment.', 'error');
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.actionSheetTitle} numberOfLines={1}>{item.name}</Text>

          {busy ? <ActivityIndicator color={colors.primaryRed} style={{ marginVertical: 20 }} /> : (
            <>
              <ActionRow icon="archive" label={item.archived ? 'Unarchive chat' : 'Archive chat'} onPress={() => run(() => threadsApi.toggleArchive('assignment', item.assignmentId))} colors={colors} />

              {!muteSubmenuOpen ? (
                <ActionRow
                  icon={item.muted ? 'notifications-off' : 'notifications'}
                  label={item.muted ? 'Muted (tap to unmute)' : 'Mute notification'}
                  trailing={!item.muted ? 'chevron-forward' : undefined}
                  onPress={() => (item.muted ? run(() => threadsApi.setMute('assignment', item.assignmentId, null)) : setMuteSubmenuOpen(true))}
                  colors={colors}
                />
              ) : (
                <View style={styles.muteSubmenu}>
                  {MUTE_OPTIONS.map((opt) => (
                    <Pressable key={opt.value} style={styles.muteSubmenuItem} onPress={() => run(() => threadsApi.setMute('assignment', item.assignmentId, opt.value))}>
                      <Text style={styles.popoverItemText}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <ActionRow icon="pin" label={item.pinned ? 'Unpin chat' : 'Pin chat'} onPress={() => run(() => threadsApi.togglePin('assignment', item.assignmentId))} colors={colors} />
              <ActionRow icon="mail-unread-outline" label="Mark as unread" onPress={() => run(() => threadsApi.markUnread('assignment', item.assignmentId))} colors={colors} />
              <ActionRow icon={item.favorite ? 'star' : 'star-outline'} label={item.favorite ? 'Remove favourite' : 'Add to favourite'} onPress={() => run(() => threadsApi.toggleFavorite('assignment', item.assignmentId))} colors={colors} />
              <View style={styles.actionSheetDivider} />
              <ActionRow icon="ban" label="Block" danger onPress={() => run(() => threadsApi.toggleBlock(item.assignmentId))} colors={colors} />
              <ActionRow
                icon="brush"
                label="Clear chat"
                danger
                onPress={async () => {
                  if (!(await confirm({ title: 'Clear chat?', message: 'This removes all messages for you only.', confirmLabel: 'Delete', destructive: true }))) return;
                  run(() => threadsApi.clearThread('assignment', item.assignmentId));
                }}
                colors={colors}
              />
              <ActionRow
                icon="trash"
                label="Delete chat"
                danger
                onPress={async () => {
                  if (!(await confirm({ title: 'Delete chat?', message: "It'll disappear until a new message arrives.", confirmLabel: 'Delete', destructive: true }))) return;
                  run(() => threadsApi.deleteThread('assignment', item.assignmentId));
                }}
                colors={colors}
              />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  trailing,
  danger,
  onPress,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  trailing?: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tint = danger ? colors.danger : colors.text;
  return (
    <Pressable style={styles.popoverItem} onPress={onPress}>
      <Ionicons name={icon} size={16} color={tint} />
      <Text style={[styles.popoverItemText, danger && { color: colors.danger }]}>{label}</Text>
      {trailing ? <Ionicons name={trailing} size={13} color={colors.textFaint} style={{ marginLeft: 'auto' }} /> : null}
    </Pressable>
  );
}

function CreateGroupSheet({ visible, onClose, colors }: { visible: boolean; onClose: () => void; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<{ studentId: number; studentName: string; category: string }[]>([]);
  const [course, setCourse] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('Course students');
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    setCreated(null);
    authApi
      .fetchMyAssignments()
      .then((data) => {
        const active = (data.asTutor || []).filter((a) => a.status === 'active' && a.studentName && a.studentId);
        const list = active.map((a) => ({ studentId: a.studentId!, studentName: a.studentName!, category: a.category }));
        setStudents(list);
        const firstCourse = list[0]?.category || null;
        setCourse(firstCourse);
        setSelectedStudents(new Set(list.filter((s) => s.category === firstCourse).map((s) => s.studentId)));
      })
      .catch(() => setError('Could not load your students.'))
      .finally(() => setLoading(false));
  }, [visible]);

  const courses = Array.from(new Set(students.map((s) => s.category)));
  const studentsInCourse = students.filter((s) => s.category === course);

  function toggleStudent(id: number) {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    if (!course) {
      setError('Choose a course.');
      return;
    }
    if (!groupName.trim() || selectedStudents.size === 0) {
      setError('Enter a group name and choose at least one student.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await threadsApi.createTutorGroupChat({ course, groupName: groupName.trim(), studentIds: Array.from(selectedStudents) });
      setCreated(data.conversation.title);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create that group.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          {loading ? (
            <ActivityIndicator color={colors.primaryRed} style={{ marginVertical: 30 }} />
          ) : created ? (
            <View style={styles.createdState}>
              <Ionicons name="checkmark-circle" size={38} color={colors.success} />
              <Text style={styles.actionSheetTitle}>Group created</Text>
              <Text style={styles.hint}>&ldquo;{created}&rdquo; is ready - group chat messaging is coming to the app soon.</Text>
              <PrimaryButton title="Done" onPress={onClose} style={{ marginTop: 16, alignSelf: 'stretch' }} />
            </View>
          ) : students.length === 0 ? (
            <View style={styles.createdState}>
              <Ionicons name="people-outline" size={30} color={colors.textFaint} />
              <Text style={styles.hint}>You need at least one active student before creating a group.</Text>
              <PrimaryButton title="Close" onPress={onClose} style={{ marginTop: 16, alignSelf: 'stretch' }} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 10 }}>
              <Text style={styles.actionSheetTitle}>Create group chat</Text>
              <Text style={styles.sheetLabel}>Course</Text>
              <View style={styles.pillRow}>
                {courses.map((c) => {
                  const active = course === c;
                  return (
                    <Pressable
                      key={c}
                      style={[styles.pill, active && styles.pillActive]}
                      onPress={() => { setCourse(c); setSelectedStudents(new Set(students.filter((s) => s.category === c).map((s) => s.studentId))); }}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.sheetLabel}>Group name</Text>
              <TextInput style={styles.sheetInput} value={groupName} onChangeText={setGroupName} placeholderTextColor={colors.textFaint} />
              <Text style={styles.sheetLabel}>Students</Text>
              {studentsInCourse.map((s) => {
                const checked = selectedStudents.has(s.studentId);
                return (
                  <Pressable key={s.studentId} style={styles.studentRow} onPress={() => toggleStudent(s.studentId)}>
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked ? <Ionicons name="checkmark" size={12} color={colors.onPrimary} /> : null}
                    </View>
                    <Text style={styles.popoverItemText}>{s.studentName}</Text>
                  </Pressable>
                );
              })}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <PrimaryButton title="Create group" onPress={create} loading={saving} style={{ marginTop: 16 }} />
            </ScrollView>
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
      gap: 10,
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backBtnText: { fontSize: 20, color: colors.text, marginTop: -2 },
    headerTitleWrap: { flex: 1 },
    title: { fontSize: 18, fontFamily: fonts.displayBlack, color: colors.text },
    subtitle: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primaryRed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerIconBtnGhost: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginHorizontal: 20,
      marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.body, color: colors.text },
    selectBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 14,
      marginHorizontal: 20,
      marginBottom: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    selectBarText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text },
    selectBarActions: { flexDirection: 'row', gap: 14 },
    selectBarAction: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textSoft },
    forwardBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: `${colors.primaryRed}12`,
      marginHorizontal: 20,
      marginBottom: 10,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    forwardBannerText: { flex: 1, fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 8 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center' },
    list: { paddingHorizontal: 20, paddingBottom: 30 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    selectDot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectDotChecked: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    rowBody: { flex: 1, minWidth: 0 },
    rowTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    rowNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 },
    rowName: { fontSize: 14.5, fontFamily: fonts.bodyBold, color: colors.text, flexShrink: 1 },
    rowTime: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint },
    rowBottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 3 },
    rowLastMessage: { flex: 1, fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    unreadBadge: { backgroundColor: colors.primaryRed, borderRadius: 999, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    unreadBadgeText: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    // Header "..." popover
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
      minWidth: 190,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    popoverItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
    popoverItemText: { fontSize: 13.5, fontFamily: fonts.bodyMedium, color: colors.text },
    // Row long-press action sheet
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    actionSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 30,
    },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
    actionSheetTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, textAlign: 'center', marginBottom: 10 },
    actionSheetDivider: { height: 1, backgroundColor: colors.border, marginVertical: 6, marginHorizontal: 14 },
    muteSubmenu: { paddingLeft: 40 },
    muteSubmenuItem: { paddingVertical: 10 },
    // Create-group sheet
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 12,
      maxHeight: '85%',
    },
    hint: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', marginTop: 8, lineHeight: 18 },
    createdState: { alignItems: 'center', paddingVertical: 10, paddingBottom: 20 },
    sheetLabel: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textFaint, marginBottom: 8, marginTop: 14 },
    sheetInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
    },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
    pillActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    pillText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    pillTextActive: { color: colors.onPrimary },
    studentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
  });
}

import { FlatList } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../../api/client';
import * as organizationsApi from '../../api/organizations';
import type { OrgOwnerConversation, OrgRosterMember } from '../../api/organizations';
import * as orgChatApi from '../../api/orgChat';
import Avatar from '../../components/Avatar';
import PrimaryButton from '../../components/PrimaryButton';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useToast } from '../../context/ToastContext';
import type { SponsorTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<SponsorTabParamList, 'Messages'>;

interface Row {
  conv: OrgOwnerConversation;
  title: string;
  subtitle: string;
  photoUrl: string | null;
}

// The Sponsor tab's own inbox - every real 1:1 or group org-chat thread
// this account (as the org owner) is part of. Starting a *new* 1:1 thread
// happens from the Students tab's Message action instead (which opens/
// creates the conversation then lands here) - this screen, like Org
// Messages, is an inbox of existing threads plus a "New group" action.
export default function SponsorMessagesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { toast, actionSheet, confirm } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [roster, setRoster] = useState<{ students: OrgRosterMember[]; tutors: OrgRosterMember[] }>({ students: [], tutors: [] });
  const [query, setQuery] = useState('');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  const load = useCallback(() => {
    return Promise.all([organizationsApi.fetchOrgConversations(), organizationsApi.fetchOrgMembers()])
      .then(([convData, memberData]) => {
        const photoByStudent = new Map(memberData.students.map((s) => [s.id, resolveMediaUrl(s.photoUrl)]));
        const photoByTutor = new Map(memberData.tutors.map((t) => [t.id, resolveMediaUrl(t.photoUrl)]));
        const built = convData.conversations
          .map((conv) => {
            const isGroup = conv.type === 'group' || conv.type === 'tutor-group';
            const photoUrl = isGroup ? null : conv.studentId ? photoByStudent.get(conv.studentId) || null : conv.tutorId ? photoByTutor.get(conv.tutorId) || null : null;
            return { conv, title: conv.title || 'Conversation', subtitle: conv.lastMessage, photoUrl: photoUrl ?? null };
          })
          .sort((a, b) => new Date(b.conv.lastMessageAt).getTime() - new Date(a.conv.lastMessageAt).getTime());
        setRows(built);
        setRoster({ students: memberData.students, tutors: memberData.tutors });
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your messages.'));
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  function openRow(row: Row) {
    navigation.getParent()?.navigate('OrgChat', { conversationId: row.conv.id, title: row.title, photoUrl: row.photoUrl });
  }

  async function removeFromRow(row: Row) {
    if (!row.conv.studentId) return;
    const ok = await confirm({
      title: 'Remove student?',
      message: `${row.title} will no longer be linked to your sponsorship. This can't be undone.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await organizationsApi.removeOrgMember(row.conv.studentId);
      toast(`Removed ${row.title}.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not remove that student.', 'error');
    }
  }

  function onLongPressRow(row: Row) {
    const isGroup = row.conv.type === 'group' || row.conv.type === 'tutor-group';
    actionSheet({
      title: row.title,
      actions: [
        { label: 'Open', onPress: () => openRow(row) },
        ...(!isGroup && row.conv.studentId
          ? [
              { label: 'View profile', onPress: () => navigation.getParent()?.navigate('CounterpartProfile', { type: 'student' as const, id: row.conv.studentId! }) },
              { label: 'Remove student', destructive: true, onPress: () => removeFromRow(row) },
            ]
          : []),
      ],
    });
  }

  async function markAllRead() {
    setHeaderMenuOpen(false);
    const unread = rows.filter((r) => r.conv.unreadCount > 0);
    await Promise.all(unread.map((r) => orgChatApi.fetchOrgConversationMessages(r.conv.id).catch(() => null)));
    load();
  }

  const visible = rows.filter((row) => !query.trim() || row.title.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Messages</Text>
          <Text style={styles.subtitle}>{rows.length} conversation{rows.length === 1 ? '' : 's'}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerIconBtn} onPress={() => setCreateGroupOpen(true)} hitSlop={6}>
            <Ionicons name="add" size={20} color={colors.onPrimary} />
          </Pressable>
          <Pressable style={styles.headerIconBtnGhost} onPress={() => setHeaderMenuOpen(true)} hitSlop={6}>
            <Ionicons name="ellipsis-vertical" size={18} color={colors.text} />
          </Pressable>
        </View>
      </View>

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
          data={visible}
          keyExtractor={(item) => String(item.conv.id)}
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="chatbubbles-outline" size={26} color={colors.textFaint} />
              <Text style={styles.emptyText}>{query ? 'No conversations match.' : 'Message a student from the Students tab to start a conversation.'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openRow(item)} onLongPress={() => onLongPressRow(item)}>
              <Avatar name={item.title} photoUrl={item.photoUrl} size={44} viewable={false} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>{item.subtitle}</Text>
              </View>
              {item.conv.unreadCount > 0 ? (
                <View style={styles.unreadPill}>
                  <Text style={styles.unreadPillText}>{item.conv.unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      )}

      <HeaderMenu
        visible={headerMenuOpen}
        onClose={() => setHeaderMenuOpen(false)}
        onNewGroup={() => { setHeaderMenuOpen(false); setCreateGroupOpen(true); }}
        onMarkAllRead={markAllRead}
        colors={colors}
      />
      <CreateGroupSheet
        visible={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        students={roster.students}
        colors={colors}
        onCreated={() => {
          setCreateGroupOpen(false);
          toast('Group chat created.', 'success');
          load();
        }}
      />
    </View>
  );
}

function HeaderMenu({
  visible,
  onClose,
  onNewGroup,
  onMarkAllRead,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onNewGroup: () => void;
  onMarkAllRead: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <View style={styles.popover}>
          <Pressable style={styles.popoverItem} onPress={onNewGroup}>
            <Ionicons name="people" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>New group</Text>
          </Pressable>
          <Pressable style={styles.popoverItem} onPress={onMarkAllRead}>
            <Ionicons name="checkmark-done" size={16} color={colors.text} />
            <Text style={styles.popoverItemText}>Mark all as read</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// Students only - "organization and sponsor are different" - a sponsor's
// group chats stay in the sponsor<->student space, kept separate from Org
// Tutor mode's own tutor-facing conversations even though both surfaces
// share this same org account (see GET /api/organizations/conversations'
// audience=student filter, which this feeds into).
function CreateGroupSheet({
  visible,
  onClose,
  students,
  onCreated,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  students: OrgRosterMember[];
  onCreated: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setSelected(new Set());
    }
  }, [visible]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    if (!name.trim()) {
      toast('Enter a group name.', 'error');
      return;
    }
    if (!selected.size) {
      toast('Choose at least one student.', 'error');
      return;
    }
    setCreating(true);
    try {
      const members = students
        .filter((s) => selected.has(s.id))
        .map((s) => ({ id: s.id, type: 'student' as const, name: s.name }));
      await orgChatApi.createOrgGroupChat(name.trim(), members);
      onCreated();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not create that group.', 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Create group chat</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Group name" placeholderTextColor={colors.textFaint} />
          <FlatList
            style={{ maxHeight: 260, marginTop: 12 }}
            data={students}
            keyExtractor={(s) => String(s.id)}
            ListEmptyComponent={<Text style={styles.emptyText}>No one has redeemed a code yet.</Text>}
            renderItem={({ item }) => {
              const active = selected.has(item.id);
              return (
                <Pressable style={styles.memberRow} onPress={() => toggle(item.id)}>
                  <Ionicons name={active ? 'checkbox' : 'square-outline'} size={19} color={active ? colors.primaryRed : colors.textFaint} />
                  <Text style={styles.memberRowText}>{item.name}</Text>
                  <Text style={styles.memberRowTag}>Student</Text>
                </Pressable>
              );
            }}
          />
          <PrimaryButton title="Create group" onPress={create} loading={creating} style={{ marginTop: 16 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14 },
    headerTitleWrap: { flex: 1 },
    title: { fontSize: 20, fontFamily: fonts.displayBlack, color: colors.text },
    subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerIconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryRed, alignItems: 'center', justifyContent: 'center' },
    headerIconBtnGhost: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
    popover: {
      position: 'absolute',
      top: 100,
      right: 20,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 4,
      paddingVertical: 4,
      minWidth: 180,
    },
    popoverItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
    popoverItemText: { fontSize: 13.5, fontFamily: fonts.bodyMedium, color: colors.text },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginHorizontal: 20,
      marginBottom: 14,
    },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: 13.5, fontFamily: fonts.body, color: colors.text },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingTop: 60, gap: 8 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, textAlign: 'center', fontSize: 13 },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    rowTitle: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    rowSubtitle: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    unreadPill: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primaryRed, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    unreadPillText: { fontSize: 10.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
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
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
    memberRowText: { flex: 1, fontSize: 14, fontFamily: fonts.bodyMedium, color: colors.text },
    memberRowTag: { fontSize: 10.5, fontFamily: fonts.bodyBold, color: colors.textFaint, textTransform: 'uppercase' },
  });
}

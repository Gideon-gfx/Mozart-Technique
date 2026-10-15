import { FlatList } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../../api/client';
import * as organizationsApi from '../../api/organizations';
import type { OrgStudentMember } from '../../api/organizations';
import * as orgChatApi from '../../api/orgChat';
import * as tutorsApi from '../../api/tutors';
import type { AssignmentSummary } from '../../api/types';
import Avatar from '../../components/Avatar';
import PrimaryButton from '../../components/PrimaryButton';
import ScheduleLessonSheet from '../../components/ScheduleLessonSheet';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useRoleMode } from '../../context/RoleModeContext';
import { useToast } from '../../context/ToastContext';
import type { OrgTutorTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<OrgTutorTabParamList, 'Messages'>;

interface Row {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  photoUrl: string | null;
  unreadCount: number;
  onPress: () => void;
  student?: { studentId: number; assignment: AssignmentSummary };
}

// Every thread an Org Tutor actually has: the real 1:1 org-chat with the
// organization itself, any classroom group chats, and each org student
// they have an active lesson with (reusing the same per-assignment chat
// the Tutor dashboard uses) - one combined list instead of reusing the
// generic lesson-only Messages tab, which never included the org itself.
// Same header shape as the regular Messages tab (back arrow, count,
// create-group action, search) for visual parity between the two.
export default function OrgMessagesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { toast, confirm, actionSheet } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { activeOrgId } = useRoleMode();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [students, setStudents] = useState<OrgStudentMember[]>([]);
  const [activeLessons, setActiveLessons] = useState<AssignmentSummary[]>([]);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [preselected, setPreselected] = useState<AssignmentSummary | null>(null);
  const [query, setQuery] = useState('');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  const load = useCallback(() => {
    return Promise.all([orgChatApi.fetchMyOrgConversations(), organizationsApi.fetchTutorWorkspace(activeOrgId ?? undefined)])
      .then(([chatData, workspace]) => {
        const out: Row[] = [];
        const orgLogo = resolveMediaUrl(workspace.organization.logoUrl);
        setActiveLessons(workspace.assignments.filter((a) => a.status === 'active'));

        chatData.conversations.forEach((conv) => {
          const isGroup = conv.type === 'group' || conv.type === 'tutor-group';
          const title = conv.title && conv.title !== 'Conversation' ? conv.title : isGroup ? 'Group chat' : chatData.organizationName || 'Organization';
          out.push({
            key: `org-${conv.id}`,
            icon: isGroup ? 'people' : 'business',
            title,
            subtitle: isGroup ? `${conv.participants.length} member${conv.participants.length === 1 ? '' : 's'}` : 'Organization',
            photoUrl: isGroup ? null : orgLogo,
            unreadCount: conv.unreadCount || 0,
            onPress: () => navigation.getParent()?.navigate('OrgChat', { conversationId: conv.id, title, photoUrl: isGroup ? null : orgLogo }),
          });
        });

        const assignmentByStudent = new Map<number, AssignmentSummary>();
        workspace.assignments.forEach((a) => {
          if (a.studentId && a.status === 'active') assignmentByStudent.set(a.studentId, a);
        });
        workspace.students
          .map((member) => ({ member, assignment: assignmentByStudent.get(member.studentId) }))
          .filter((entry): entry is { member: typeof entry.member; assignment: AssignmentSummary } => Boolean(entry.assignment))
          .sort((a, b) => a.member.studentName.localeCompare(b.member.studentName))
          .forEach(({ member, assignment }) => {
            const photoUrl = resolveMediaUrl(member.studentPhotoUrl);
            out.push({
              key: `student-${member.studentId}`,
              icon: 'person',
              title: member.studentName,
              subtitle: assignment.category,
              photoUrl,
              unreadCount: 0,
              onPress: () => navigation.getParent()?.navigate('Chat', { assignmentId: assignment.id, name: member.studentName, photoUrl }),
              student: { studentId: member.studentId, assignment },
            });
          });

        setRows(out);
        setStudents(workspace.students);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your messages.'));
  }, [activeOrgId, navigation]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  function openScheduleFor(student: Row['student']) {
    setPreselected(student?.assignment || null);
    setScheduleOpen(true);
  }

  async function removeStudent(student: NonNullable<Row['student']>, name: string) {
    const ok = await confirm({
      title: 'Remove student?',
      message: `This ends your ${student.assignment.category} lessons with ${name}. This can't be undone.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await tutorsApi.endAssignment(student.assignment.id);
      toast(`Removed ${name}.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not remove that student.', 'error');
    }
  }

  function onLongPressRow(row: Row) {
    if (!row.student) return;
    const student = row.student;
    actionSheet({
      title: row.title,
      actions: [
        { label: 'Schedule a class', onPress: () => openScheduleFor(student) },
        { label: 'Message', onPress: row.onPress },
        { label: 'View profile', onPress: () => navigation.getParent()?.navigate('CounterpartProfile', { type: 'student', id: student.studentId }) },
        { label: 'Remove student', destructive: true, onPress: () => removeStudent(student, row.title) },
      ],
    });
  }

  async function markAllRead() {
    setHeaderMenuOpen(false);
    const unread = rows.filter((r) => r.unreadCount > 0 && r.key.startsWith('org-'));
    await Promise.all(unread.map((r) => orgChatApi.fetchOrgConversationMessages(Number(r.key.replace('org-', '')), 'tutor').catch(() => null)));
    load();
  }

  const visible = rows.filter((row) => !query.trim() || row.title.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.navigate('Overview')} hitSlop={8}>
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
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
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="chatbubbles-outline" size={26} color={colors.textFaint} />
              <Text style={styles.emptyText}>{query ? 'No conversations match.' : 'No conversations yet.'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={item.onPress} onLongPress={() => onLongPressRow(item)}>
              <Avatar name={item.title} photoUrl={item.photoUrl} size={44} viewable={false} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>{item.subtitle}</Text>
              </View>
              {item.unreadCount > 0 ? (
                <View style={styles.unreadPill}>
                  <Text style={styles.unreadPillText}>{item.unreadCount}</Text>
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
        students={students}
        colors={colors}
        onCreated={() => {
          setCreateGroupOpen(false);
          toast('Group chat created.', 'success');
          load();
        }}
      />
      <ScheduleLessonSheet
        visible={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        colors={colors}
        students={activeLessons}
        calendarConnected={calendarConnected}
        onScheduled={load}
        preselectedStudent={preselected}
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

function CreateGroupSheet({
  visible,
  onClose,
  students,
  onCreated,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  students: OrgStudentMember[];
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
        .filter((s) => selected.has(s.studentId))
        .map((s) => ({ id: s.studentId, type: 'student' as const, name: s.studentName }));
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
          <Text style={styles.sheetTitle}>Create student group</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Group name" placeholderTextColor={colors.textFaint} />
          <FlatList
            style={{ maxHeight: 260, marginTop: 12 }}
            data={students}
            keyExtractor={(s) => String(s.studentId)}
            ListEmptyComponent={<Text style={styles.emptyText}>No students have applied to you yet.</Text>}
            renderItem={({ item }) => {
              const active = selected.has(item.studentId);
              return (
                <Pressable style={styles.studentRow} onPress={() => toggle(item.studentId)}>
                  <Ionicons name={active ? 'checkbox' : 'square-outline'} size={19} color={active ? colors.primaryRed : colors.textFaint} />
                  <Text style={styles.studentRowText}>{item.studentName}</Text>
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
    backBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { fontSize: 28, color: colors.text, lineHeight: 30 },
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
    studentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
    studentRowText: { fontSize: 14, fontFamily: fonts.bodyMedium, color: colors.text },
  });
}

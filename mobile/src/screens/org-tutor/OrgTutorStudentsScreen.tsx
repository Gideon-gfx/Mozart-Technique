import { FlatList } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../../api/client';
import * as organizationsApi from '../../api/organizations';
import * as tutorsApi from '../../api/tutors';
import type { AssignmentSummary } from '../../api/types';
import Avatar from '../../components/Avatar';
import BackButton from '../../components/BackButton';
import ScheduleLessonSheet from '../../components/ScheduleLessonSheet';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useRoleMode } from '../../context/RoleModeContext';
import { useToast } from '../../context/ToastContext';
import type { OrgTutorTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<OrgTutorTabParamList, 'Students'>;

interface StudentRow {
  studentId: number;
  studentName: string;
  studentPhotoUrl: string | null;
  assignment: AssignmentSummary | null;
}

// The org-linked student roster (org-tutor.html's Students panel) - every
// student who redeemed this organization's code, not just the ones with an
// active assignment yet. Same header/long-press shape as the regular Tutor
// dashboard's Students tab (Schedule class button, long-press menu) - a
// student only gets a Message shortcut once a real assignment (and
// therefore a chat thread) exists between them and this tutor.
export default function OrgTutorStudentsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { activeOrgId } = useRoleMode();
  const { actionSheet, confirm, toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [orgName, setOrgName] = useState('');
  const [activeLessons, setActiveLessons] = useState<AssignmentSummary[]>([]);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [preselected, setPreselected] = useState<AssignmentSummary | null>(null);

  const load = useCallback(() => {
    return organizationsApi
      .fetchTutorWorkspace(activeOrgId ?? undefined)
      .then((data) => {
        const assignmentByStudent = new Map<number, AssignmentSummary>();
        const active = data.assignments.filter((a) => a.status === 'active');
        active.forEach((a) => {
          if (a.studentId) assignmentByStudent.set(a.studentId, a);
        });
        setStudents(
          data.students
            .map((member) => ({
              studentId: member.studentId,
              studentName: member.studentName,
              studentPhotoUrl: resolveMediaUrl(member.studentPhotoUrl),
              assignment: assignmentByStudent.get(member.studentId) || null,
            }))
            .sort((a, b) => a.studentName.localeCompare(b.studentName)),
        );
        setActiveLessons(active);
        setOrgName(data.organization.name);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your students.'));
  }, [activeOrgId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  function openScheduleFor(student: StudentRow | null) {
    setPreselected(student?.assignment || null);
    setScheduleOpen(true);
  }

  async function removeStudent(student: StudentRow) {
    if (!student.assignment) return;
    const ok = await confirm({
      title: 'Remove student?',
      message: `This ends your ${student.assignment.category} lessons with ${student.studentName}. This can't be undone.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await tutorsApi.endAssignment(student.assignment.id);
      toast(`Removed ${student.studentName}.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not remove that student.', 'error');
    }
  }

  function onLongPressStudent(student: StudentRow) {
    actionSheet({
      title: student.studentName,
      actions: [
        { label: 'Schedule a class', onPress: () => openScheduleFor(student) },
        ...(student.assignment
          ? [{
              label: 'Message',
              onPress: () => navigation.getParent()?.navigate('Chat', { assignmentId: student.assignment!.id, name: student.studentName, photoUrl: student.studentPhotoUrl }),
            }]
          : []),
        { label: 'View profile', onPress: () => navigation.getParent()?.navigate('CounterpartProfile', { type: 'student', id: student.studentId }) },
        ...(student.assignment ? [{ label: 'Remove student', destructive: true, onPress: () => removeStudent(student) }] : []),
      ],
    });
  }

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View style={styles.header}>
        <BackButton onPress={() => navigation.navigate('Overview')} />
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title} numberOfLines={1}>Students</Text>
          {orgName ? <Text style={styles.subtitle} numberOfLines={1}>{orgName}</Text> : null}
        </View>
        <Pressable style={styles.scheduleBtn} onPress={() => openScheduleFor(null)}>
          <Ionicons name="calendar" size={14} color={colors.onPrimary} />
          <Text style={styles.scheduleBtnText}>Schedule class</Text>
        </Pressable>
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
          data={students}
          keyExtractor={(item) => String(item.studentId)}
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="people-outline" size={28} color={colors.textFaint} />
              <Text style={styles.emptyText}>No students linked through {orgName || 'your organization'} yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.getParent()?.navigate('CounterpartProfile', { type: 'student', id: item.studentId })}
              onLongPress={() => onLongPressStudent(item)}
            >
              <Avatar name={item.studentName} photoUrl={item.studentPhotoUrl} size={46} viewable={false} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.studentName}</Text>
                <Text style={styles.rowMeta}>{item.assignment ? item.assignment.category : 'Not yet matched to a course'}</Text>
              </View>
              {item.assignment ? (
                <Pressable
                  style={styles.chatBtn}
                  onPress={() => navigation.getParent()?.navigate('Chat', { assignmentId: item.assignment!.id, name: item.studentName, photoUrl: item.studentPhotoUrl })}
                  hitSlop={8}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={colors.primaryRed} />
                </Pressable>
              ) : null}
            </Pressable>
          )}
        />
      )}

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
    headerTitleWrap: { flex: 1, minWidth: 0 },
    title: { fontSize: 20, fontFamily: fonts.displayBlack, color: colors.text },
    subtitle: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primaryRed, marginTop: 2 },
    scheduleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primaryRed,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 9,
      flexShrink: 0,
    },
    scheduleBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
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
    rowName: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    rowMeta: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    chatBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: `${colors.primaryRed}12`, alignItems: 'center', justifyContent: 'center' },
  });
}

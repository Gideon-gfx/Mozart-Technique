import { FlatList } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import * as authApi from '../../api/auth';
import * as calendarApi from '../../api/calendar';
import { ApiError } from '../../api/client';
import * as tutorsApi from '../../api/tutors';
import type { AssignmentSummary } from '../../api/types';
import Avatar from '../../components/Avatar';
import BackButton from '../../components/BackButton';
import ScheduleLessonSheet from '../../components/ScheduleLessonSheet';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useToast } from '../../context/ToastContext';
import type { TutorTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<TutorTabParamList, 'Students'>;

interface StudentRow {
  studentId: number;
  studentName: string;
  studentPhotoUrl: string | null;
  courses: AssignmentSummary[];
}

// One row per real current student (grouped from /api/my-assignments'
// asTutor list, same data the dashboard's Students KPI counts) - tap to
// view their public profile, or message them directly. The header's
// "Schedule class" button opens the same real scheduling flow as the
// Tutor home tab's quick tool.
export default function TutorStudentsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { actionSheet, confirm, toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [activeLessons, setActiveLessons] = useState<AssignmentSummary[]>([]);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [preselected, setPreselected] = useState<AssignmentSummary | null>(null);

  const load = useCallback(() => {
    Promise.all([authApi.fetchMyAssignments(), calendarApi.fetchCalendarStatus().catch(() => ({ connected: false }))])
      .then(([data, calStatus]) => {
        const active = (data.asTutor || []).filter((item) => item.status === 'active' && item.studentId);
        setActiveLessons(active);
        const byStudent = new Map<number, StudentRow>();
        active.forEach((item) => {
          const id = item.studentId!;
          const existing = byStudent.get(id);
          if (existing) existing.courses.push(item);
          else byStudent.set(id, { studentId: id, studentName: item.studentName || 'Student', studentPhotoUrl: item.studentPhotoUrl ?? null, courses: [item] });
        });
        setStudents([...byStudent.values()].sort((a, b) => a.studentName.localeCompare(b.studentName)));
        setCalendarConnected(calStatus.connected);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your students.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openScheduleFor(student: StudentRow) {
    setPreselected(student.courses[0]);
    setScheduleOpen(true);
  }

  async function removeStudent(student: StudentRow) {
    const ok = await confirm({
      title: 'Remove student?',
      message: `This ends your ${student.courses.map((c) => c.category).join(', ')} lessons with ${student.studentName}. This can't be undone.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await Promise.all(student.courses.map((c) => tutorsApi.endAssignment(c.id)));
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
        {
          label: 'Message',
          onPress: () => navigation.getParent()?.navigate('Chat', { assignmentId: student.courses[0].id, name: student.studentName, photoUrl: student.studentPhotoUrl }),
        },
        { label: 'View profile', onPress: () => navigation.getParent()?.navigate('CounterpartProfile', { type: 'student', id: student.studentId }) },
        { label: 'Remove student', destructive: true, onPress: () => removeStudent(student) },
      ],
    });
  }

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <BackButton onPress={() => navigation.navigate('Tutor')} />
          <Text style={styles.title} numberOfLines={1}>Students</Text>
        </View>
        <Pressable style={styles.scheduleBtn} onPress={() => { setPreselected(null); setScheduleOpen(true); }}>
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
              <Text style={styles.emptyText}>No students yet. Accepted requests will show up here.</Text>
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
                <Text style={styles.rowMeta}>{item.courses.map((c) => c.category).join(' · ')}</Text>
              </View>
              <Pressable
                style={styles.chatBtn}
                onPress={() => navigation.getParent()?.navigate('Chat', { assignmentId: item.courses[0].id, name: item.studentName, photoUrl: item.studentPhotoUrl })}
                hitSlop={8}
              >
                <Ionicons name="chatbubble-outline" size={18} color={colors.primaryRed} />
              </Pressable>
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
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 14,
      gap: 10,
    },
    headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
    title: { flexShrink: 1, fontSize: 20, fontFamily: fonts.displayBlack, color: colors.text },
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

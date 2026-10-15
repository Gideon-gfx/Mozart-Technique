import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import * as tutorsApi from '../api/tutors';
import type { AssignmentSummary } from '../api/types';
import { useToast } from '../context/ToastContext';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import PrimaryButton from './PrimaryButton';

const DURATIONS = [30, 45, 60, 90, 120];

// Mirrors tutor.html's "Schedule a lesson" modal exactly: pick the student/
// course (the web version reaches this from a specific request row already
// scoped to one; entry points here that aren't already scoped to a student
// add that as an explicit first step), date & time, and length, then the
// same real /api/assignments/:id/schedule call - creates a Google Calendar
// event with a Meet link and invites the student. Shared between the Tutor
// dashboard's "Schedule lesson" quick tool and the Students tab's header
// button.
export default function ScheduleLessonSheet({
  visible,
  onClose,
  colors,
  students,
  calendarConnected,
  onScheduled,
  preselectedStudent,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ThemeColors;
  students: AssignmentSummary[];
  calendarConnected: boolean;
  onScheduled: () => void;
  preselectedStudent?: AssignmentSummary | null;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [selected, setSelected] = useState<AssignmentSummary | null>(null);
  const [when, setWhen] = useState(() => { const d = new Date(Date.now() + 60 * 60 * 1000); d.setMinutes(0, 0, 0); return d; });
  const [duration, setDuration] = useState(60);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setSelected(preselectedStudent || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function submit() {
    if (!selected) return;
    setSaving(true);
    try {
      await tutorsApi.scheduleAssignment(selected.id, when.toISOString(), duration);
      toast('Lesson scheduled - Meet link sent to your student.', 'success');
      onScheduled();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not schedule the lesson.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Schedule a lesson</Text>

          {!calendarConnected ? (
            <Text style={styles.calendarWarning}>Connect Google Calendar on your Tutor home first - a lesson can&apos;t be scheduled without it.</Text>
          ) : !selected ? (
            <>
              <Text style={styles.fieldLabel}>Choose a student</Text>
              {students.length === 0 ? (
                <Text style={styles.emptyText}>No active students yet - accept a request first.</Text>
              ) : (
                students.map((item) => (
                  <Pressable key={item.id} style={styles.studentPickRow} onPress={() => setSelected(item)}>
                    <Text style={styles.listItemName}>{item.studentName}</Text>
                    <Text style={styles.listItemMeta}>{item.category}</Text>
                  </Pressable>
                ))
              )}
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>With {selected.studentName}. Creates a Google Calendar event with a Meet link and invites your student.</Text>
              <Text style={styles.fieldLabel}>Length</Text>
              <View style={styles.durationRow}>
                {DURATIONS.map((mins) => {
                  const active = duration === mins;
                  return (
                    <Pressable key={mins} style={[styles.durationPill, active && styles.durationPillActive]} onPress={() => setDuration(mins)}>
                      <Text style={[styles.durationPillText, active && styles.durationPillTextActive]}>{mins < 60 ? `${mins}m` : `${mins / 60}h${mins % 60 ? `${mins % 60}m` : ''}`}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>Date & time</Text>
              <View style={styles.dateStepRow}>
                <Pressable style={styles.dateStepBtn} onPress={() => setWhen(new Date(when.getTime() - 24 * 60 * 60000))}>
                  <Text style={styles.dateStepBtnText}>− day</Text>
                </Pressable>
                <Text style={styles.dateStepValue}>{when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                <Pressable style={styles.dateStepBtn} onPress={() => setWhen(new Date(when.getTime() + 24 * 60 * 60000))}>
                  <Text style={styles.dateStepBtnText}>+ day</Text>
                </Pressable>
              </View>
              <View style={styles.dateStepRow}>
                <Pressable style={styles.dateStepBtn} onPress={() => setWhen(new Date(when.getTime() - 30 * 60000))}>
                  <Text style={styles.dateStepBtnText}>− 30m</Text>
                </Pressable>
                <Text style={styles.dateStepValue}>{when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
                <Pressable style={styles.dateStepBtn} onPress={() => setWhen(new Date(when.getTime() + 30 * 60000))}>
                  <Text style={styles.dateStepBtnText}>+ 30m</Text>
                </Pressable>
              </View>
              <PrimaryButton title="Schedule" onPress={submit} loading={saving} style={{ marginTop: 18 }} />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    calendarWarning: { fontSize: 12.5, fontFamily: fonts.body, color: colors.statusPendingText, lineHeight: 18 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    fieldLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 10, marginBottom: 6 },
    listItemName: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    listItemMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 1 },
    studentPickRow: {
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
    durationPill: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    durationPillActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    durationPillText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
    durationPillTextActive: { color: colors.onPrimary },
    dateStepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background, borderRadius: 12, padding: 10, marginBottom: 8 },
    dateStepBtn: { paddingHorizontal: 10, paddingVertical: 6 },
    dateStepBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    dateStepValue: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
  });
}

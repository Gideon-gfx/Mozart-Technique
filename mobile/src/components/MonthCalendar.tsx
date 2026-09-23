import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AssignmentSummary } from '../api/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';

// Shared by the Tutor dashboard and the Organization Tutor dashboard - same
// grid either way: current month, today highlighted, a dot under any day
// with a real scheduled lesson from whichever `lessons` list the caller
// passes in (all lessons for Tutor mode, org-scoped ones for Org Tutor
// mode). Purely a glance-at-your-month widget - "View all your schedules"
// is a separate, explicit link the caller renders next to it.
export default function MonthCalendar({ lessons, colors }: { lessons: AssignmentSummary[]; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const lessonDays = useMemo(() => {
    const set = new Set<string>();
    lessons.forEach((item) => {
      if (item.scheduledAt) set.add(new Date(item.scheduledAt).toDateString());
    });
    return set;
  }, [lessons]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const cells: (Date | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))];

  return (
    <View style={styles.calWrap}>
      <View style={styles.calHeaderRow}>
        <Pressable onPress={() => setCursor(new Date(year, month - 1, 1))} hitSlop={8}>
          <Ionicons name="chevron-back" size={16} color={colors.text} />
        </Pressable>
        <Text style={styles.calMonthLabel}>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        <Pressable onPress={() => setCursor(new Date(year, month + 1, 1))} hitSlop={8}>
          <Ionicons name="chevron-forward" size={16} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.calGrid}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} style={styles.calHeadCell}>{d}</Text>
        ))}
        {cells.map((date, i) => {
          if (!date) return <View key={i} style={styles.calCell} />;
          const isToday = date.toDateString() === today.toDateString();
          const hasLesson = lessonDays.has(date.toDateString());
          return (
            <View key={i} style={styles.calCell}>
              <View style={[styles.calDayCircle, isToday && { backgroundColor: colors.primaryRed }]}>
                <Text style={[styles.calDayText, isToday && { color: colors.onPrimary }]}>{date.getDate()}</Text>
              </View>
              {hasLesson ? <View style={[styles.calDot, { backgroundColor: colors.primaryRed }]} /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    calWrap: {},
    calHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    calMonthLabel: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    calHeadCell: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 10.5, fontFamily: fonts.bodyBold, color: colors.textFaint, marginBottom: 4 },
    calCell: { width: `${100 / 7}%`, alignItems: 'center', marginBottom: 4 },
    calDayCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    calDayText: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    calDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  });
}

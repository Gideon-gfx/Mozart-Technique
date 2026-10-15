import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import type { AssignmentSummary } from '../api/types';
import BackButton from '../components/BackButton';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'Schedule'>;

type SectionName = 'Upcoming' | 'Current' | 'Past';

const SECTION_META: Record<SectionName, { icon: keyof typeof Ionicons.glyphMap; note: string; subtitle: string }> = {
  Upcoming: { icon: 'calendar', note: 'Coming up', subtitle: 'Your next planned lessons' },
  Current: { icon: 'videocam', note: 'Happening now', subtitle: 'Join while the lesson is in progress' },
  Past: { icon: 'time', note: 'Lesson history', subtitle: 'Completed and previous lessons' },
};

type Row = { item: AssignmentSummary; role: 'student' | 'tutor'; section: SectionName };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Mirrors public/schedule.html's grouping exactly - same /api/my-assignments
// data, same Upcoming/Current/Past split by scheduledAt + durationMinutes,
// built native instead of a web redirect per the standing "connect, don't
// redirect" rule.
export default function ScheduleScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authApi
      .fetchMyAssignments()
      .then((data) => {
        const now = Date.now();
        const all: Array<{ item: AssignmentSummary; role: 'student' | 'tutor' }> = [
          ...(data.asStudent || []).map((item) => ({ item, role: 'student' as const })),
          ...(data.asTutor || []).map((item) => ({ item, role: 'tutor' as const })),
        ];
        const withSection: Row[] = all
          .filter((row) => row.item.scheduledAt)
          .map((row) => {
            const start = new Date(row.item.scheduledAt!).getTime();
            const end = start + Number(row.item.durationMinutes || 60) * 60000;
            const section: SectionName = start > now ? 'Upcoming' : end >= now ? 'Current' : 'Past';
            return { ...row, section };
          })
          .sort((a, b) => new Date(a.item.scheduledAt!).getTime() - new Date(b.item.scheduledAt!).getTime());
        setRows(withSection);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your schedule.'))
      .finally(() => setLoading(false));
  }, []);

  const sections: SectionName[] = ['Upcoming', 'Current', 'Past'];
  const counts = sections.reduce<Record<SectionName, number>>((acc, name) => {
    acc[name] = rows.filter((row) => row.section === name).length;
    return acc;
  }, { Upcoming: 0, Current: 0, Past: 0 });

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>My schedule</Text>
        <View style={styles.headerSpacer} />
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
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.statsRow}>
            {sections.map((name) => (
              <View key={name} style={styles.statCard}>
                <Text style={styles.statNumber}>{counts[name]}</Text>
                <Text style={styles.statLabel}>{name}</Text>
              </View>
            ))}
          </View>

          {sections.map((name) => {
            const items = rows.filter((row) => row.section === name);
            const meta = SECTION_META[name];
            return (
              <View key={name} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionIcon, name === 'Current' && styles.sectionIconLive]}>
                    <Ionicons name={meta.icon} size={16} color={name === 'Current' ? colors.success : colors.primaryRed} />
                  </View>
                  <View>
                    <Text style={styles.sectionTitle}>{name}</Text>
                    <Text style={styles.sectionSubtitle}>{meta.subtitle}</Text>
                  </View>
                </View>

                {items.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>No {name.toLowerCase()} lessons yet.</Text>
                  </View>
                ) : (
                  items.map((row) => <LessonCard key={`${row.role}-${row.item.id}`} row={row} colors={colors} navigation={navigation} />)
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function LessonCard({
  row,
  colors,
  navigation,
}: {
  row: Row;
  colors: ThemeColors;
  navigation: Props['navigation'];
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const counterpartName = row.role === 'student' ? row.item.tutorName : row.item.studentName;
  const isPast = row.section === 'Past';
  const hasMeet = Boolean(row.item.meetingLink);
  const dotColor = row.section === 'Current' ? colors.success : row.section === 'Past' ? colors.textFaint : colors.primaryRed;

  return (
    <View style={styles.card}>
      <View style={[styles.cardDot, { backgroundColor: dotColor }]} />
      <View style={styles.cardTopRow}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{row.item.category}</Text>
          <Text style={styles.cardSub}>with {counterpartName || 'your tutor'}</Text>
        </View>
        <View style={styles.cardWhen}>
          <View style={styles.cardWhenTopRow}>
            <Text style={styles.cardDate}>{formatDate(row.item.scheduledAt!)}</Text>
            {row.section === 'Upcoming' ? <View style={styles.glowDot} /> : null}
          </View>
          <Text style={styles.cardTime}>{formatTime(row.item.scheduledAt!)}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        {hasMeet && !isPast ? (
          <Pressable style={styles.meetBtn} onPress={() => navigation.navigate('MeetingWebView', { url: row.item.meetingLink! })}>
            <Ionicons name="videocam" size={14} color={colors.onPrimary} />
            <Text style={styles.meetBtnText}>Join Google Meet</Text>
          </Pressable>
        ) : (
          <Text style={styles.meetHint}>
            {isPast ? 'Lesson history: link is no longer active.' : "Meeting link will appear once your tutor schedules it."}
          </Text>
        )}
        <Text
          style={styles.messageLink}
          onPress={() => navigation.navigate('Chat', {
            assignmentId: row.item.id,
            name: counterpartName || 'your tutor',
            photoUrl: (row.role === 'student' ? row.item.tutorPhotoUrl : row.item.studentPhotoUrl) || null,
          })}
        >
          Message
        </Text>
      </View>
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
    },
    title: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text },
    headerSpacer: { width: 36 },
    content: { paddingHorizontal: 20, paddingBottom: 30 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    statNumber: { fontSize: 22, fontFamily: fonts.displayBlack, color: colors.text },
    statLabel: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    section: { marginBottom: 24 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    sectionIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionIconLive: { backgroundColor: 'rgba(16,185,129,0.12)' },
    sectionTitle: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text },
    sectionSubtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 1 },
    emptyCard: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      borderRadius: 14,
      paddingVertical: 22,
      alignItems: 'center',
    },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
      paddingLeft: 18,
      marginBottom: 10,
      overflow: 'hidden',
    },
    cardDot: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    cardInfo: { flex: 1 },
    cardTitle: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text },
    cardSub: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    cardWhen: { alignItems: 'flex-end' },
    cardWhenTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    glowDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.success,
      shadowColor: colors.success,
      shadowOpacity: 0.9,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    },
    cardDate: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    cardTime: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 1 },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    meetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primaryRed,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    meetBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    meetHint: { flex: 1, fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint },
    messageLink: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.textSoft },
  });
}

import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import * as adminApi from '../../api/admin';
import type { AdminChatActivityRow, AdminLessonActivityRow } from '../../api/admin';
import { ApiError } from '../../api/client';
import AdminRegionFilter from '../../components/AdminRegionFilter';
import BackButton from '../../components/BackButton';
import { useAdminIdentity } from '../../hooks/useAdminIdentity';
import type { AdminMoreStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<AdminMoreStackParamList, 'AdminActivity'>;
type Tab = 'lessons' | 'chat';

// Read-only platform-wide logs - the two Activity & Flags cards that
// aren't moderation queues (flagged accounts and reports live in
// Applicants & Users instead, since they're "review/moderate someone,"
// not a log).
export default function AdminActivityScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isPrimary, countryName } = useAdminIdentity();
  const [tab, setTab] = useState<Tab>('lessons');
  const [regions, setRegions] = useState<string | undefined>(undefined);
  const [lessons, setLessons] = useState<AdminLessonActivityRow[]>([]);
  const [messages, setMessages] = useState<AdminChatActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A real Country Admin's region param is ignored server-side anyway (see
  // resolveRegionFilter) - a Main Admin previewing that view has no such
  // lock, so previewing has to explicitly ask for its own country's slice.
  const effectiveRegions = isPrimary ? regions : countryName || undefined;

  useEffect(() => {
    setLoading(true);
    Promise.all([adminApi.fetchAdminActivity(effectiveRegions), adminApi.fetchAdminChatActivity(effectiveRegions)])
      .then(([a, c]) => {
        setLessons(a.sessions);
        setMessages(c.messages);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load activity.'))
      .finally(() => setLoading(false));
  }, [effectiveRegions]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Activity & Flags</Text>
        <View style={{ width: 42 }} />
      </View>
      <View style={styles.tabsRow}>
        <Pressable style={[styles.tab, tab === 'lessons' && styles.tabActive]} onPress={() => setTab('lessons')}>
          <Text style={[styles.tabText, tab === 'lessons' && styles.tabTextActive]}>Lesson Activity</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'chat' && styles.tabActive]} onPress={() => setTab('chat')}>
          <Text style={[styles.tabText, tab === 'chat' && styles.tabTextActive]}>Chat Activity</Text>
        </Pressable>
      </View>
      <AdminRegionFilter onChange={setRegions} />
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {tab === 'lessons' ? (
            lessons.length === 0 ? (
              <Text style={styles.emptyText}>No lessons logged yet.</Text>
            ) : (
              lessons.map((row, i) => (
                <View key={i} style={[styles.row, i > 0 && styles.divider]}>
                  <Text style={styles.rowTitle}>{row.category} · {row.lessonType}</Text>
                  <Text style={styles.rowMeta}>{row.tutorName} → {row.studentName}</Text>
                  <Text style={styles.rowMeta}>{new Date(row.loggedAt).toLocaleString()}{row.totalUsd ? ` · $${row.totalUsd.toFixed(2)}` : ''}</Text>
                </View>
              ))
            )
          ) : messages.length === 0 ? (
            <Text style={styles.emptyText}>No messages yet.</Text>
          ) : (
            messages.slice(0, 200).map((row, i) => (
              <View key={i} style={[styles.row, i > 0 && styles.divider]}>
                <Text style={styles.rowTitle}>{row.category} · {row.tutorName} / {row.studentName}</Text>
                <Text style={styles.rowMeta} numberOfLines={2}>{row.text}</Text>
                <Text style={styles.rowMeta}>{new Date(row.createdAt).toLocaleString()}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, gap: 10 },
    title: { flex: 1, fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center' },
    tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
    tab: { flex: 1, borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, alignItems: 'center' },
    tabActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    tabText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
    tabTextActive: { color: colors.onPrimary },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center', marginTop: 20 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', marginTop: 20 },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    row: { paddingVertical: 12 },
    divider: { borderTopWidth: 1, borderTopColor: colors.border },
    rowTitle: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    rowMeta: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
  });
}

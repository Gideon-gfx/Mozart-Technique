import { FlatList } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../../api/client';
import * as organizationsApi from '../../api/organizations';
import type { OrgRosterMember } from '../../api/organizations';
import Avatar from '../../components/Avatar';
import BackButton from '../../components/BackButton';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useToast } from '../../context/ToastContext';
import type { SponsorTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<SponsorTabParamList, 'Students'>;

interface StudentRow extends OrgRosterMember {
  code: string | null;
  redeemedAt: string | null;
}

// The Sponsor tab's roster - every student who redeemed one of this
// account's sponsor codes (mirrors ngo-dashboard.html's Classroom tab,
// students side only - sponsors don't have tutors of their own). Same
// long-press shape as the Org Tutor Students tab: Message opens (creating
// if needed) the org's real 1:1 org-chat thread with that student, since a
// sponsor has no per-assignment lesson chat with them. Each row's own code
// and redemption date (from fetchMySponsorOrg's studentCodes, joined by
// redeemedBy) surface on the right, so a sponsor can tell at a glance which
// code brought in which student and when.
export default function SponsorStudentsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { actionSheet, confirm, toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);

  const load = useCallback(() => {
    return Promise.all([organizationsApi.fetchOrgMembers(), organizationsApi.fetchMySponsorOrg()])
      .then(([memberData, sponsorData]) => {
        const codeByStudentId = new Map(
          sponsorData.organization.studentCodes.filter((entry) => entry.redeemedBy != null).map((entry) => [Number(entry.redeemedBy), entry]),
        );
        const rows = memberData.students.map((member) => {
          const entry = codeByStudentId.get(member.id);
          return { ...member, code: entry?.code || null, redeemedAt: entry?.redeemedAt || null };
        });
        setStudents(rows.sort((a, b) => a.name.localeCompare(b.name)));
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your sponsored students.'));
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function openChat(student: StudentRow) {
    try {
      const { conversation } = await organizationsApi.openOrgConversation(student.id, 'student', student.name);
      navigation.getParent()?.navigate('OrgChat', { conversationId: conversation.id, title: student.name, photoUrl: resolveMediaUrl(student.photoUrl) });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not open that chat.', 'error');
    }
  }

  async function removeStudent(student: StudentRow) {
    const ok = await confirm({
      title: 'Remove student?',
      message: `${student.name} will no longer be linked to your sponsorship. This can't be undone.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await organizationsApi.removeOrgMember(student.id);
      toast(`Removed ${student.name}.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not remove that student.', 'error');
    }
  }

  function onLongPressStudent(student: StudentRow) {
    actionSheet({
      title: student.name,
      actions: [
        { label: 'Message', onPress: () => openChat(student) },
        { label: 'View profile', onPress: () => navigation.getParent()?.navigate('CounterpartProfile', { type: 'student', id: student.id }) },
        { label: 'Remove student', destructive: true, onPress: () => removeStudent(student) },
      ],
    });
  }

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View style={styles.header}>
        <BackButton onPress={() => navigation.navigate('Sponsor')} />
        <Text style={styles.title} numberOfLines={1}>Sponsored Students</Text>
        <View style={{ width: 42 }} />
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
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="people-outline" size={28} color={colors.textFaint} />
              <Text style={styles.emptyText}>No one has redeemed a sponsor code yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.getParent()?.navigate('CounterpartProfile', { type: 'student', id: item.id })}
              onLongPress={() => onLongPressStudent(item)}
            >
              <Avatar name={item.name} photoUrl={resolveMediaUrl(item.photoUrl)} size={46} viewable={false} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>{item.email}</Text>
              </View>
              {item.code ? (
                <View style={styles.codeInfo}>
                  <Text style={styles.codeInfoCode}>{item.code}</Text>
                  <Text style={styles.codeInfoDate}>{item.redeemedAt ? new Date(item.redeemedAt).toLocaleDateString() : ''}</Text>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      )}
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
    title: { flex: 1, fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center' },
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
    codeInfo: { alignItems: 'flex-end' },
    codeInfoCode: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed, letterSpacing: 0.4 },
    codeInfoDate: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
  });
}

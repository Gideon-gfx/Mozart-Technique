import { FlatList } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../../api/client';
import * as organizationsApi from '../../api/organizations';
import type { SponsorCodeEntry } from '../../api/organizations';
import BackButton from '../../components/BackButton';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../context/ToastContext';
import type { MainStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'AccessCodes'>;

// Its own full screen (not a bottom sheet) - mirrors ngo-dashboard.html's
// Access Codes tab exactly: a role picker, recipient name/email, Generate
// and Invite-by-Gmail actions with the new code shown and copyable, and the
// full issued-codes list below.
export default function AccessCodesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { toast, confirm } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [role, setRole] = useState<'student' | 'tutor'>('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [newCode, setNewCode] = useState('');
  const [generating, setGenerating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [codes, setCodes] = useState<SponsorCodeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState('');

  const load = useCallback(() => {
    return organizationsApi
      .fetchSponsorCodes()
      .then((data) => setCodes([...data.students, ...data.tutors]))
      .catch(() => toast('Could not load your codes.', 'error'));
  }, [toast]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function generate() {
    setGenerating(true);
    try {
      const result = await organizationsApi.generateSponsorCode(role);
      setNewCode(result.entry.code);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not generate a code.', 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function copyCode() {
    if (!newCode) return;
    await Clipboard.setStringAsync(newCode);
    toast('Code copied.', 'success');
  }

  async function inviteByGmail() {
    if (!email.trim()) {
      toast('Enter the invitee Gmail address.', 'error');
      return;
    }
    setInviting(true);
    try {
      const result = await organizationsApi.inviteOrgMember(email.trim(), role);
      setOrganizationName(result.organizationName);
      const subject = encodeURIComponent(`${result.organizationName || 'Mozart Techniques'} invitation`);
      const body = encodeURIComponent(
        `Hello${name.trim() ? ` ${name.trim()}` : ''},\n\nYou have been invited to join ${result.organizationName || 'our organization'} on Mozart Techniques as a ${role}.\n\nRedeem code: ${result.code}\nOpen this link to redeem: ${result.redeemLink}\n\nThank you.`,
      );
      const composeUrl = `https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=1&to=${encodeURIComponent(email.trim())}&su=${subject}&body=${body}`;
      await Linking.openURL(composeUrl);
      setNewCode(result.code);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not create that invitation.', 'error');
    } finally {
      setInviting(false);
    }
  }

  async function removeCode(code: string) {
    const ok = await confirm({ title: 'Delete this code?', message: 'This can\'t be undone.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    setDeletingCode(code);
    try {
      await organizationsApi.deleteSponsorCode(code);
      setCodes((prev) => prev.filter((c) => c.code !== code));
      toast('Code deleted.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete that code.', 'error');
    } finally {
      setDeletingCode(null);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Access Codes</Text>
        <View style={{ width: 42 }} />
      </View>

      <FlatList
        data={[...codes].reverse()}
        keyExtractor={(c) => c.code}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Text style={styles.subtitle}>Generate one unique code for each student or tutor you add.</Text>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>Create a code</Text>
              <View style={styles.roleRow}>
                <Pressable style={[styles.roleChip, role === 'student' && styles.roleChipActive]} onPress={() => setRole('student')}>
                  <Text style={[styles.roleChipText, role === 'student' && styles.roleChipTextActive]}>Student</Text>
                </Pressable>
                <Pressable style={[styles.roleChip, role === 'tutor' && styles.roleChipActive]} onPress={() => setRole('tutor')}>
                  <Text style={[styles.roleChipText, role === 'tutor' && styles.roleChipTextActive]}>Tutor</Text>
                </Pressable>
              </View>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Person's name" placeholderTextColor={colors.textFaint} />
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Person's email (optional)" placeholderTextColor={colors.textFaint} autoCapitalize="none" keyboardType="email-address" />
              <PrimaryButton title="Generate unique code" onPress={generate} loading={generating} style={{ marginTop: 12 }} />
              <Pressable style={styles.inviteBtn} onPress={inviteByGmail} disabled={inviting}>
                {inviting ? <ActivityIndicator size="small" color={colors.text} /> : (
                  <>
                    <Ionicons name="mail-outline" size={15} color={colors.text} />
                    <Text style={styles.inviteBtnText}>Invite user by Gmail</Text>
                  </>
                )}
              </Pressable>
              {newCode ? (
                <View style={styles.newCodeRow}>
                  <Text style={styles.newCodeValue} numberOfLines={1}>{newCode}</Text>
                  <Pressable style={styles.copyBtn} onPress={copyCode}>
                    <Ionicons name="copy-outline" size={14} color={colors.text} />
                    <Text style={styles.copyBtnText}>Copy</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <Text style={styles.sectionTitle}>Issued codes</Text>
            {loading ? <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 12 }} /> : null}
          </>
        }
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No codes generated yet.</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.codeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.codeText}>{item.code}</Text>
              <Text style={styles.codeMeta}>
                {item.role === 'tutor' ? 'Tutor' : 'Student'} · {item.redeemedAt ? item.redeemedName || item.studentName || 'Redeemed' : 'Unused'} · {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <View style={[styles.badge, item.redeemedAt ? styles.badgeActive : styles.badgePending]}>
              <Text style={[styles.badgeText, item.redeemedAt ? styles.badgeTextActive : styles.badgeTextPending]}>{item.redeemedAt ? 'Used' : 'Unused'}</Text>
            </View>
            <Pressable style={styles.deleteBtn} onPress={() => removeCode(item.code)} disabled={deletingCode === item.code} hitSlop={6}>
              {deletingCode === item.code ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="trash" size={16} color={colors.danger} />}
            </Pressable>
          </View>
        )}
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
    title: { flex: 1, fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center' },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    subtitle: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginBottom: 16 },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
    },
    cardLabel: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 },
    roleRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    roleChip: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.background },
    roleChipActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    roleChipText: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    roleChipTextActive: { color: colors.onPrimary },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
      marginBottom: 10,
    },
    inviteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: 12,
      marginTop: 10,
    },
    inviteBtnText: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    newCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
    newCodeValue: { flex: 1, fontSize: 18, fontFamily: fonts.displayBlack, color: colors.primaryRed, letterSpacing: 1 },
    copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    copyBtnText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text },
    sectionTitle: { fontSize: 15, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 12 },
    emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', paddingVertical: 20 },
    codeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    codeText: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    codeMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    badgeActive: { backgroundColor: colors.statusActiveBg },
    badgePending: { backgroundColor: colors.statusPendingBg },
    badgeText: { fontSize: 10.5, fontFamily: fonts.bodyBold },
    badgeTextActive: { color: colors.statusActiveText },
    badgeTextPending: { color: colors.statusPendingText },
    deleteBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: `${colors.danger}12`, alignItems: 'center', justifyContent: 'center' },
  });
}

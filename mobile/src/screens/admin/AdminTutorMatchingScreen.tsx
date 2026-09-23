import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, Text, View } from 'react-native';

import * as adminApi from '../../api/admin';
import type { AdminTutorRequestRow, AdminTutorRow } from '../../api/admin';
import { ApiError, resolveMediaUrl } from '../../api/client';
import AdminHeader from '../../components/AdminHeader';
import CollapsibleSidebar from '../../components/CollapsibleSidebar';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useToast } from '../../context/ToastContext';
import type { AdminTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<AdminTabParamList, 'TutorMatching'>;
type Section = 'applications' | 'requests';

const SECTIONS: { key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'applications', label: 'Tutor Applications', icon: 'document-text-outline' },
  { key: 'requests', label: 'Student Matching', icon: 'git-compare-outline' },
];

// Every "admin mediates a match" flow - mirrors admin.html's Tutors &
// Matching tab (tutor applications + student-request matching, its two
// tables), folded into one tab with a sidebar since they're the same shape
// of work. Marketplace oversight moved out to More - it's a storefront
// concern, grouped there with Store Products/Orders instead.
export default function AdminTutorMatchingScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [section, setSection] = useState<Section>('applications');

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <AdminHeader
        title="Tutor Matching"
        onBack={() => navigation.navigate('Analytics')}
        onNotifications={() => navigation.getParent()?.navigate('Notifications')}
        onProfile={() => navigation.getParent()?.navigate('Profile')}
      />
      <CollapsibleSidebar sections={SECTIONS} activeKey={section} onSelect={(key) => setSection(key as Section)}>
        <View style={styles.content}>
          {section === 'applications' ? <TutorApplicationsSection colors={colors} /> : <StudentMatchingSection colors={colors} />}
        </View>
      </CollapsibleSidebar>
    </View>
  );
}

function SectionScroll({ children, colors }: { children: React.ReactNode; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <ScrollView contentContainerStyle={styles.sectionContent} showsVerticalScrollIndicator={false}>{children}</ScrollView>;
}

function TutorApplicationsSection({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast, confirm } = useToast();
  const [tutorsList, setTutorsList] = useState<AdminTutorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    return adminApi
      .fetchAdminTutors()
      .then((res) => setTutorsList(res.tutors))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load tutors.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function setStatus(t: AdminTutorRow, status: 'approved' | 'rejected') {
    setBusyId(t.id);
    try {
      await adminApi.setTutorStatus(t.id, status);
      toast(`${t.name} ${status}.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update that tutor.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function expel(t: AdminTutorRow) {
    const ok = await confirm({ title: 'Expel tutor?', message: `${t.name} will be removed from all active lessons.`, confirmLabel: 'Expel', destructive: true });
    if (!ok) return;
    setBusyId(t.id);
    try {
      await adminApi.expelTutor(t.id);
      toast('Tutor expelled.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not expel that tutor.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionHeading}>Tutor Applications</Text>
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : tutorsList.length === 0 ? (
        <Text style={styles.emptyText}>No tutor applications yet.</Text>
      ) : (
        <SectionScroll colors={colors}>
          {tutorsList.map((t, i) => {
            const avg = t.ratingCount ? (t.ratingSum || 0) / t.ratingCount : null;
            const avgProf = t.professionalismCount ? (t.professionalismSum || 0) / t.professionalismCount : null;
            const tags = [t.categories?.join(', '), t.genres?.join(', '), t.ageGroups?.join(', ')].filter(Boolean).join(' · ');
            const venueLabel = t.inPersonVenue === 'student_location' ? 'Travels to student' : t.inPersonVenue === 'tutor_studio' ? 'At tutor studio' : t.inPersonVenue === 'either' ? 'Either venue' : null;
            const levelEntries = Object.entries(t.approvedLevelByCategory || {});
            return (
              <View key={t.id} style={[styles.rowCard, styles.rowCardColumn, i > 0 && { marginTop: 10 }]}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{t.name}</Text>
                  <View style={[styles.badge, t.status === 'approved' ? styles.badgeActive : t.status === 'rejected' ? styles.badgeDanger : styles.badgePending]}>
                    <Text style={[styles.badgeText, t.status === 'approved' ? styles.badgeTextActive : t.status === 'rejected' ? styles.badgeTextDanger : styles.badgeTextPending]}>{t.status}</Text>
                  </View>
                </View>
                <Text style={styles.rowMeta}>{t.email || ''}{t.phone ? ` · ${t.phone}` : ''}</Text>
                {(t.flagged || t.expelled) ? (
                  <Text style={[styles.rowMeta, styles.warnText]}>{[t.flagged && 'Flagged', t.expelled && 'Expelled'].filter(Boolean).join(' · ')}</Text>
                ) : null}
                {tags ? <Text style={styles.rowMeta}>{tags}</Text> : null}
                <Text style={styles.rowMeta}>
                  {t.city || ''}{t.city && t.teachesOnline ? ' + ' : ''}{t.teachesOnline ? 'Online' : ''}
                  {!t.city && !t.teachesOnline ? 'Location unknown' : ''}
                </Text>
                {t.fullAddress || t.address ? <Text style={styles.rowMeta}>{t.fullAddress || t.address}</Text> : null}
                {t.commuteRadiusKm ? <Text style={styles.rowMeta}>{t.commuteRadiusKm}km radius{venueLabel ? `, ${venueLabel}` : ''}</Text> : null}
                <Text style={styles.rowMeta}>${t.hourlyRateUsd?.toFixed(2) || '0.00'}/hr · Wallet ${(t.balanceUsd || 0).toFixed(2)}</Text>
                <Text style={styles.rowMeta}>
                  {t.stripeConnectAccountId ? `Stripe ${t.stripeConnectPayoutsEnabled ? 'ready' : 'setup pending'}` : 'Stripe not connected'}
                </Text>
                {levelEntries.length ? (
                  <Text style={styles.rowMeta}>{levelEntries.map(([cat, lvl]) => `${cat}: ${lvl}`).join(' · ')}</Text>
                ) : null}
                <Text style={styles.rowMeta}>
                  {avg ? `${avg.toFixed(1)}★ (${t.ratingCount})` : 'No ratings'}{avgProf ? ` · Prof. ${avgProf.toFixed(1)}` : ''}
                  {' · '}{t.orientationCompleted ? 'Orientation done' : 'Orientation pending'}
                </Text>
                {t.certificateUrl ? (
                  <Pressable onPress={() => Linking.openURL(resolveMediaUrl(t.certificateUrl)!)}>
                    <Text style={styles.linkText}>View certificate</Text>
                  </Pressable>
                ) : null}
                <View style={styles.actionsRow}>
                  {t.status !== 'approved' ? (
                    <Pressable style={styles.actionBtn} onPress={() => setStatus(t, 'approved')} disabled={busyId === t.id}>
                      <Text style={styles.actionBtnText}>Approve</Text>
                    </Pressable>
                  ) : null}
                  {t.status !== 'rejected' ? (
                    <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => setStatus(t, 'rejected')} disabled={busyId === t.id}>
                      <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Reject</Text>
                    </Pressable>
                  ) : null}
                  {!t.expelled ? (
                    <Pressable style={styles.deleteIconBtn} onPress={() => expel(t)} disabled={busyId === t.id}>
                      {busyId === t.id ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="close-circle-outline" size={18} color={colors.danger} />}
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </SectionScroll>
      )}
    </View>
  );
}

function StudentMatchingSection({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [requests, setRequests] = useState<AdminTutorRequestRow[]>([]);
  const [tutorsList, setTutorsList] = useState<AdminTutorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pickerFor, setPickerFor] = useState<AdminTutorRequestRow | null>(null);

  const load = useCallback(() => {
    return Promise.all([adminApi.fetchAdminTutorRequests(), adminApi.fetchAdminTutors()])
      .then(([reqRes, tutorRes]) => {
        setRequests(reqRes.requests);
        setTutorsList(tutorRes.tutors.filter((t) => t.status === 'approved'));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load requests.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function assign(request: AdminTutorRequestRow, tutorId: number) {
    setBusyId(request.id);
    setPickerFor(null);
    try {
      await adminApi.assignTutorRequest(request.id, tutorId);
      toast('Matched.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not assign that tutor.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function end(request: AdminTutorRequestRow) {
    setBusyId(request.id);
    try {
      await adminApi.endTutorRequest(request.id);
      toast('Match ended.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not end that match.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionHeading}>Student Requests & Matching</Text>
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : requests.length === 0 ? (
        <Text style={styles.emptyText}>No requests yet.</Text>
      ) : (
        <SectionScroll colors={colors}>
          {requests.map((r, i) => (
            <View key={r.id} style={[styles.rowCard, styles.rowCardColumn, i > 0 && { marginTop: 10 }]}>
              <View style={styles.cardTopRow}>
                <Text style={styles.rowTitle} numberOfLines={1}>{r.studentName}</Text>
                <View style={[styles.badge, r.status === 'active' ? styles.badgeActive : styles.badgePending]}>
                  <Text style={[styles.badgeText, r.status === 'active' ? styles.badgeTextActive : styles.badgeTextPending]}>{r.status}</Text>
                </View>
              </View>
              <Text style={styles.rowMeta}>{r.studentEmail || ''}{r.phone ? ` · ${r.phone}` : ''}</Text>
              <Text style={styles.rowMeta}>
                {r.category}{r.genre ? ` (${r.genre})` : ''}{r.desiredLevel ? ` · ${r.desiredLevel}` : ''}
              </Text>
              <Text style={styles.rowMeta}>
                {r.lessonType === 'online' ? 'Online' : r.lessonType === 'physical' ? 'In-Person' : r.lessonType === 'studio' ? 'In-Studio' : r.online ? 'Online' : 'In-Person'}
                {r.city ? ` · ${r.city}` : ''}
              </Text>
              {r.notes ? <Text style={styles.rowMeta}>{r.notes}</Text> : null}
              {r.status === 'pending' ? (
                <Pressable style={[styles.actionBtn, { alignSelf: 'flex-start', marginTop: 8 }]} onPress={() => setPickerFor(r)} disabled={busyId === r.id}>
                  <Text style={styles.actionBtnText}>Assign a tutor</Text>
                </Pressable>
              ) : r.status === 'active' ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.rowMeta}>
                    Matched with {r.tutorName}{r.tutorEmail ? ` (${r.tutorEmail})` : ''}{r.tutorPhone ? ` · ${r.tutorPhone}` : ''}
                    {r.matchDistanceKm != null ? ` · ${r.matchDistanceKm}km` : ''}
                  </Text>
                  <Pressable style={[styles.actionBtn, styles.actionBtnSecondary, { alignSelf: 'flex-start', marginTop: 6 }]} onPress={() => end(r)} disabled={busyId === r.id}>
                    {busyId === r.id ? <ActivityIndicator size="small" color={colors.text} /> : <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>End match</Text>}
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </SectionScroll>
      )}

      <Modal visible={!!pickerFor} transparent animationType="slide" onRequestClose={() => setPickerFor(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPickerFor(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Assign a tutor for {pickerFor?.category}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {tutorsList
                .filter((t) => !pickerFor?.category || t.categories.includes(pickerFor.category))
                .slice()
                .sort((a, b) => {
                  const preferredIds = (pickerFor?.preferredTutorIds || []).map(String);
                  const aPreferred = preferredIds.includes(String(a.id)) ? 0 : 1;
                  const bPreferred = preferredIds.includes(String(b.id)) ? 0 : 1;
                  if (aPreferred !== bPreferred) return aPreferred - bPreferred;
                  const targetCity = (pickerFor?.city || '').toLowerCase();
                  const aMatch = targetCity && a.city && a.city.toLowerCase() === targetCity ? 0 : 1;
                  const bMatch = targetCity && b.city && b.city.toLowerCase() === targetCity ? 0 : 1;
                  return aMatch - bMatch;
                })
                .map((t) => {
                  const isPreferred = (pickerFor?.preferredTutorIds || []).map(String).includes(String(t.id));
                  return (
                    <Pressable key={t.id} style={styles.tutorPickRow} onPress={() => pickerFor && assign(pickerFor, t.id)}>
                      <Text style={styles.rowTitle}>{isPreferred ? '★ ' : ''}{t.name}</Text>
                      <Text style={styles.rowMeta}>{t.city || 'Unknown'}{t.teachesOnline ? ' · Online' : ''}</Text>
                    </Pressable>
                  );
                })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12 },
    title: { fontSize: 20, fontFamily: fonts.displayBlack, color: colors.text },
    shell: { flex: 1, flexDirection: 'row' },
    sidebar: { flexGrow: 0, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border },
    sidebarOpen: { width: 160 },
    sidebarClosed: { width: 60 },
    sidebarToggle: { alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    sidebarContent: { paddingVertical: 10, paddingHorizontal: 8, gap: 6 },
    sidebarItem: { alignItems: 'center', gap: 6, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 6 },
    sidebarItemOpen: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 12 },
    sidebarItemActive: { backgroundColor: colors.primaryRed },
    sidebarItemText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center', lineHeight: 15, flexShrink: 1 },
    sidebarItemTextActive: { color: colors.onPrimary },
    content: { flex: 1, padding: 16 },
    sectionContent: { paddingBottom: 30 },
    sectionHeading: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 8 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center', marginTop: 20 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginBottom: 8 },
    rowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
    },
    rowCardColumn: { flexDirection: 'column', alignItems: 'stretch' },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
    rowTitle: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text, flexShrink: 1 },
    rowMeta: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    badgeActive: { backgroundColor: colors.statusActiveBg },
    badgePending: { backgroundColor: colors.statusPendingBg },
    badgeDanger: { backgroundColor: `${colors.danger}18` },
    badgeText: { fontSize: 10, fontFamily: fonts.bodyBold, textTransform: 'capitalize' },
    badgeTextActive: { color: colors.statusActiveText },
    badgeTextPending: { color: colors.statusPendingText },
    badgeTextDanger: { color: colors.danger },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    actionBtn: { backgroundColor: colors.primaryRed, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    actionBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    actionBtnSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    actionBtnTextSecondary: { color: colors.text },
    deleteIconBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: `${colors.danger}12`, alignItems: 'center', justifyContent: 'center' },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 15, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    tutorPickRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
    warnText: { color: colors.danger, fontFamily: fonts.bodySemiBold },
    linkText: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.primaryRed, marginTop: 2, textDecorationLine: 'underline' },
  });
}

import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, StyleSheet, Text, View } from 'react-native';

import * as authApi from '../../api/auth';
import * as calendarApi from '../../api/calendar';
import { API_BASE_URL, ApiError, resolveMediaUrl } from '../../api/client';
import * as tutorsApi from '../../api/tutors';
import type { PendingTutorRequest } from '../../api/tutors';
import type { AssignmentSummary } from '../../api/types';
import AccessCodeModal from '../../components/AccessCodeModal';
import Avatar from '../../components/Avatar';
import NotificationBell from '../../components/NotificationBell';
import CountryFlag from '../../components/CountryFlag';
import LiveClock from '../../components/LiveClock';
import MonthCalendar from '../../components/MonthCalendar';
import PayoutSheet from '../../components/PayoutSheet';
import RoleStatusBanner from '../../components/RoleStatusBanner';
import ScheduleLessonSheet from '../../components/ScheduleLessonSheet';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { TutorTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<TutorTabParamList, 'Tutor'>;

function formatWhen(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const dateLabel = sameDay ? 'Today' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return { dateLabel, timeLabel };
}

// The tutor-mode Home tab - mirrors the "Tutor Workspace" mockup: next-
// lesson hero, Students/Wallet/Rating KPIs, incoming direct requests
// (real accept action), a calendar entry point, and quick tools. Real
// /api/my-assignments + /api/tutors/me* data throughout, same as every
// other screen in this app.
export default function TutorDashboardScreen({ navigation }: Props) {
  const { user, refresh: refreshSession } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [asTutor, setAsTutor] = useState<AssignmentSummary[]>([]);
  const [profile, setProfile] = useState<tutorsApi.MyTutorProfile | null>(null);
  const [requests, setRequests] = useState<PendingTutorRequest[]>([]);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [accessCodeOpen, setAccessCodeOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [assignmentsData, profileData, requestsData, calStatus] = await Promise.all([
        authApi.fetchMyAssignments(),
        tutorsApi.fetchMyTutorProfile(),
        tutorsApi.fetchPendingTutorRequests().catch(() => ({ requests: [] as PendingTutorRequest[] })),
        calendarApi.fetchCalendarStatus().catch(() => ({ connected: false })),
      ]);
      setAsTutor(assignmentsData.asTutor || []);
      setProfile(profileData.profile);
      setRequests(requestsData.requests);
      setCalendarConnected(calStatus.connected);
    } catch {
      toast('Could not load your tutor dashboard. Pull to refresh to try again.', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Gates the dashboard behind the mandatory Tutor Orientation modal the
  // first time it's reachable - re-checked on every focus (not just once
  // on mount), so a swipe back into this tab re-triggers it if it somehow
  // wasn't completed. Tutor is a direct tab screen (not nested in its own
  // stack the way Store is), so one getParent() hop reaches MainStack,
  // where TutorOrientation is registered.
  useFocusEffect(useCallback(() => {
    if (user?.needsTutorOrientation) {
      navigation.getParent()?.navigate('TutorOrientation');
    }
  }, [user?.needsTutorOrientation, navigation]));

  async function onRefresh() {
    setRefreshing(true);
    // Also re-checks the session, since that's where tutorStatus/
    // hasSponsorAccess/etc. live - without this a role-application decision
    // or a redeemed access code never shows up (e.g. in Profile's menu)
    // until the app is fully restarted, because load() above only
    // re-fetches assignments/profile/requests.
    await Promise.all([load(), refreshSession().catch(() => {})]);
    setRefreshing(false);
  }

  async function acceptRequest(request: PendingTutorRequest) {
    try {
      await tutorsApi.acceptPendingTutorRequest(request.id);
      toast(`Accepted ${request.studentName}'s request.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not accept that request.', 'error');
    }
  }

  const [scheduleOpen, setScheduleOpen] = useState(false);

  const activeLessons = asTutor.filter((item) => item.status === 'active');
  const studentCount = new Set(activeLessons.map((item) => item.studentId).filter(Boolean)).size;
  const nextLesson = activeLessons
    .filter((item) => item.scheduledAt && new Date(item.scheduledAt).getTime() > Date.now())
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0];

  const avgRating = profile && profile.ratingCount ? profile.ratingSum / profile.ratingCount : null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primaryRed} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryRed} />}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Tutor Workspace</Text>
              <View style={styles.subtitleRow}>
                <Text style={styles.subtitle}>{profile?.name || user?.name}</Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{profile?.status === 'approved' ? 'Approved' : profile?.status}</Text>
                </View>
                <CountryFlag />
              </View>
            </View>
            <LiveClock colors={colors} />
          </View>
          <View style={styles.headerRight}>
            <Pressable style={styles.iconBtn} onPress={() => navigation.getParent()?.navigate('Notifications')} hitSlop={10}>
              <NotificationBell size={20} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => navigation.getParent()?.navigate('Profile')} hitSlop={10}>
              <Avatar name={profile?.name || user?.name || '?'} photoUrl={profile?.photoUrl || user?.photoUrl} size={44} viewable={false} />
            </Pressable>
          </View>
        </View>

        <LinearGradient colors={colors.primaryGradient} style={styles.hero}>
          {nextLesson ? (
            (() => {
              const { dateLabel, timeLabel } = formatWhen(nextLesson.scheduledAt!);
              return (
                <View style={styles.heroRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.heroPill}>
                      <Text style={styles.heroPillText}>{dateLabel}</Text>
                    </View>
                    <Text style={styles.heroTitle}>{nextLesson.category} lesson</Text>
                    <Text style={styles.heroMeta}>{nextLesson.studentName} · {timeLabel} · {nextLesson.durationMinutes || 60} min</Text>
                  </View>
                  <Pressable
                    style={styles.heroBtn}
                    onPress={() => {
                      if (nextLesson.meetingLink) navigation.getParent()?.navigate('MeetingWebView', { url: nextLesson.meetingLink });
                      else navigation.getParent()?.navigate('Chat', { assignmentId: nextLesson.id, name: nextLesson.studentName || 'Student', photoUrl: nextLesson.studentPhotoUrl ?? null });
                    }}
                  >
                    <Text style={styles.heroBtnText}>{nextLesson.meetingLink ? 'Start' : 'Open chat'}</Text>
                  </Pressable>
                </View>
              );
            })()
          ) : (
            <>
              <Text style={styles.heroTitle}>No upcoming lessons scheduled</Text>
              <Text style={styles.heroMeta}>Accept a request below or check your calendar.</Text>
            </>
          )}
        </LinearGradient>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{studentCount}</Text>
            <Text style={styles.kpiLabel}>Students</Text>
          </View>
          <Pressable style={styles.kpiCard} onPress={() => setPayoutOpen(true)}>
            <Text style={styles.kpiValue}>${(profile?.balanceUsd || 0).toFixed(0)}</Text>
            <Text style={styles.kpiLabel}>Wallet</Text>
          </Pressable>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{avgRating ? avgRating.toFixed(1) : '—'}</Text>
            <Text style={styles.kpiLabel}>Rating</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Requests</Text>
            {requests.length ? (
              <View style={styles.newPill}>
                <Text style={styles.newPillText}>{requests.length} new</Text>
              </View>
            ) : null}
          </View>
          {requests.length === 0 ? (
            <Text style={styles.emptyText}>No pending requests right now.</Text>
          ) : (
            <View style={styles.list}>
              {requests.map((request, i) => {
                const photo = resolveMediaUrl(request.studentPhotoUrl);
                return (
                  <View key={request.id} style={[styles.listItem, i > 0 && styles.listItemDivider]}>
                    <Avatar name={request.studentName} photoUrl={photo} size={38} viewable={false} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listItemName}>{request.studentName}</Text>
                      <Text style={styles.listItemMeta}>
                        {request.category} · {request.desiredLevel || 'Any level'} · {request.lessonType === 'online' ? 'Online' : request.lessonType === 'studio' ? 'At my studio' : 'In-person'}
                      </Text>
                    </View>
                    <Pressable style={styles.acceptBtn} onPress={() => acceptRequest(request)}>
                      <Text style={styles.acceptBtnText}>Accept</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Calendar</Text>
            <Pressable
              style={styles.ghostBtn}
              onPress={() => (calendarConnected ? toast('Google Calendar is connected.', 'success') : Linking.openURL(`${API_BASE_URL}/api/calendar/connect`))}
            >
              <Text style={styles.ghostBtnText}>{calendarConnected ? 'Connected' : 'Connect Google'}</Text>
            </Pressable>
          </View>
          <MonthCalendar lessons={activeLessons} colors={colors} />
          <Pressable style={styles.calendarPreview} onPress={() => navigation.getParent()?.navigate('Schedule')}>
            <Ionicons name="calendar-outline" size={16} color={colors.primaryRed} />
            <Text style={styles.calendarPreviewText}>View all your schedules</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        </View>

        {user ? <RoleStatusBanner userId={user.id} tutorStatus={user.tutorStatus} performerStatus={user.performerStatus} sponsorStatus={user.sponsorOrgStatus} /> : null}

        <Text style={styles.sectionTitle}>Quick tools</Text>
        <View style={styles.toolsGrid}>
          <Pressable style={styles.toolCard} onPress={() => setScheduleOpen(true)}>
            <View style={styles.toolIcon}>
              <Ionicons name="calendar" size={19} color={colors.primaryRed} />
            </View>
            <Text style={styles.toolTitle}>Schedule lesson</Text>
            <Text style={styles.toolSubtitle}>Pick a student & time</Text>
          </Pressable>
          <Pressable
            style={styles.toolCard}
            onPress={() => navigation.getParent()?.navigate('MyLibrary')}
          >
            <View style={styles.toolIcon}>
              <Ionicons name="folder-open" size={19} color={colors.primaryRed} />
            </View>
            <Text style={styles.toolTitle}>My Library</Text>
            <Text style={styles.toolSubtitle}>Your own uploads</Text>
          </Pressable>
          <Pressable style={styles.toolCard} onPress={() => navigation.getParent()?.navigate('Library')}>
            <View style={styles.toolIcon}>
              <Ionicons name="search" size={19} color={colors.primaryRed} />
            </View>
            <Text style={styles.toolTitle}>Search Mozart's library</Text>
            <Text style={styles.toolSubtitle}>Shared technique clips</Text>
          </Pressable>
          <Pressable style={styles.toolCard} onPress={() => setAccessCodeOpen(true)}>
            <View style={styles.toolIcon}>
              <Ionicons name="key" size={19} color={colors.primaryRed} />
            </View>
            <Text style={styles.toolTitle}>Access Code</Text>
            <Text style={styles.toolSubtitle}>Redeem a code</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.profileToolCard}
          onPress={() => profile && navigation.getParent()?.navigate('CounterpartProfile', { type: 'tutor', id: profile.id })}
        >
          <View style={[styles.toolIcon, { marginBottom: 0 }]}>
            <Ionicons name="person" size={19} color={colors.primaryRed} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.toolTitle}>My Profile</Text>
            <Text style={styles.toolSubtitle}>Courses, rate & bio</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>
      </ScrollView>

      <PayoutSheet visible={payoutOpen} onClose={() => setPayoutOpen(false)} colors={colors} balanceUsd={profile?.balanceUsd || 0} />
      <ScheduleLessonSheet
        visible={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        colors={colors}
        students={activeLessons}
        calendarConnected={calendarConnected}
        onScheduled={load}
      />
      <AccessCodeModal visible={accessCodeOpen} onClose={() => setAccessCodeOpen(false)} colors={colors} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 10 },
    titleRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    title: { fontSize: 19, fontFamily: fonts.displayBlack, color: colors.text },
    subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
    subtitle: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    statusPill: { backgroundColor: colors.statusActiveBg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
    statusPillText: { fontSize: 10.5, fontFamily: fonts.bodyBold, color: colors.statusActiveText, textTransform: 'capitalize' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    hero: { borderRadius: 18, padding: 16, marginBottom: 16 },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    heroPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
    heroPillText: { color: '#fff', fontSize: 11, fontFamily: fonts.bodyBold },
    heroTitle: { color: '#fff', fontSize: 17, fontFamily: fonts.displayBlack },
    heroMeta: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontFamily: fonts.body, marginTop: 4 },
    heroBtn: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
    heroBtnText: { color: colors.primaryRed, fontSize: 12.5, fontFamily: fonts.bodyBold },
    kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    kpiCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      alignItems: 'center',
    },
    kpiValue: { fontSize: 19, fontFamily: fonts.displayBlack, color: colors.text },
    kpiLabel: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 14,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    cardTitle: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text },
    newPill: { backgroundColor: `${colors.primaryRed}17`, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
    newPillText: { fontSize: 10.5, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    list: { gap: 0 },
    listItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    listItemDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    listItemName: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    listItemMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 1 },
    acceptBtn: { backgroundColor: colors.primaryRed, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
    acceptBtnText: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    ghostBtn: { backgroundColor: `${colors.primaryRed}17`, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    ghostBtnText: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    calendarPreview: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.background, borderRadius: 12, padding: 12, marginTop: 10 },
    calendarPreviewText: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    sectionTitle: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 12 },
    toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    toolCard: {
      width: '48%',
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    toolIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    toolTitle: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    toolSubtitle: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    profileToolCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginTop: 10,
    },
  });
}

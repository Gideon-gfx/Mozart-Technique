import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, RefreshControl, StyleSheet, Text, View } from 'react-native';

import * as calendarApi from '../../api/calendar';
import { API_BASE_URL, ApiError, resolveMediaUrl } from '../../api/client';
import * as organizationsApi from '../../api/organizations';
import type { TutorWorkspaceData } from '../../api/organizations';
import * as tutorsApi from '../../api/tutors';
import type { AssignmentSummary } from '../../api/types';
import Avatar from '../../components/Avatar';
import NotificationBell from '../../components/NotificationBell';
import LiveClock from '../../components/LiveClock';
import MonthCalendar from '../../components/MonthCalendar';
import OrgContentComposer from '../../components/OrgContentComposer';
import PayoutSheet from '../../components/PayoutSheet';
import ScheduleLessonSheet from '../../components/ScheduleLessonSheet';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useAuth } from '../../context/AuthContext';
import { useRoleMode } from '../../context/RoleModeContext';
import { useToast } from '../../context/ToastContext';
import type { OrgTutorTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<OrgTutorTabParamList, 'Overview'>;

function formatWhen(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const dateLabel = sameDay ? 'Today' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return { dateLabel, timeLabel };
}

// Styled almost identically to the regular Tutor dashboard - same hero/KPI/
// Requests/Calendar/Quick-tools layout, real /api/tutors/me* data for the
// wallet and rating (one tutor wallet regardless of which workspace it's
// viewed from) - just scoped to the active organization's own students and
// assignments (RoleModeContext's activeOrgId) instead of every student.
// The org's own logo/name/location replace the personal header the regular
// dashboard shows.
export default function OrgTutorOverviewScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeOrgId } = useRoleMode();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<TutorWorkspaceData | null>(null);
  const [profile, setProfile] = useState<tutorsApi.MyTutorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [announcementComposeOpen, setAnnouncementComposeOpen] = useState(false);

  const load = useCallback(() => {
    return Promise.all([
      organizationsApi.fetchTutorWorkspace(activeOrgId ?? undefined),
      tutorsApi.fetchMyTutorProfile(),
      calendarApi.fetchCalendarStatus().catch(() => ({ connected: false })),
    ])
      .then(([workspace, profileData, calStatus]) => {
        setData(workspace);
        setProfile(profileData.profile);
        setCalendarConnected(calStatus.connected);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your organization workspace.'));
  }, [activeOrgId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function acceptRequest(id: number, studentName: string) {
    try {
      await tutorsApi.acceptPendingTutorRequest(id);
      toast(`Accepted ${studentName}'s request.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not accept that request.', 'error');
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primaryRed} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.centered}>
        <Ionicons name="business-outline" size={28} color={colors.textFaint} />
        <Text style={styles.errorText}>{error || 'No organization access found.'}</Text>
      </View>
    );
  }

  const announcements = data.content.filter((item) => item.type === 'announcement').slice(0, 5);
  const logo = resolveMediaUrl(data.organization.logoUrl);
  const activeLessons = data.assignments.filter((item) => item.status === 'active');
  const nextLesson = activeLessons
    .filter((item) => item.scheduledAt && new Date(item.scheduledAt).getTime() > Date.now())
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0];
  const avgRating = profile && profile.ratingCount ? profile.ratingSum / profile.ratingCount : null;

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryRed} />}
      >
        <View style={styles.header}>
          {logo ? <Image source={{ uri: logo }} style={styles.logo} /> : <View style={[styles.logo, styles.logoPlaceholder]}><Ionicons name="business" size={17} color={colors.primaryRed} /></View>}
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{data.organization.name}</Text>
              <View style={styles.subtitleRow}>
                <Ionicons name="location" size={11} color={colors.textFaint} />
                <Text style={styles.subtitle} numberOfLines={1}>{data.organization.address || 'Tutor Dashboard'}</Text>
              </View>
            </View>
            <LiveClock colors={colors} />
          </View>
          <View style={styles.headerRight}>
            <Pressable style={styles.iconBtn} onPress={() => navigation.getParent()?.navigate('OrgNotifications')} hitSlop={10}>
              <NotificationBell size={20} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => navigation.getParent()?.navigate('Profile')} hitSlop={10}>
              <Avatar name={user?.name || '?'} photoUrl={user?.photoUrl} size={40} viewable={false} />
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
            <Text style={styles.kpiValue}>{data.students.length}</Text>
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
            {data.requests.length ? (
              <View style={styles.newPill}>
                <Text style={styles.newPillText}>{data.requests.length} new</Text>
              </View>
            ) : null}
          </View>
          {data.requests.length === 0 ? (
            <Text style={styles.emptyText}>No pending requests right now.</Text>
          ) : (
            data.requests.map((request, i) => {
              const photo = resolveMediaUrl(request.studentPhotoUrl);
              return (
                <View key={request.id} style={[styles.listItem, i > 0 && styles.listItemDivider]}>
                  <Avatar name={request.studentName || 'Student'} photoUrl={photo} size={38} viewable={false} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listItemName}>{request.studentName}</Text>
                    <Text style={styles.listItemMeta}>{request.category} · {request.lessonType}</Text>
                  </View>
                  <Pressable style={styles.acceptBtn} onPress={() => acceptRequest(request.id, request.studentName || 'Student')}>
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </Pressable>
                </View>
              );
            })
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

        <Text style={styles.sectionTitle}>Quick tools</Text>
        <View style={styles.toolsGrid}>
          <Pressable style={styles.toolCard} onPress={() => setScheduleOpen(true)}>
            <View style={styles.toolIcon}>
              <Ionicons name="calendar" size={19} color={colors.primaryRed} />
            </View>
            <Text style={styles.toolTitle}>Schedule lesson</Text>
            <Text style={styles.toolSubtitle}>Pick a student & time</Text>
          </Pressable>
          <Pressable style={styles.toolCard} onPress={() => navigation.getParent()?.navigate('MyLibrary')}>
            <View style={styles.toolIcon}>
              <Ionicons name="folder-open" size={19} color={colors.primaryRed} />
            </View>
            <Text style={styles.toolTitle}>My Library</Text>
            <Text style={styles.toolSubtitle}>Your own uploads</Text>
          </Pressable>
          <Pressable style={styles.toolCard} onPress={() => navigation.getParent()?.navigate('OrgLibrary')}>
            <View style={styles.toolIcon}>
              <Ionicons name="library" size={19} color={colors.primaryRed} />
            </View>
            <Text style={styles.toolTitle}>My organization's library</Text>
            <Text style={styles.toolSubtitle}>{data.organization.name}'s shared files</Text>
          </Pressable>
          <Pressable style={styles.toolCard} onPress={() => navigation.getParent()?.navigate('OrgFeeds')}>
            <View style={styles.toolIcon}>
              <Ionicons name="newspaper" size={19} color={colors.primaryRed} />
            </View>
            <Text style={styles.toolTitle}>Feeds</Text>
            <Text style={styles.toolSubtitle}>Photos & video updates</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Announcements</Text>
          {data.isOrgOwner ? (
            <Pressable onPress={() => setAnnouncementComposeOpen(true)} hitSlop={8}>
              <Ionicons name="add-circle" size={22} color={colors.primaryRed} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.card}>
          {announcements.length === 0 ? (
            <Text style={styles.emptyText}>No announcements yet.</Text>
          ) : (
            announcements.map((item, i) => {
              const fileUrl = resolveMediaUrl(item.fileUrl);
              return (
                <View key={item.id} style={[styles.listItem, styles.listItemColumn, i > 0 && styles.listItemDivider]}>
                  <Text style={styles.listItemName}>{item.title}</Text>
                  {item.text ? <Text style={styles.listItemMeta}>{item.text}</Text> : null}
                  {fileUrl ? (
                    <Pressable style={styles.docBtn} onPress={() => Linking.openURL(fileUrl)}>
                      <Ionicons name="document-text-outline" size={14} color={colors.primaryRed} />
                      <Text style={styles.docBtnText}>Open document</Text>
                    </Pressable>
                  ) : item.url ? (
                    <Pressable style={styles.docBtn} onPress={() => Linking.openURL(item.url!)}>
                      <Ionicons name="open-outline" size={14} color={colors.primaryRed} />
                      <Text style={styles.docBtnText}>Open link</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        <Text style={styles.sectionTitle}>Events</Text>
        <View style={styles.card}>
          {data.events.length === 0 ? (
            <Text style={styles.emptyText}>No events scheduled.</Text>
          ) : (
            data.events.map((event, i) => (
              <View key={event.id} style={[styles.listItem, styles.listItemColumn, i > 0 && styles.listItemDivider]}>
                <Text style={styles.listItemName}>{event.title}</Text>
                <Text style={styles.listItemMeta}>{new Date(event.scheduledAt).toLocaleString()}</Text>
                {event.meetLink ? (
                  <Pressable style={styles.joinBtn} onPress={() => navigation.getParent()?.navigate('MeetingWebView', { url: event.meetLink! })}>
                    <Text style={styles.joinBtnText}>Join meeting</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </View>
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
      <OrgContentComposer
        visible={announcementComposeOpen}
        onClose={() => setAnnouncementComposeOpen(false)}
        mode="announcement"
        colors={colors}
        onPosted={() => {
          setAnnouncementComposeOpen(false);
          toast('Announcement posted.', 'success');
          load();
        }}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, paddingHorizontal: 30, gap: 8 },
    errorText: { color: colors.textFaint, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
    logo: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.surface },
    logoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    titleRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    title: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text },
    subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    subtitle: { flexShrink: 1, fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint },
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
    listItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    listItemColumn: { flexDirection: 'column', alignItems: 'flex-start' },
    listItemDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    listItemName: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    listItemMeta: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    acceptBtn: { backgroundColor: colors.primaryRed, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
    acceptBtnText: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    ghostBtn: { backgroundColor: `${colors.primaryRed}17`, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    ghostBtnText: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    calendarPreview: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.background, borderRadius: 12, padding: 12, marginTop: 10 },
    calendarPreviewText: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    sectionTitle: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 12 },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    docBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
    docBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
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
    joinBtn: { backgroundColor: colors.primaryRed, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7, marginTop: 8, alignSelf: 'flex-start' },
    joinBtnText: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
  });
}

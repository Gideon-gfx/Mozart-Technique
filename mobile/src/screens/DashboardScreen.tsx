import { FlatList } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, RefreshControl, StyleSheet, Text, TextInput, View,  } from 'react-native';

import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import * as organizationsApi from '../api/organizations';
import type { AssignmentSummary } from '../api/types';
import Avatar from '../components/Avatar';
import type { TourStep } from '../components/CoachmarkTour';
import GlassSurface from '../components/GlassSurface';
import NotificationBell from '../components/NotificationBell';
import RoleStatusBanner from '../components/RoleStatusBanner';
import ScreenWatermark from '../components/ScreenWatermark';
import CountryFlag from '../components/CountryFlag';
import LiveClock from '../components/LiveClock';
import PrimaryButton from '../components/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { useQuickSearch } from '../context/QuickSearchContext';
import { useTourTarget } from '../context/TourTargetsContext';
import { useDashboardTour } from '../hooks/useDashboardTour';
import type { MainTabParamList } from '../navigation/types';
import { navigationRef } from '../navigation/navigationRef';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

const STUDENT_DASHBOARD_TOUR_ID = 'student-dashboard';

type Props = BottomTabScreenProps<MainTabParamList, 'Home'>;

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const day = isToday ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

const QUICK_ACTIONS = [
  { key: 'find', icon: 'search' as const, title: 'Find a tutor', subtitle: 'Match by level & city' },
  { key: 'schedule', icon: 'calendar' as const, title: 'Schedule', subtitle: 'Upcoming lessons' },
  { key: 'profile', icon: 'school' as const, title: 'My learning profile', subtitle: 'Level, subject & goals' },
  { key: 'sponsor-code', icon: 'key' as const, title: 'Sponsor Access Code', subtitle: 'Redeem a code' },
];

const STATUS_ACCENT: Record<AssignmentSummary['status'], (colors: ThemeColors) => string> = {
  pending: (colors) => colors.statusPendingText,
  active: (colors) => colors.statusActiveText,
  ended: (colors) => colors.textFaint,
};

// Deliberately distinct from a plain list row - small, two-up, just
// course name + tutor + a status accent, so "My courses" doesn't read as
// the same generic list as everything else on the screen. Tapping opens
// the counterpart's public profile, once one is actually matched.
function CourseCard({ item, role, onPress }: { item: AssignmentSummary; role: 'student' | 'tutor'; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const counterpartName = role === 'student' ? item.tutorName : item.studentName;
  const counterpartId = role === 'student' ? item.tutorId : item.studentId;
  const accent = STATUS_ACCENT[item.status](colors);
  return (
    <Pressable style={[styles.courseCard, { borderLeftColor: accent }]} onPress={counterpartId ? onPress : undefined}>
      <Text style={styles.courseCardTitle} numberOfLines={1}>{item.category}</Text>
      <View style={styles.courseCardFooter}>
        <Text style={styles.courseCardTutor} numberOfLines={1}>
          {counterpartName || 'Not yet matched'}
        </Text>
        <Text style={[styles.courseCardStatus, { color: accent }]}>{item.status}</Text>
      </View>
    </Pressable>
  );
}

export default function DashboardScreen({ navigation }: Props) {
  const { user, refresh: refreshSession } = useAuth();
  const { open: openQuickSearch, setTriggerVisible: setQuickSearchTriggerVisible } = useQuickSearch();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const flagTargetRef = useTourTarget('student-dashboard-flag');
  const profileTargetRef = useTourTarget('student-dashboard-profile');
  const findTutorTargetRef = useTourTarget('student-dashboard-find-tutor');
  const scheduleTargetRef = useTourTarget('student-dashboard-schedule');
  // 8 "dashboard home" points (flag, profile, the find-a-tutor mention,
  // schedule, then the 4 footer tabs) plus a genuine deep-dive into Find a
  // Tutor itself (4 more, on the real screen) - it's the one destination
  // explicitly allowed past the 8 cap, since it's real work to use well.
  // The footer/Find-a-Tutor steps actually navigate there and point at
  // real elements, not just the icon/card back on this screen - so this
  // tour outlives DashboardScreen itself (see TourRunnerContext). Defined
  // here, above the `if (!user) return null` below, since it (and the
  // useDashboardTour call using it) must run on every render regardless -
  // it doesn't reference anything that early-return would have skipped.
  const tourSteps: TourStep[] = [
    { targetKey: 'student-dashboard-flag', kicker: 'Your location', body: "This shows the country you're matched in. Tap it if it doesn't look right - it'll re-request your device location and reset it." },
    { targetKey: 'student-dashboard-profile', kicker: 'Profile', body: 'Tap your photo any time for quick access to every part of your account - dashboards you can switch into, settings, and sign out.' },
    { targetKey: 'student-dashboard-find-tutor', kicker: 'Find a tutor', body: 'Search and match with a tutor by subject, level and city, then send them a request. Take a closer look next.' },
    { navigate: () => navigationRef.navigate('FindTutor'), targetKey: 'find-tutor-search', kicker: 'Search', body: 'Search tutors by subject, genre or name.' },
    { targetKey: 'find-tutor-filter', kicker: 'Filters', body: 'Narrow results by lesson type, level, age group and city.' },
    { targetKey: 'find-tutor-chips', kicker: 'Subjects', body: 'Quick-filter the list to one subject at a tap.' },
    { targetKey: 'find-tutor-list', kicker: 'Results', body: "Tap any tutor to see their full profile, rates and reviews, then send a request." },
    { navigate: () => navigationRef.navigate('Tabs', { screen: 'Home' } as never), targetKey: 'student-dashboard-schedule', kicker: 'Schedule', body: 'See every upcoming lesson across all your tutors in one calendar.' },
    { navigate: () => navigationRef.navigate('Tabs', { screen: 'Library' } as never), targetKey: 'library-main', kicker: 'Library', body: 'A video library of technique clips you can browse any time, organized by subject.' },
    { navigate: () => navigationRef.navigate('Tabs', { screen: 'Messages' } as never), targetKey: 'messages-main', kicker: 'Messages', body: 'Every lesson chat with every tutor, in one inbox.' },
    { navigate: () => navigationRef.navigate('Tabs', { screen: 'Store' } as never), targetKey: 'store-main', kicker: 'Store', body: 'Instruments and gear, priced in your local currency.' },
    { navigate: () => navigationRef.navigate('Tabs', { screen: 'More' } as never), targetKey: 'more-main', kicker: 'More', body: 'Support, your other dashboards if you have any, and everything else lives here.' },
  ];
  useDashboardTour(STUDENT_DASHBOARD_TOUR_ID, tourSteps);
  const [asStudent, setAsStudent] = useState<AssignmentSummary[]>([]);
  const [asTutor, setAsTutor] = useState<AssignmentSummary[]>([]);
  const [streakCount, setStreakCount] = useState(0);
  const [enrolledCourses, setEnrolledCourses] = useState<authApi.EnrolledCourse[]>([]);
  const [studentProfile, setStudentProfile] = useState<authApi.StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sponsorCodeOpen, setSponsorCodeOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [assignmentsData, dashboardStats] = await Promise.all([
        authApi.fetchMyAssignments(),
        // Same call the web dashboard makes on load - also bumps the daily
        // streak server-side, so opening this screen counts as activity
        // the same way visiting the web dashboard does.
        authApi.fetchDashboardStats().catch(() => ({ streak: { count: 0 }, enrolledCourses: [], studentProfile: null })),
      ]);
      setAsStudent(assignmentsData.asStudent || []);
      setAsTutor(assignmentsData.asTutor || []);
      setStreakCount(dashboardStats.streak?.count || 0);
      setEnrolledCourses(dashboardStats.enrolledCourses || []);
      setStudentProfile(dashboardStats.studentProfile || null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your dashboard.');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Quick Search slides up by itself every time Home comes into focus
  // (first landing here after login, and every time the user switches
  // back to this tab) - there's no separate button for it, per the
  // request that it "come up by itself" rather than needing a tap.
  // The floating trigger is scoped to Dashboard only, the same way: shown
  // while this screen is focused, hidden again the instant it isn't (the
  // cleanup below), so it never follows the user onto Library/Store/
  // Product/etc.
  useFocusEffect(useCallback(() => {
    openQuickSearch();
    setQuickSearchTriggerVisible(true);
    return () => setQuickSearchTriggerVisible(false);
  }, [openQuickSearch, setQuickSearchTriggerVisible]));

  async function onRefresh() {
    setRefreshing(true);
    // Also re-checks the session, since that's where tutorStatus/
    // performerStatus/etc. live - without this a role-application decision
    // (approved/rejected) never shows up here until the app is fully
    // restarted, because load() below only re-fetches assignments/stats.
    await Promise.all([load(), refreshSession().catch(() => {})]);
    setRefreshing(false);
  }

  if (!user) return null;

  const rows: Array<{ item: AssignmentSummary; role: 'student' | 'tutor' }> = [
    ...asStudent.map((item) => ({ item, role: 'student' as const })),
    ...asTutor.map((item) => ({ item, role: 'tutor' as const })),
  ];

  // Soonest lesson with a real scheduled time, across both roles - the hero
  // card's "next lesson" needs a real date, not a fabricated one.
  const nextLesson = rows
    .filter((row) => row.item.scheduledAt)
    .sort((a, b) => new Date(a.item.scheduledAt!).getTime() - new Date(b.item.scheduledAt!).getTime())[0];

  const firstName = user.name.split(' ')[0];
  const greeting = greetingForHour(new Date().getHours());
  const heroCounterpartName = nextLesson
    ? (nextLesson.role === 'student' ? nextLesson.item.tutorName : nextLesson.item.studentName) || 'Tutor'
    : '';
  const heroPhotoUrl = nextLesson
    ? (nextLesson.role === 'student' ? nextLesson.item.tutorPhotoUrl : nextLesson.item.studentPhotoUrl)
    : null;

  // Real completed-lesson history (data/assignments.js's addSession), not a
  // fabricated progress number - same computation as LearningProfileScreen.
  const practiceStats = (() => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let sessionsThisWeek = 0;
    let minutesThisWeek = 0;
    for (const item of asStudent) {
      for (const session of item.sessions || []) {
        if (new Date(session.loggedAt).getTime() >= since) {
          sessionsThisWeek += 1;
          minutesThisWeek += Number(session.durationMinutes) || 0;
        }
      }
    }
    const hours = Math.floor(minutesThisWeek / 60);
    const mins = minutesThisWeek % 60;
    return { sessionsThisWeek, hoursLabel: `${hours}h ${mins}m` };
  })();

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View style={styles.header}>
        <GlassSurface clear pointerEvents="none" style={[StyleSheet.absoluteFill, styles.headerGlass]} />
        <View style={styles.headerLeft}>
          <Image source={require('../../assets/mozart-logo.png')} style={styles.headerLogo} />
          <View ref={flagTargetRef} collapsable={false}>
            <CountryFlag />
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            hitSlop={10}
            style={styles.iconButton}
            onPress={() => navigation.getParent()?.navigate('Notifications')}
          >
            <NotificationBell size={20} color={colors.text} />
          </Pressable>
          {/* A separate destination from the More tab, not the same screen
              reached two ways - Profile lives one level up, in the stack
              that wraps the whole tab bar. */}
          <Pressable ref={profileTargetRef} onPress={() => navigation.getParent()?.navigate('Profile')} hitSlop={10}>
            <Avatar name={user.name} photoUrl={user.photoUrl} size={34} viewable={false} />
          </Pressable>
        </View>
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
          data={rows}
          keyExtractor={(row) => `${row.role}-${row.item.id}`}
          renderItem={({ item }) => (
            <CourseCard
              item={item.item}
              role={item.role}
              onPress={() => {
                const counterpartId = item.role === 'student' ? item.item.tutorId : item.item.studentId;
                if (!counterpartId) return;
                navigation.getParent()?.navigate('CounterpartProfile', {
                  type: item.role === 'student' ? 'tutor' : 'student',
                  id: counterpartId,
                });
              }}
            />
          )}
          numColumns={2}
          columnWrapperStyle={styles.courseCardRow}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryRed} />}
          ListHeaderComponent={
            <View>
              <View style={styles.greetingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.greeting}>{greeting}, {firstName}</Text>
                  <Text style={styles.greetingSub}>Ready to pick up where you left off?</Text>
                </View>
                <LiveClock colors={colors} />
              </View>

              <LinearGradient colors={colors.primaryGradient} style={styles.hero}>
                {nextLesson ? (
                  <>
                    <View style={styles.heroTopRow}>
                      <View style={styles.heroInfo}>
                        {/* Real streak from store.js's markActive - same
                            field the web dashboard reads, bumped on load. */}
                        {streakCount > 0 ? (
                          <View style={styles.streakPill}>
                            <Text style={styles.streakPillText}>
                              🔥 {streakCount} day{streakCount === 1 ? '' : 's'} streak
                            </Text>
                          </View>
                        ) : null}
                        <Text style={styles.heroTitle}>Your next lesson</Text>
                        <Text style={styles.heroMeta}>
                          {nextLesson.item.category} · with{' '}
                          {(nextLesson.role === 'student' ? nextLesson.item.tutorName : nextLesson.item.studentName) ||
                            'your tutor'}
                        </Text>
                      </View>
                      <Avatar
                        name={heroCounterpartName}
                        photoUrl={heroPhotoUrl}
                        size={44}
                        fallbackColor="rgba(255,255,255,0.22)"
                      />
                    </View>

                    <View style={styles.heroBottomRow}>
                      <View>
                        <Text style={styles.heroWhen}>{formatWhen(nextLesson.item.scheduledAt!)}</Text>
                        <Text style={styles.heroSub}>{nextLesson.item.lessonType}</Text>
                      </View>
                      <Pressable
                        style={styles.openChatBtn}
                        onPress={() => navigation.getParent()?.navigate('Chat', {
                          assignmentId: nextLesson.item.id,
                          name: heroCounterpartName,
                          photoUrl: heroPhotoUrl,
                        })}
                      >
                        <Text style={styles.openChatText}>Open chat</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    {streakCount > 0 ? (
                      <View style={styles.streakPill}>
                        <Text style={styles.streakPillText}>
                          🔥 {streakCount} day{streakCount === 1 ? '' : 's'} streak
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.heroTitle}>No lessons scheduled yet</Text>
                    <Text style={styles.heroMeta}>Find a tutor to book your first lesson</Text>
                  </>
                )}
              </LinearGradient>

              <Text style={styles.sectionTitle}>Quick actions</Text>
              <View style={styles.quickGrid}>
                {QUICK_ACTIONS.map((action) => (
                  <Pressable
                    key={action.key}
                    ref={action.key === 'find' ? findTutorTargetRef : action.key === 'schedule' ? scheduleTargetRef : undefined}
                    style={styles.quickCard}
                    onPress={() => {
                      if (action.key === 'find') navigation.getParent()?.navigate('FindTutor');
                      else if (action.key === 'schedule') navigation.getParent()?.navigate('Schedule');
                      else if (action.key === 'profile') navigation.getParent()?.navigate('LearningProfile');
                      else if (action.key === 'sponsor-code') setSponsorCodeOpen(true);
                    }}
                  >
                    <View style={styles.quickIcon}>
                      <Ionicons name={action.icon} size={19} color={colors.primaryRed} />
                    </View>
                    <Text style={styles.quickTitle}>{action.title}</Text>
                    <Text style={styles.quickSubtitle}>{action.subtitle}</Text>
                  </Pressable>
                ))}
              </View>

              {user ? (
                <RoleStatusBanner userId={user.id} tutorStatus={user.tutorStatus} performerStatus={user.performerStatus} sponsorStatus={user.sponsorOrgStatus} sponsorOrgType={user.sponsorOrgType} sponsorOrgKind={user.sponsorOrgKind} />
              ) : null}

              <View style={styles.listHeaderRow}>
                <Text style={styles.sectionTitle}>My courses</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No lessons yet.</Text>
            </View>
          }
          ListFooterComponent={
            <Pressable
              style={styles.profileCard}
              onPress={() => navigation.getParent()?.navigate('LearningProfile')}
            >
              <View style={styles.profileCardHeader}>
                <Text style={styles.profileCardTitle}>Learning profile</Text>
                <View style={styles.profileCardViewBtn}>
                  <Text style={styles.profileCardViewText}>View</Text>
                  <Ionicons name="chevron-forward" size={13} color={colors.primaryRed} />
                </View>
              </View>
              <View style={styles.practiceRow}>
                <View style={styles.practiceStat}>
                  <Text style={styles.practiceNumber}>{practiceStats.sessionsThisWeek}</Text>
                  <Text style={styles.practiceLabel}>Sessions this week</Text>
                </View>
                <View style={styles.practiceStatDivider} />
                <View style={styles.practiceStat}>
                  <Text style={styles.practiceNumber}>{practiceStats.hoursLabel}</Text>
                  <Text style={styles.practiceLabel}>Practiced this week</Text>
                </View>
              </View>
              <View style={styles.profileCardRow}>
                <Text style={styles.profileCardLabel}>Level</Text>
                <Text style={styles.profileCardValue}>{enrolledCourses[0]?.level || 'Not set yet'}</Text>
              </View>
              <View style={styles.profileCardDivider} />
              <View style={styles.profileCardRow}>
                <Text style={styles.profileCardLabel}>Primary subject</Text>
                <Text style={styles.profileCardValue}>{enrolledCourses[0]?.category || 'Not set yet'}</Text>
              </View>
              <View style={styles.profileCardDivider} />
              <View style={styles.profileCardRow}>
                <Text style={styles.profileCardLabel}>City</Text>
                <Text style={styles.profileCardValue}>{studentProfile?.city || 'Not set yet'}</Text>
              </View>
            </Pressable>
          }
        />
      )}

      <SponsorCodeModal visible={sponsorCodeOpen} onClose={() => setSponsorCodeOpen(false)} colors={colors} />
    </View>
  );
}

function SponsorCodeModal({ visible, onClose, colors }: { visible: boolean; onClose: () => void; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { refresh } = useAuth();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setCode('');
      setError(null);
      setOrgName(null);
    }
  }, [visible]);

  async function redeem() {
    if (!code.trim()) {
      setError('Enter a code.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await organizationsApi.redeemCode(code.trim());
      setOrgName(result.orgName);
      // Redeeming changes hasSponsorAccess/organizationMemberships
      // server-side - refresh so it's reflected without a cold restart.
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not redeem that code.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalBackdropTouch} onPress={onClose} />
        <View style={styles.modalCard}>
          {orgName ? (
            <View style={styles.sentState}>
              <Ionicons name="checkmark-circle" size={36} color={colors.success} />
              <Text style={styles.modalTitle}>Code redeemed</Text>
              <Text style={styles.modalHint}>You're now connected to {orgName}.</Text>
              <PrimaryButton title="Done" onPress={onClose} style={styles.modalSubmit} />
            </View>
          ) : (
            <>
              <Text style={styles.modalTitle}>Sponsor access code</Text>
              <Text style={styles.modalHint}>Enter the code your sponsor organization gave you to link your account.</Text>
              <TextInput
                style={styles.modalInput}
                value={code}
                onChangeText={setCode}
                placeholder="Enter code"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="characters"
              />
              {error ? <Text style={styles.modalError}>{error}</Text> : null}
              <PrimaryButton title="Redeem code" onPress={redeem} loading={submitting} style={styles.modalSubmit} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 14,
      backgroundColor: 'transparent',
    },
    headerGlass: { borderRadius: 0 },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerLogo: {
      width: 36,
      height: 36,
      borderRadius: 10,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 60,
    },
    errorText: {
      color: colors.danger,
      fontFamily: fonts.bodySemiBold,
    },
    emptyText: {
      color: colors.textFaint,
      fontFamily: fonts.body,
    },
    listContent: {
      padding: 16,
      paddingBottom: 32,
      gap: 10,
    },
    greetingRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    greeting: {
      fontSize: 22,
      fontFamily: fonts.displayBlack,
      color: colors.text,
      marginTop: 4,
    },
    greetingSub: {
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.textSoft,
      marginTop: 4,
      marginBottom: 18,
    },
    hero: {
      borderRadius: 18,
      padding: 14,
      marginBottom: 22,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    heroInfo: {
      flex: 1,
      paddingRight: 10,
    },
    streakPill: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,255,255,0.22)',
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 3,
      marginBottom: 8,
    },
    streakPillText: {
      fontSize: 10.5,
      fontFamily: fonts.bodyBold,
      color: colors.onPrimary,
    },
    heroTitle: {
      fontSize: 16,
      fontFamily: fonts.displayBlack,
      color: colors.onPrimary,
    },
    heroMeta: {
      fontSize: 12,
      fontFamily: fonts.body,
      color: 'rgba(255,255,255,0.9)',
      marginTop: 3,
    },
    heroBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
    },
    heroWhen: {
      fontSize: 13.5,
      fontFamily: fonts.bodyBold,
      color: colors.onPrimary,
    },
    heroSub: {
      fontSize: 11.5,
      fontFamily: fonts.body,
      color: 'rgba(255,255,255,0.85)',
      marginTop: 2,
      textTransform: 'capitalize',
    },
    openChatBtn: {
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    openChatText: {
      fontSize: 12,
      fontFamily: fonts.bodyBold,
      color: colors.primaryRed,
    },
    sectionTitle: {
      fontSize: 16,
      fontFamily: fonts.bodyBold,
      color: colors.text,
      marginBottom: 12,
    },
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 24,
    },
    quickCard: {
      width: '48%',
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    quickIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    quickTitle: {
      fontSize: 13.5,
      fontFamily: fonts.bodyBold,
      color: colors.text,
    },
    quickSubtitle: {
      fontSize: 11.5,
      fontFamily: fonts.body,
      color: colors.textFaint,
      marginTop: 2,
    },
    listHeaderRow: {
      marginTop: 4,
    },
    courseCardRow: {
      gap: 10,
    },
    courseCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 3,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 10,
    },
    courseCardTitle: {
      fontSize: 13,
      fontFamily: fonts.bodyBold,
      color: colors.text,
    },
    courseCardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
      gap: 6,
    },
    courseCardTutor: {
      flex: 1,
      fontSize: 11,
      fontFamily: fonts.body,
      color: colors.textFaint,
    },
    courseCardStatus: {
      fontSize: 10,
      fontFamily: fonts.bodyBold,
      textTransform: 'capitalize',
    },
    profileCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginTop: 8,
    },
    profileCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    profileCardTitle: {
      fontSize: 15,
      fontFamily: fonts.bodyBold,
      color: colors.text,
    },
    profileCardViewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    profileCardViewText: {
      fontSize: 12.5,
      fontFamily: fonts.bodyBold,
      color: colors.primaryRed,
    },
    practiceRow: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: 12,
      paddingVertical: 12,
      marginBottom: 6,
    },
    practiceStat: { flex: 1, alignItems: 'center' },
    practiceStatDivider: { width: 1, backgroundColor: colors.border },
    practiceNumber: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text },
    practiceLabel: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2, textAlign: 'center' },
    profileCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    profileCardLabel: {
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.textFaint,
    },
    profileCardValue: {
      fontSize: 13,
      fontFamily: fonts.bodyBold,
      color: colors.text,
    },
    profileCardDivider: {
      height: 1,
      backgroundColor: colors.border,
    },
    modalBackdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingHorizontal: 24,
    },
    modalBackdropTouch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    modalCard: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 20,
    },
    modalTitle: {
      fontSize: 17,
      fontFamily: fonts.displayBlack,
      color: colors.text,
      textAlign: 'center',
    },
    modalHint: {
      fontSize: 12.5,
      fontFamily: fonts.body,
      color: colors.textFaint,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 18,
    },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: fonts.bodyBold,
      color: colors.text,
      backgroundColor: colors.background,
      textAlign: 'center',
      marginTop: 16,
      letterSpacing: 1,
    },
    modalError: {
      color: colors.danger,
      fontFamily: fonts.bodySemiBold,
      fontSize: 12.5,
      textAlign: 'center',
      marginTop: 10,
    },
    modalSubmit: { marginTop: 16 },
    sentState: { alignItems: 'center', gap: 8 },
  });
}

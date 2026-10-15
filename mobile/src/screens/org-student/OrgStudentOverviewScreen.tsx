import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, RefreshControl, StyleSheet, Text, View } from 'react-native';

import * as authApi from '../../api/auth';
import { ApiError, resolveMediaUrl } from '../../api/client';
import * as organizationsApi from '../../api/organizations';
import type { MyOrgMembership, OrgContentItem } from '../../api/organizations';
import type { AssignmentSummary } from '../../api/types';
import Avatar from '../../components/Avatar';
import GlassSurface from '../../components/GlassSurface';
import NotificationBell from '../../components/NotificationBell';
import LiveClock from '../../components/LiveClock';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useAuth } from '../../context/AuthContext';
import { useRoleMode } from '../../context/RoleModeContext';
import type { OrgStudentTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<OrgStudentTabParamList, 'Overview'>;

// Same fixed 5-emoji set as chat and OrgFeedsScreen.tsx (tutor mode's own
// copy of this same feed) - kept in sync manually since each screen owns a
// short local ReactSheet rather than sharing one, matching how this
// codebase already does it for the tutor side.
const REACTIONS = ['👍', '❤️', '😂', '😢', '🙏'];

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Org Student mode's own Home tab - mirrors my-organization.html (the
// "land map"): the org's own Updates (feed + announcements together, same
// as that page's single Updates tab) and Events, mixed with the normal
// student dashboard's own course list. A student here is already linked,
// so there's deliberately no "redeem a code" tile - that's the Sponsor
// Access Code entry point on the regular student Dashboard, not this one.
export default function OrgStudentOverviewScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { activeOrgId } = useRoleMode();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<MyOrgMembership | null>(null);
  const [content, setContent] = useState<OrgContentItem[]>([]);
  const [courses, setCourses] = useState<AssignmentSummary[]>([]);
  const [reactTarget, setReactTarget] = useState<OrgContentItem | null>(null);

  const load = useCallback(() => {
    return organizationsApi
      .fetchMyOrgMembership()
      .then(async (data) => {
        setOrg(data.organization);
        const [contentData, assignmentsData] = await Promise.all([
          organizationsApi.fetchOrgPublicContent(data.organization.id).catch(() => ({ content: [] as OrgContentItem[] })),
          authApi.fetchMyAssignments().catch(() => ({ asStudent: [] as AssignmentSummary[] })),
        ]);
        setContent(contentData.content);
        setCourses(assignmentsData.asStudent || []);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your organization.'));
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load, activeOrgId]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function react(item: OrgContentItem, emoji: string) {
    setReactTarget(null);
    const prev = content;
    setContent((list) =>
      list.map((p) => {
        if (p.id !== item.id) return p;
        const toggledOff = p.myReaction === emoji;
        const reactions = p.reactions.filter((r) => r.userId !== user?.id);
        if (!toggledOff && user) reactions.push({ userId: user.id, emoji });
        return { ...p, reactions, myReaction: toggledOff ? null : emoji };
      }),
    );
    try {
      await organizationsApi.reactToOrgContent(item.id, emoji);
    } catch {
      setContent(prev);
    }
  }

  const greeting = greetingForHour(new Date().getHours());
  const firstName = user?.name.split(' ')[0] || '';

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View style={styles.header}>
        <GlassSurface clear pointerEvents="none" style={[StyleSheet.absoluteFill, styles.headerGlass]} />
        <View style={styles.headerLeft}>
          {org ? (
            <>
              <Avatar name={org.name || org.contactName} photoUrl={resolveMediaUrl(org.logoUrl)} size={36} viewable={false} />
              <Text style={styles.headerOrgName} numberOfLines={1}>{org.name || org.contactName}</Text>
              {org.countryCode ? <OrgCountryFlag countryCode={org.countryCode} /> : null}
            </>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.iconButton} onPress={() => navigation.getParent()?.navigate('Notifications')} hitSlop={10}>
            <NotificationBell size={20} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => navigation.getParent()?.navigate('Profile')} hitSlop={10}>
            <Avatar name={user?.name || '?'} photoUrl={user?.photoUrl} size={34} viewable={false} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error || !org ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || 'Not linked to an organization.'}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryRed} />}
        >
          <View style={styles.greetingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting} numberOfLines={1}>{greeting}, {firstName}!</Text>
              <Text style={styles.greetingSub}>{org.name || org.contactName} · Student</Text>
            </View>
            <LiveClock colors={colors} />
          </View>

          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={styles.actionsGrid}>
            <Pressable
              style={styles.actionCard}
              onPress={() => navigation.getParent()?.navigate('FindTutor', { orgScope: { id: org.id, name: org.name || org.contactName } })}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="search" size={19} color={colors.primaryRed} />
              </View>
              <Text style={styles.actionTitle}>Find a Tutor</Text>
              <Text style={styles.actionSubtitle}>{org.name || org.contactName}'s tutors</Text>
            </Pressable>
            <Pressable style={styles.actionCard} onPress={() => navigation.getParent()?.navigate('OrgLibrary')}>
              <View style={styles.actionIcon}>
                <Ionicons name="library" size={19} color={colors.primaryRed} />
              </View>
              <Text style={styles.actionTitle}>{org.name || org.contactName}'s Library</Text>
              <Text style={styles.actionSubtitle}>Shared materials</Text>
            </Pressable>
            <Pressable style={styles.actionCard} onPress={() => navigation.getParent()?.navigate('Schedule')}>
              <View style={styles.actionIcon}>
                <Ionicons name="calendar" size={19} color={colors.primaryRed} />
              </View>
              <Text style={styles.actionTitle}>Schedule</Text>
              <Text style={styles.actionSubtitle}>Upcoming lessons</Text>
            </Pressable>
            <Pressable style={styles.actionCard} onPress={() => navigation.getParent()?.navigate('LearningProfile')}>
              <View style={styles.actionIcon}>
                <Ionicons name="school" size={19} color={colors.primaryRed} />
              </View>
              <Text style={styles.actionTitle}>Learning Profile</Text>
              <Text style={styles.actionSubtitle}>Level, subject & goals</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Updates</Text>
          <View style={styles.card}>
            {content.length === 0 ? (
              <Text style={styles.emptyText}>No updates yet.</Text>
            ) : (
              content.map((item, i) => {
                const fileUrl = resolveMediaUrl(item.fileUrl);
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.listItem, i > 0 && styles.listItemDivider]}
                    onLongPress={() => setReactTarget(item)}
                    delayLongPress={280}
                  >
                    <Text style={styles.listItemName}>{item.title}</Text>
                    {item.text ? <Text style={styles.listItemMeta}>{item.text}</Text> : null}
                    {fileUrl ? (
                      <Pressable style={styles.docBtn} onPress={() => Linking.openURL(fileUrl)}>
                        <Ionicons name="document-text-outline" size={14} color={colors.primaryRed} />
                        <Text style={styles.docBtnText}>Open attachment</Text>
                      </Pressable>
                    ) : item.url ? (
                      <Pressable style={styles.docBtn} onPress={() => Linking.openURL(item.url!)}>
                        <Ionicons name="open-outline" size={14} color={colors.primaryRed} />
                        <Text style={styles.docBtnText}>Open link</Text>
                      </Pressable>
                    ) : null}
                    {item.reactions.length ? (
                      <View style={[styles.reactionsPill, item.myReaction && styles.reactionsPillActive]}>
                        <Text style={styles.reactionsPillText}>
                          {Array.from(new Set(item.reactions.map((r) => r.emoji))).join('')}
                          {item.reactions.length > 1 ? ` ${item.reactions.length}` : ''}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>

          <Text style={styles.sectionTitle}>Events</Text>
          <View style={styles.card}>
            {org.events.length === 0 ? (
              <Text style={styles.emptyText}>No events scheduled.</Text>
            ) : (
              org.events.map((event, i) => (
                <View key={event.id} style={[styles.listItem, i > 0 && styles.listItemDivider]}>
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

          <Text style={styles.sectionTitle}>My Courses</Text>
          <View style={styles.card}>
            {courses.length === 0 ? (
              <Text style={styles.emptyText}>No courses yet - find a tutor to get started.</Text>
            ) : (
              courses.map((item, i) => (
                <Pressable
                  key={item.id}
                  style={[styles.listItem, i > 0 && styles.listItemDivider]}
                  onPress={() => item.tutorId && navigation.getParent()?.navigate('CounterpartProfile', { type: 'tutor', id: item.tutorId })}
                >
                  <Text style={styles.listItemName}>{item.category}</Text>
                  <Text style={styles.listItemMeta}>{item.tutorName || 'Not yet matched'} · {item.status}</Text>
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      )}
      <ReactSheet post={reactTarget} onClose={() => setReactTarget(null)} onReact={react} colors={colors} />
    </View>
  );
}

function ReactSheet({
  post,
  onClose,
  onReact,
  colors,
}: {
  post: OrgContentItem | null;
  onClose: () => void;
  onReact: (post: OrgContentItem, emoji: string) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!post) return null;
  return (
    <Modal visible={!!post} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.reactSheetBackdrop} onPress={onClose}>
        <View style={styles.reactSheetRow}>
          {REACTIONS.map((emoji) => {
            const active = post.myReaction === emoji;
            return (
              <Pressable
                key={emoji}
                style={[styles.reactionBtn, active && styles.reactionBtnActive]}
                onPress={() => onReact(post, emoji)}
              >
                <Text style={styles.reactSheetEmoji}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

// A fixed fact about the organization, not the viewer - a static badge
// (unlike the interactive CountryFlag component, which reads the current
// device's own location and lets the viewer refresh it).
function OrgCountryFlag({ countryCode }: { countryCode: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.flagBadge, { borderColor: colors.border, backgroundColor: colors.background }]}>
      {failed ? (
        <Text style={styles.flagFallback}>🌐</Text>
      ) : (
        <Image
          source={{ uri: `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png` }}
          style={styles.flagImage}
          onError={() => setFailed(true)}
        />
      )}
      <Text style={styles.flagCode}>{countryCode}</Text>
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
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 14,
      backgroundColor: 'transparent',
    },
    headerGlass: { borderRadius: 0 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
    headerOrgName: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text, flexShrink: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    flagBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
    flagImage: { width: 18, height: 12, borderRadius: 2 },
    flagFallback: { fontSize: 12, lineHeight: 14 },
    flagCode: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.textSoft },
    iconButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
    greetingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 20 },
    greeting: { fontSize: 22, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 4, flexShrink: 1 },
    greetingSub: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.primaryRed, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
    sectionTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 12 },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
    actionCard: {
      width: '47%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
    },
    actionIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: `${colors.primaryRed}12`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    actionTitle: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    actionSubtitle: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
      marginBottom: 20,
    },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    listItem: { paddingVertical: 10 },
    listItemDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    listItemName: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    listItemMeta: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 3 },
    docBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
    docBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    joinBtn: { alignSelf: 'flex-start', backgroundColor: colors.primaryRed, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
    joinBtnText: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    reactionsPill: { alignSelf: 'flex-start', backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginTop: 8 },
    reactionsPillActive: { backgroundColor: `${colors.primaryRed}17` },
    reactionsPillText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textSoft },
    reactSheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
    reactSheetRow: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    reactionBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    reactionBtnActive: { backgroundColor: `${colors.primaryRed}17` },
    reactSheetEmoji: { fontSize: 22 },
  });
}

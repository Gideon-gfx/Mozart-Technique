import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../../api/client';
import * as gamesApi from '../../api/games';
import type { LeaderboardEntry } from '../../api/games';
import * as organizationsApi from '../../api/organizations';
import type { OrgContentItem, OrgEvent, OrgPerformance, OrgRosterMember } from '../../api/organizations';
import Avatar from '../../components/Avatar';
import CollapsibleSidebar from '../../components/CollapsibleSidebar';
import OrgContentComposer from '../../components/OrgContentComposer';
import PrimaryButton from '../../components/PrimaryButton';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useToast } from '../../context/ToastContext';
import type { OrganizationTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<OrganizationTabParamList, 'Classroom'>;
type Section = 'feed' | 'students' | 'tutors' | 'announcements' | 'events' | 'performance' | 'games';

const SECTIONS: { key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'feed', label: 'Feed', icon: 'home-outline' },
  { key: 'students', label: 'Students', icon: 'people-outline' },
  { key: 'tutors', label: 'Tutors', icon: 'school-outline' },
  { key: 'announcements', label: 'Announcements', icon: 'megaphone-outline' },
  { key: 'events', label: 'Events', icon: 'calendar-outline' },
  { key: 'performance', label: 'Performance', icon: 'stats-chart-outline' },
  { key: 'games', label: 'Games', icon: 'game-controller-outline' },
];

// The Organization Dashboard's own Classroom - mirrors ngo-dashboard.html's
// Classroom sidebar exactly (feed/members/tutors/announcement/events/
// performance/games, notification dropped since mobile already has its own
// global Notifications screen). A horizontal section switcher stands in for
// the web sidebar - there's no room for a persistent one here. Both
// students AND tutors live here, unlike the Sponsor Dashboard's Students-
// only tab (an Individual Sponsor has no tutors of their own to manage).
export default function OrganizationClassroomScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { toast, confirm, actionSheet } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [section, setSection] = useState<Section>('feed');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<number | null>(null);
  const [roster, setRoster] = useState<{ students: OrgRosterMember[]; tutors: OrgRosterMember[] }>({ students: [], tutors: [] });
  const [content, setContent] = useState<OrgContentItem[]>([]);
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [performance, setPerformance] = useState<OrgPerformance | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [feedComposerOpen, setFeedComposerOpen] = useState(false);
  const [announcementComposerOpen, setAnnouncementComposerOpen] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [createGameOpen, setCreateGameOpen] = useState(false);

  const load = useCallback(() => {
    return organizationsApi
      .fetchMySponsorOrg()
      .then((data) => {
        setOrgId(data.organization.id);
        return Promise.all([
          organizationsApi.fetchOrgMembers(),
          organizationsApi.fetchOrgPublicContent(data.organization.id),
          organizationsApi.fetchOrgEvents(),
          organizationsApi.fetchOrgPerformance(),
          gamesApi.fetchNoteGameLeaderboard(),
        ]);
      })
      .then(([memberData, contentData, eventsData, perfData, leaderboardData]) => {
        setRoster(memberData);
        setContent(contentData.content);
        setEvents(eventsData.events);
        setPerformance(perfData);
        setLeaderboard(leaderboardData.leaderboard);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your classroom.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function messageRow(member: OrgRosterMember, type: 'student' | 'tutor') {
    try {
      const { conversation } = await organizationsApi.openOrgConversation(member.id, type, member.name);
      navigation.getParent()?.navigate('OrgChat', { conversationId: conversation.id, title: member.name, photoUrl: member.photoUrl });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not open that conversation.', 'error');
    }
  }

  async function removeStudent(member: OrgRosterMember) {
    const ok = await confirm({
      title: 'Remove student?',
      message: `${member.name} will no longer be linked to your organization. This can't be undone.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await organizationsApi.removeOrgMember(member.id);
      toast(`Removed ${member.name}.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not remove that student.', 'error');
    }
  }

  function onLongPressRow(member: OrgRosterMember, type: 'student' | 'tutor') {
    actionSheet({
      title: member.name,
      actions: [
        { label: 'Message', onPress: () => messageRow(member, type) },
        { label: 'View profile', onPress: () => navigation.getParent()?.navigate('CounterpartProfile', { type, id: member.id }) },
        ...(type === 'student' ? [{ label: 'Remove student', destructive: true, onPress: () => removeStudent(member) }] : []),
      ],
    });
  }

  const offeredCategories = useMemo(() => {
    const set = new Set<string>();
    roster.tutors.forEach((t) => (t.profile?.categories || []).forEach((c) => set.add(c)));
    return Array.from(set);
  }, [roster.tutors]);

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.navigate('Overview')} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Classroom</Text>
          <Text style={styles.subtitle}>{roster.students.length} student{roster.students.length === 1 ? '' : 's'} · {roster.tutors.length} tutor{roster.tutors.length === 1 ? '' : 's'}</Text>
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
        <CollapsibleSidebar sections={SECTIONS} activeKey={section} onSelect={(key) => setSection(key as Section)}>
          <ScrollView style={styles.contentScroller} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {section === 'feed' ? (
              <FeedSection
                items={content.filter((c) => ['feed', 'photo', 'video'].includes(c.type))}
                onCompose={() => setFeedComposerOpen(true)}
                colors={colors}
              />
            ) : section === 'students' ? (
              <RosterSection
                members={roster.students}
                emptyText="No students yet - generate a student code from Overview's Payment card."
                onPress={(m) => messageRow(m, 'student')}
                onLongPress={(m) => onLongPressRow(m, 'student')}
                colors={colors}
              />
            ) : section === 'tutors' ? (
              <TutorCardGrid
                members={roster.tutors}
                onMessage={(m) => messageRow(m, 'tutor')}
                onViewProfile={(m) => navigation.getParent()?.navigate('CounterpartProfile', { type: 'tutor', id: m.id })}
                colors={colors}
              />
            ) : section === 'announcements' ? (
              <AnnouncementsSection
                items={content.filter((c) => c.type === 'announcement')}
                onCompose={() => setAnnouncementComposerOpen(true)}
                colors={colors}
              />
            ) : section === 'events' ? (
              <EventsSection events={events} onCreate={() => setCreateEventOpen(true)} onJoinMeeting={(url) => navigation.getParent()?.navigate('MeetingWebView', { url })} colors={colors} />
            ) : section === 'performance' ? (
              <PerformanceSection performance={performance} colors={colors} />
            ) : (
              <GamesSection leaderboard={leaderboard} customGames={content.filter((c) => c.type === 'game')} onCreate={() => setCreateGameOpen(true)} colors={colors} />
            )}
          </ScrollView>
        </CollapsibleSidebar>
      )}

      <OrgContentComposer
        visible={feedComposerOpen}
        onClose={() => setFeedComposerOpen(false)}
        mode="feed"
        colors={colors}
        onPosted={() => {
          setFeedComposerOpen(false);
          toast('Posted to feed.', 'success');
          load();
        }}
      />
      <OrgContentComposer
        visible={announcementComposerOpen}
        onClose={() => setAnnouncementComposerOpen(false)}
        mode="announcement"
        colors={colors}
        onPosted={() => {
          setAnnouncementComposerOpen(false);
          toast('Announcement posted.', 'success');
          load();
        }}
      />
      <CreateEventSheet
        visible={createEventOpen}
        onClose={() => setCreateEventOpen(false)}
        colors={colors}
        onCreated={() => {
          setCreateEventOpen(false);
          toast('Event scheduled.', 'success');
          load();
        }}
      />
      <CreateGameSheet
        visible={createGameOpen}
        onClose={() => setCreateGameOpen(false)}
        categories={offeredCategories}
        colors={colors}
        onCreated={() => {
          setCreateGameOpen(false);
          toast('Game added.', 'success');
          load();
        }}
      />
    </View>
  );
}

function SectionCard({ children, colors }: { children: React.ReactNode; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.card}>{children}</View>;
}

function FeedSection({ items, onCompose, colors }: { items: OrgContentItem[]; onCompose: () => void; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <SectionCard colors={colors}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>Classroom feed</Text>
        <Pressable onPress={onCompose} hitSlop={8}>
          <Ionicons name="add-circle" size={22} color={colors.primaryRed} />
        </Pressable>
      </View>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>No classroom posts yet.</Text>
      ) : (
        items.map((item, i) => {
          const fileUrl = resolveMediaUrl(item.fileUrl);
          return (
            <View key={item.id} style={[styles.listItem, i > 0 && styles.listItemDivider]}>
              <Text style={styles.listItemName}>{item.title}</Text>
              {item.text ? <Text style={styles.listItemMeta}>{item.text}</Text> : null}
              {fileUrl ? (
                <Pressable style={styles.linkBtn} onPress={() => Linking.openURL(fileUrl)}>
                  <Ionicons name={item.type === 'video' ? 'play-circle-outline' : 'image-outline'} size={14} color={colors.primaryRed} />
                  <Text style={styles.linkBtnText}>{item.type === 'video' ? 'Play video' : 'View photo'}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}
    </SectionCard>
  );
}

function AnnouncementsSection({ items, onCompose, colors }: { items: OrgContentItem[]; onCompose: () => void; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <SectionCard colors={colors}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>Learning announcements</Text>
        <Pressable onPress={onCompose} hitSlop={8}>
          <Ionicons name="add-circle" size={22} color={colors.primaryRed} />
        </Pressable>
      </View>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>No learning announcements yet.</Text>
      ) : (
        items.map((item, i) => {
          const fileUrl = resolveMediaUrl(item.fileUrl);
          return (
            <View key={item.id} style={[styles.listItem, i > 0 && styles.listItemDivider]}>
              <Text style={styles.listItemName}>{item.title}</Text>
              {item.text ? <Text style={styles.listItemMeta}>{item.text}</Text> : null}
              {fileUrl ? (
                <Pressable style={styles.linkBtn} onPress={() => Linking.openURL(fileUrl)}>
                  <Ionicons name="document-text-outline" size={14} color={colors.primaryRed} />
                  <Text style={styles.linkBtnText}>Open document</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}
    </SectionCard>
  );
}

function RosterSection({
  members,
  emptyText,
  onPress,
  onLongPress,
  colors,
}: {
  members: OrgRosterMember[];
  emptyText: string;
  onPress: (m: OrgRosterMember) => void;
  onLongPress: (m: OrgRosterMember) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (members.length === 0) {
    return (
      <SectionCard colors={colors}>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </SectionCard>
    );
  }
  return (
    <SectionCard colors={colors}>
      {members.map((item, i) => (
        <Pressable key={item.id} style={[styles.rosterRow, i > 0 && styles.listItemDivider]} onPress={() => onPress(item)} onLongPress={() => onLongPress(item)}>
          <Avatar name={item.name} photoUrl={item.photoUrl} size={44} viewable={false} />
          <View style={{ flex: 1 }}>
            <Text style={styles.listItemName}>{item.name}</Text>
            <Text style={styles.listItemMeta}>{item.email}</Text>
          </View>
          <Ionicons name="chatbubble-outline" size={18} color={colors.primaryRed} />
        </Pressable>
      ))}
    </SectionCard>
  );
}

// Tutors render as a card grid, matching ngo-dashboard.html's own
// classroom-tutor-list (a centered avatar, status badge, name/email/course
// taken, Message action) - Students stay a plain list (RosterSection
// above), matching the web Classroom's own table-vs-grid split between the
// two pages.
function TutorCardGrid({
  members,
  onMessage,
  onViewProfile,
  colors,
}: {
  members: OrgRosterMember[];
  onMessage: (m: OrgRosterMember) => void;
  onViewProfile: (m: OrgRosterMember) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (members.length === 0) {
    return (
      <SectionCard colors={colors}>
        <Text style={styles.emptyText}>No tutors yet - generate a tutor code from Overview's Payment card.</Text>
      </SectionCard>
    );
  }
  return (
    <View style={styles.tutorGrid}>
      {members.map((item) => {
        const categories = item.profile?.categories?.length ? item.profile.categories.join(', ') : 'General';
        return (
          <Pressable key={item.id} style={styles.tutorCard} onPress={() => onViewProfile(item)}>
            <View style={styles.tutorCardTop}>
              <Avatar name={item.name} photoUrl={item.photoUrl} size={64} />
              <View style={[styles.badge, item.status === 'approved' ? styles.badgeActive : styles.badgePending]}>
                <Text style={[styles.badgeText, item.status === 'approved' ? styles.badgeTextActive : styles.badgeTextPending]}>{item.status || 'approved'}</Text>
              </View>
            </View>
            <Text style={styles.tutorFieldLabel}>Name</Text>
            <Text style={styles.tutorFieldValue} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.tutorFieldLabel}>Email</Text>
            <Text style={styles.tutorFieldValue} numberOfLines={1}>{item.email || '—'}</Text>
            <Text style={styles.tutorFieldLabel}>Course taken</Text>
            <Text style={styles.tutorFieldValue} numberOfLines={1}>{categories}</Text>
            <Pressable style={styles.tutorMessageBtn} onPress={() => onMessage(item)}>
              <Ionicons name="chatbubble-outline" size={14} color={colors.onPrimary} />
              <Text style={styles.tutorMessageBtnText}>Message</Text>
            </Pressable>
          </Pressable>
        );
      })}
    </View>
  );
}

function EventsSection({ events, onCreate, onJoinMeeting, colors }: { events: OrgEvent[]; onCreate: () => void; onJoinMeeting: (url: string) => void; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <SectionCard colors={colors}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>Events</Text>
        <Pressable onPress={onCreate} hitSlop={8}>
          <Ionicons name="add-circle" size={22} color={colors.primaryRed} />
        </Pressable>
      </View>
      {events.length === 0 ? (
        <Text style={styles.emptyText}>No events scheduled.</Text>
      ) : (
        events.map((event, i) => {
          const flyer = resolveMediaUrl(event.flyerUrl);
          return (
            <View key={event.id} style={[styles.listItem, i > 0 && styles.listItemDivider]}>
              {flyer ? <Image source={{ uri: flyer }} style={styles.eventFlyer} /> : null}
              <Text style={styles.listItemName}>{event.title}</Text>
              <Text style={styles.listItemMeta}>{new Date(event.scheduledAt).toLocaleString()}</Text>
              {event.description ? <Text style={styles.listItemMeta}>{event.description}</Text> : null}
              {event.meetLink ? (
                <Pressable style={styles.joinBtn} onPress={() => onJoinMeeting(event.meetLink!)}>
                  <Text style={styles.joinBtnText}>Join meeting</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}
    </SectionCard>
  );
}

function PerformanceSection({ performance, colors }: { performance: OrgPerformance | null; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <SectionCard colors={colors}>
      <Text style={styles.cardTitle}>Performance</Text>
      <Text style={styles.emptyText}>Live counts from your organization's lessons.</Text>
      <View style={styles.perfGrid}>
        <View style={styles.perfTile}>
          <Text style={styles.perfLabel}>Active lessons</Text>
          <Text style={styles.perfValue}>{performance?.activeLessons ?? 0}</Text>
        </View>
        <View style={styles.perfTile}>
          <Text style={styles.perfLabel}>Completed lessons</Text>
          <Text style={styles.perfValue}>{performance?.completedLessons ?? 0}</Text>
        </View>
        <View style={styles.perfTile}>
          <Text style={styles.perfLabel}>Organization members</Text>
          <Text style={styles.perfValue}>{performance?.memberCount ?? 0}</Text>
        </View>
      </View>
    </SectionCard>
  );
}

function GamesSection({
  leaderboard,
  customGames,
  onCreate,
  colors,
}: {
  leaderboard: LeaderboardEntry[];
  customGames: OrgContentItem[];
  onCreate: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      <SectionCard colors={colors}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Games</Text>
            <Text style={styles.emptyText}>One per instrument or course your organization offers.</Text>
          </View>
          <Pressable onPress={onCreate} hitSlop={8}>
            <Ionicons name="add-circle" size={22} color={colors.primaryRed} />
          </Pressable>
        </View>
        {customGames.length === 0 ? (
          <Text style={[styles.emptyText, { marginTop: 4 }]}>No games created yet.</Text>
        ) : (
          customGames.map((item, i) => (
            <View key={item.id} style={[styles.listItem, i > 0 && styles.listItemDivider]}>
              <Text style={styles.listItemName}>{item.title}{item.category ? ` · ${item.category}` : ''}</Text>
              {item.text ? <Text style={styles.listItemMeta}>{item.text}</Text> : null}
              {item.url ? (
                <Pressable style={styles.linkBtn} onPress={() => Linking.openURL(item.url!)}>
                  <Ionicons name="game-controller-outline" size={14} color={colors.primaryRed} />
                  <Text style={styles.linkBtnText}>Open game</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </SectionCard>

      <View style={{ height: 12 }} />

      <SectionCard colors={colors}>
        <Text style={styles.cardTitle}>Games leaderboard</Text>
        <Text style={styles.emptyText}>Best note-recognition scores from your students.</Text>
        {leaderboard.length === 0 ? (
          <Text style={[styles.emptyText, { marginTop: 12 }]}>No scores yet.</Text>
        ) : (
          leaderboard.map((entry, i) => (
            <View key={`${entry.studentUserId}-${entry.tier}`} style={[styles.listItem, styles.rankRow, i > 0 && styles.listItemDivider]}>
              <Text style={styles.rankIndex}>#{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.listItemName}>{entry.studentName}</Text>
                <Text style={styles.listItemMeta}>{entry.tier} · {new Date(entry.playedAt).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.rankScore}>{entry.score}</Text>
            </View>
          ))
        )}
      </SectionCard>
    </>
  );
}

function CreateEventSheet({
  visible,
  onClose,
  onCreated,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meetLink, setMeetLink] = useState('');
  const [flyer, setFlyer] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [when, setWhen] = useState(() => { const d = new Date(Date.now() + 60 * 60 * 1000); d.setMinutes(0, 0, 0); return d; });
  const [creating, setCreating] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setTitle('');
      setDescription('');
      setMeetLink('');
      setFlyer(null);
      const d = new Date(Date.now() + 60 * 60 * 1000);
      d.setMinutes(0, 0, 0);
      setWhen(d);
    }
  }, [visible]);

  async function pickFlyer() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast('Permission needed: allow photo library access.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const picked = result.assets[0];
    setFlyer({ uri: picked.uri, name: picked.fileName || 'flyer.jpg', type: picked.mimeType || 'image/jpeg' });
  }

  async function create() {
    if (!title.trim()) {
      toast('Enter an event title.', 'error');
      return;
    }
    setCreating(true);
    try {
      let flyerUrl: string | undefined;
      if (flyer) {
        const uploaded = await organizationsApi.uploadOrgMedia('photo', flyer);
        flyerUrl = uploaded.url;
      }
      await organizationsApi.createOrgEvent({
        title: title.trim(),
        startISO: when.toISOString(),
        durationMinutes: 60,
        meetLink: meetLink.trim() || undefined,
        description: description.trim() || undefined,
        flyerUrl,
      });
      onCreated();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not schedule that event.', 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Create an event</Text>
            <Text style={styles.emptyText}>A meeting, a recital, a gig, a flyer for general awareness - whatever fits.</Text>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Spring recital" placeholderTextColor={colors.textFaint} />
            <Text style={styles.fieldLabel}>Description (optional)</Text>
            <TextInput style={[styles.input, styles.textarea]} value={description} onChangeText={setDescription} placeholder="What's this event about?" placeholderTextColor={colors.textFaint} multiline />
            <Text style={styles.fieldLabel}>Date & time</Text>
            <View style={styles.dateStepRow}>
              <Pressable style={styles.dateStepBtn} onPress={() => setWhen(new Date(when.getTime() - 24 * 60 * 60000))}>
                <Text style={styles.dateStepBtnText}>− day</Text>
              </Pressable>
              <Text style={styles.dateStepValue}>{when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
              <Pressable style={styles.dateStepBtn} onPress={() => setWhen(new Date(when.getTime() + 24 * 60 * 60000))}>
                <Text style={styles.dateStepBtnText}>+ day</Text>
              </Pressable>
            </View>
            <View style={styles.dateStepRow}>
              <Pressable style={styles.dateStepBtn} onPress={() => setWhen(new Date(when.getTime() - 30 * 60000))}>
                <Text style={styles.dateStepBtnText}>− 30m</Text>
              </Pressable>
              <Text style={styles.dateStepValue}>{when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
              <Pressable style={styles.dateStepBtn} onPress={() => setWhen(new Date(when.getTime() + 30 * 60000))}>
                <Text style={styles.dateStepBtnText}>+ 30m</Text>
              </Pressable>
            </View>
            <Pressable style={styles.filePickBtn} onPress={pickFlyer}>
              <Ionicons name="image-outline" size={16} color={colors.primaryRed} />
              <Text style={styles.filePickBtnText} numberOfLines={1}>{flyer ? flyer.name : 'Add a flyer or photo (optional)'}</Text>
            </Pressable>
            <Text style={styles.fieldLabel}>Meeting link (optional - only if this is a call to join)</Text>
            <TextInput style={styles.input} value={meetLink} onChangeText={setMeetLink} placeholder="https://meet.google.com/..." placeholderTextColor={colors.textFaint} autoCapitalize="none" />
            <PrimaryButton title="Create event" onPress={create} loading={creating} style={{ marginTop: 18, marginBottom: 20 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// One game per instrument/course - the category picker is the union of
// every category this organization's own tutors teach (see
// offeredCategories above), not the whole platform-wide subject list, so
// it only ever offers what this institution actually teaches.
function CreateGameSheet({
  visible,
  onClose,
  categories,
  onCreated,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  categories: string[];
  onCreated: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [creating, setCreating] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setTitle('');
      setCategory(categories[0] || null);
      setUrl('');
      setInstructions('');
    }
  }, [visible, categories]);

  async function create() {
    if (!title.trim()) {
      toast('Enter a game title.', 'error');
      return;
    }
    if (!category) {
      toast('Choose which instrument or course this game is for.', 'error');
      return;
    }
    setCreating(true);
    try {
      await organizationsApi.createOrgContent({ type: 'game', title: title.trim(), category, url: url.trim() || undefined, text: instructions.trim() || undefined });
      onCreated();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not create that game.', 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Create a game</Text>
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Piano note match" placeholderTextColor={colors.textFaint} />
          <Text style={styles.fieldLabel}>Instrument or course</Text>
          {categories.length === 0 ? (
            <Text style={styles.emptyText}>No tutor categories yet - add a tutor first so there's something to pick from.</Text>
          ) : (
            <View style={styles.chipsWrap}>
              {categories.map((c) => {
                const active = category === c;
                return (
                  <Pressable key={c} style={[styles.categoryChip, active && styles.categoryChipActive]} onPress={() => setCategory(c)}>
                    <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Text style={styles.fieldLabel}>Game / activity URL</Text>
          <TextInput style={styles.input} value={url} onChangeText={setUrl} placeholder="https://example.com/game" placeholderTextColor={colors.textFaint} autoCapitalize="none" />
          <Text style={styles.fieldLabel}>Instructions</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={instructions}
            onChangeText={setInstructions}
            placeholder="How to play or access this game..."
            placeholderTextColor={colors.textFaint}
            multiline
          />
          <PrimaryButton title="Create game" onPress={create} loading={creating} style={{ marginTop: 18 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12 },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 20, fontFamily: fonts.displayBlack, color: colors.text },
    subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    shell: { flex: 1, flexDirection: 'row' },
    sidebar: {
      flexGrow: 0,
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderRightColor: colors.border,
    },
    sidebarOpen: { width: 150 },
    sidebarClosed: { width: 68 },
    sidebarToggle: { alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    sidebarContent: { paddingVertical: 10, paddingHorizontal: 8, gap: 6 },
    sidebarItem: {
      alignItems: 'center',
      gap: 6,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 6,
    },
    sidebarItemOpen: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 12 },
    sidebarItemActive: { backgroundColor: colors.primaryRed },
    sidebarItemText: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center', lineHeight: 16, flexShrink: 1 },
    sidebarItemTextActive: { color: colors.onPrimary },
    contentScroller: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingTop: 60, gap: 8 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    body: { padding: 16, paddingBottom: 40 },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 16,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    cardTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 4 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 8 },
    listItem: { paddingVertical: 12 },
    listItemDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    listItemName: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    listItemMeta: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 3 },
    linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
    linkBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    joinBtn: { backgroundColor: colors.primaryRed, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7, marginTop: 8, alignSelf: 'flex-start' },
    joinBtnText: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    perfGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
    perfTile: { flexGrow: 1, minWidth: '30%', backgroundColor: `${colors.primaryRed}0c`, borderRadius: 14, padding: 12, alignItems: 'center' },
    perfLabel: { fontSize: 10.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint, textTransform: 'uppercase', textAlign: 'center' },
    perfValue: { fontSize: 24, fontFamily: fonts.displayBlack, color: colors.primaryRed, marginTop: 6 },
    rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rankIndex: { fontSize: 13, fontFamily: fonts.displayBlack, color: colors.textFaint, width: 28 },
    rankScore: { fontSize: 15, fontFamily: fonts.displayBlack, color: colors.primaryRed },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    fieldLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 10, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
    },
    dateStepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background, borderRadius: 12, padding: 10, marginBottom: 8 },
    dateStepBtn: { paddingHorizontal: 10, paddingVertical: 6 },
    dateStepBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    dateStepValue: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    textarea: { minHeight: 80, textAlignVertical: 'top' },
    badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
    badgeActive: { backgroundColor: colors.statusActiveBg },
    badgePending: { backgroundColor: colors.statusPendingBg },
    badgeText: { fontSize: 10, fontFamily: fonts.bodyBold, textTransform: 'capitalize' },
    badgeTextActive: { color: colors.statusActiveText },
    badgeTextPending: { color: colors.statusPendingText },
    tutorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    tutorCard: {
      width: '47%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      padding: 14,
    },
    tutorCardTop: { alignItems: 'center', gap: 8, marginBottom: 10 },
    tutorFieldLabel: { fontSize: 9.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 6 },
    tutorFieldValue: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text, marginTop: 2 },
    tutorMessageBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.primaryRed,
      borderRadius: 10,
      paddingVertical: 9,
      marginTop: 12,
    },
    tutorMessageBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    categoryChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
    categoryChipActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    categoryChipText: { fontSize: 12.5, fontFamily: fonts.bodyMedium, color: colors.text },
    categoryChipTextActive: { color: colors.onPrimary },
    filePickBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: colors.background, borderRadius: 10, padding: 12 },
    filePickBtnText: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    eventFlyer: { width: '100%', height: 140, borderRadius: 12, marginBottom: 10, backgroundColor: colors.background },
  });
}

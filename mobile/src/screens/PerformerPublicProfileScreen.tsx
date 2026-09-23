import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../api/client';
import * as performersApi from '../api/performers';
import type { PerformerPost, PublicPerformerProfile } from '../api/performers';
import Avatar from '../components/Avatar';
import BackButton from '../components/BackButton';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'PerformerPublicProfile'>;

const SOCIAL_LINKS: { key: keyof PublicPerformerProfile['socialLinks']; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'instagram', label: 'Instagram', icon: 'logo-instagram' },
  { key: 'youtube', label: 'YouTube', icon: 'logo-youtube' },
  { key: 'tiktok', label: 'TikTok', icon: 'logo-tiktok' },
  { key: 'facebook', label: 'Facebook', icon: 'logo-facebook' },
  { key: 'twitter', label: 'X / Twitter', icon: 'logo-twitter' },
  { key: 'website', label: 'Website', icon: 'globe-outline' },
];

// Public, read-only portfolio: this is intentionally separate from the
// performer's dashboard editor. It always reloads the approved public record
// and filters the community feed down to this performer's own posts.
export default function PerformerPublicProfileScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { performerId } = route.params;
  const [profile, setProfile] = useState<PublicPerformerProfile | null>(null);
  const [posts, setPosts] = useState<PerformerPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [profileResult, postsResult] = await Promise.all([
        performersApi.fetchPublicPerformer(performerId),
        performersApi.fetchPerformerPosts(),
      ]);
      setProfile(profileResult.performer);
      setPosts(postsResult.posts.filter((post) => post.performer?.id === performerId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this performer’s profile.');
    }
  }, [performerId]);

  React.useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openLink(value: string) {
    const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    Linking.openURL(url).catch(() => setError('That link could not be opened.'));
  }

  if (loading) {
    return <View style={styles.screen}><Header onBack={() => navigation.goBack()} colors={colors} /><View style={styles.centered}><ActivityIndicator color={colors.primaryRed} /></View></View>;
  }

  if (error || !profile) {
    return (
      <View style={styles.screen}>
        <Header onBack={() => navigation.goBack()} colors={colors} />
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={34} color={colors.danger} />
          <Text style={styles.errorText}>{error || 'This performer is not available.'}</Text>
          <Pressable style={styles.retryButton} onPress={() => { setLoading(true); load().finally(() => setLoading(false)); }}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const location = [profile.city, profile.locality?.state, profile.locality?.country].filter(Boolean).join(', ');
  const validLinks = SOCIAL_LINKS.filter((item) => Boolean(profile.socialLinks?.[item.key]));

  return (
    <View style={styles.screen}>
      <Header onBack={() => navigation.goBack()} colors={colors} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primaryRed} />}
      >
        <View style={styles.heroCard}>
          <Avatar name={profile.name} photoUrl={profile.photoUrl} size={92} />
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.type}>{profile.performerType === 'group' ? 'Performance group' : 'Performer'}{profile.groupSize ? ` · ${profile.groupSize} members` : ''}</Text>
          {location ? <View style={styles.locationRow}><Ionicons name="location-outline" size={15} color={colors.textFaint} /><Text style={styles.location}>{location}</Text></View> : null}
          {profile.categories.length ? <View style={styles.tagRow}>{profile.categories.map((item) => <View key={item} style={styles.tag}><Text style={styles.tagText}>{item}</Text></View>)}</View> : null}
          <View style={styles.ratesRow}>
            {Number(profile.eventRateLocal) > 0 ? <RatePill label="Per event" amount={profile.eventRateLocal} profile={profile} colors={colors} /> : null}
            {Number(profile.hourlyRateLocal) > 0 ? <RatePill label="Per hour" amount={profile.hourlyRateLocal} profile={profile} colors={colors} /> : null}
          </View>
        </View>

        <SectionTitle title="About" />
        <View style={styles.sectionCard}>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : <Text style={styles.emptyText}>This performer has not added an introduction yet.</Text>}
          {profile.experienceYears ? <MetaRow icon="ribbon-outline" text={`${profile.experienceYears} year${profile.experienceYears === 1 ? '' : 's'} of experience`} colors={colors} /> : null}
          {profile.qualifications ? <MetaRow icon="school-outline" text={profile.qualifications} colors={colors} /> : null}
          {profile.styleTags?.length ? <View style={styles.styleTags}>{profile.styleTags.map((tag) => <Text key={tag} style={styles.styleTag}>#{tag}</Text>)}</View> : null}
        </View>

        <SectionTitle title="Gallery" />
        {profile.galleryPhotos.length ? (
          <View style={styles.photoGrid}>
            {profile.galleryPhotos.map((url, index) => {
              const source = resolveMediaUrl(url);
              return source ? <Image key={`${url}-${index}`} source={{ uri: source }} style={styles.photo} resizeMode="cover" /> : null;
            })}
          </View>
        ) : <EmptyMedia label="No gallery photos yet." icon="images-outline" colors={colors} />}

        <SectionTitle title="Video clips" />
        {profile.videoClips.length ? profile.videoClips.map((url, index) => (
          <Pressable key={`${url}-${index}`} style={styles.videoCard} onPress={() => openLink(resolveMediaUrl(url) || url)}>
            <View style={styles.playCircle}><Ionicons name="play" size={18} color={colors.onPrimary} /></View>
            <View style={{ flex: 1 }}><Text style={styles.videoTitle}>Performance clip {index + 1}</Text><Text style={styles.videoHint}>Tap to watch</Text></View>
            <Ionicons name="open-outline" size={18} color={colors.textFaint} />
          </Pressable>
        )) : <EmptyMedia label="No video clips yet." icon="videocam-outline" colors={colors} />}

        <SectionTitle title="Latest posts" />
        {posts.length ? posts.map((post) => <PortfolioPost key={post.id} post={post} onOpenVideo={openLink} colors={colors} />) : <EmptyMedia label="No public posts yet." icon="chatbubbles-outline" colors={colors} />}

        {validLinks.length ? <>
          <SectionTitle title="Find them online" />
          <View style={styles.sectionCard}>
            {validLinks.map((item, index) => {
              const value = profile.socialLinks[item.key];
              if (!value) return null;
              return <Pressable key={item.key} style={[styles.linkRow, index > 0 && styles.linkBorder]} onPress={() => openLink(value)}>
                <Ionicons name={item.icon} size={20} color={colors.primaryRed} />
                <Text style={styles.linkText}>{item.label}</Text>
                <Ionicons name="open-outline" size={17} color={colors.textFaint} />
              </Pressable>;
            })}
          </View>
        </> : null}
      </ScrollView>
    </View>
  );
}

function Header({ onBack, colors }: { onBack: () => void; colors: ThemeColors }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, gap: 12 }}><BackButton onPress={onBack} /><Text style={{ flex: 1, fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text }}>Performer profile</Text></View>;
}

function SectionTitle({ title }: { title: string }) {
  const { colors } = useTheme();
  return <Text style={{ fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 24, marginBottom: 10 }}>{title}</Text>;
}

function RatePill({ label, amount, profile, colors }: { label: string; amount: number; profile: PublicPerformerProfile; colors: ThemeColors }) {
  return <View style={{ flex: 1, backgroundColor: `${colors.primaryRed}12`, borderRadius: 14, padding: 10, alignItems: 'center' }}><Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.primaryRed }}>{profile.symbol || '$'}{Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text><Text style={{ fontFamily: fonts.body, fontSize: 10.5, color: colors.textFaint, marginTop: 2 }}>{label} · {profile.currency}</Text></View>;
}

function MetaRow({ icon, text, colors }: { icon: keyof typeof Ionicons.glyphMap; text: string; colors: ThemeColors }) {
  return <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 12 }}><Ionicons name={icon} size={17} color={colors.primaryRed} /><Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.textSoft }}>{text}</Text></View>;
}

function EmptyMedia({ label, icon, colors }: { label: string; icon: keyof typeof Ionicons.glyphMap; colors: ThemeColors }) {
  return <View style={{ minHeight: 94, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 7, padding: 16 }}><Ionicons name={icon} size={24} color={colors.textFaint} /><Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: colors.textFaint }}>{label}</Text></View>;
}

function PortfolioPost({ post, onOpenVideo, colors }: { post: PerformerPost; onOpenVideo: (url: string) => void; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mediaSource = post.mediaUrl ? resolveMediaUrl(post.mediaUrl) : null;
  return <View style={styles.postCard}>
    <Text style={styles.postDate}>{new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
    {post.text ? <Text style={styles.postText}>{post.text}</Text> : null}
    {mediaSource && post.mediaType === 'image' ? <Image source={{ uri: mediaSource }} style={styles.postImage} resizeMode="cover" /> : null}
    {mediaSource && post.mediaType === 'video' ? <Pressable style={styles.postVideo} onPress={() => onOpenVideo(mediaSource)}><Ionicons name="play-circle" size={30} color={colors.primaryRed} /><Text style={styles.videoTitle}>Watch performance video</Text></Pressable> : null}
    <View style={styles.postStats}><Ionicons name="heart-outline" size={15} color={colors.textFaint} /><Text style={styles.statText}>{post.reactionCount} reaction{post.reactionCount === 1 ? '' : 's'}</Text><Ionicons name="chatbubble-outline" size={14} color={colors.textFaint} /><Text style={styles.statText}>{post.comments.length} comment{post.comments.length === 1 ? '' : 's'}</Text></View>
  </View>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 12 },
    errorText: { fontFamily: fonts.bodySemiBold, color: colors.danger, textAlign: 'center', lineHeight: 19 },
    retryButton: { paddingVertical: 9, paddingHorizontal: 15, borderRadius: 10, backgroundColor: colors.primaryRed },
    retryText: { fontFamily: fonts.bodyBold, color: colors.onPrimary, fontSize: 12.5 },
    heroCard: { alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 20 },
    name: { fontSize: 21, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 11, textAlign: 'center' },
    type: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 4 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 },
    location: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, flexShrink: 1 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 13 },
    tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${colors.primaryRed}12` },
    tagText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.primaryRed },
    ratesRow: { flexDirection: 'row', alignSelf: 'stretch', gap: 8, marginTop: 16 },
    sectionCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 15 },
    bio: { fontSize: 13.5, fontFamily: fonts.body, color: colors.text, lineHeight: 20 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center' },
    styleTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 },
    styleTag: { fontFamily: fonts.bodySemiBold, color: colors.textSoft, fontSize: 11.5, backgroundColor: colors.background, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    photo: { width: '31.7%', aspectRatio: 1, borderRadius: 12, backgroundColor: colors.surface },
    videoCard: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 66, padding: 12, marginBottom: 8, backgroundColor: colors.surface, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
    playCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryRed, alignItems: 'center', justifyContent: 'center' },
    videoTitle: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    videoHint: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    postCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 10, overflow: 'hidden' },
    postDate: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint },
    postText: { fontSize: 13.5, fontFamily: fonts.body, color: colors.text, lineHeight: 20, marginTop: 8 },
    postImage: { width: '100%', height: 210, borderRadius: 12, marginTop: 11, backgroundColor: colors.background },
    postVideo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11, padding: 12, backgroundColor: colors.background, borderRadius: 12 },
    postStats: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border },
    statText: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginRight: 7 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
    linkBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    linkText: { flex: 1, fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  });
}

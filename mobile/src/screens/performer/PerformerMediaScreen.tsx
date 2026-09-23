import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../../api/client';
import * as performersApi from '../../api/performers';
import type { MyPerformerProfile, PerformerPost } from '../../api/performers';
import PerformerHeader from '../../components/PerformerHeader';
import PrimaryButton from '../../components/PrimaryButton';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { PerformerTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<PerformerTabParamList, 'Media'>;

const SOCIAL_FIELDS: { key: keyof MyPerformerProfile['socialLinks']; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'instagram', label: 'Instagram', icon: 'logo-instagram' },
  { key: 'youtube', label: 'YouTube', icon: 'logo-youtube' },
  { key: 'tiktok', label: 'TikTok', icon: 'logo-tiktok' },
  { key: 'facebook', label: 'Facebook', icon: 'logo-facebook' },
  { key: 'twitter', label: 'X / Twitter', icon: 'logo-twitter' },
  { key: 'website', label: 'Website', icon: 'globe-outline' },
];

function isPublicHttpUrl(value: string) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// Gallery photos + video clips + social links, all on one tab - the web
// mockup that drove this tab set folds "Social" into "Media" explicitly,
// so social links live here rather than on the Profile tab performer.html
// itself puts them on.
export default function PerformerMediaScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast, confirm } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<MyPerformerProfile | null>(null);
  const [posts, setPosts] = useState<PerformerPost[]>([]);
  const [postText, setPostText] = useState('');
  const [postingText, setPostingText] = useState(false);
  const [links, setLinks] = useState<MyPerformerProfile['socialLinks']>({
    instagram: null, youtube: null, tiktok: null, website: null, facebook: null, twitter: null,
  });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoLink, setVideoLink] = useState('');
  const [addingVideoLink, setAddingVideoLink] = useState(false);
  const [savingLinks, setSavingLinks] = useState(false);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [res, postsRes] = await Promise.all([performersApi.fetchMyPerformerProfile(), performersApi.fetchMyPerformerPosts()]);
      setProfile(res.profile);
      setPosts(postsRes.posts);
      if (res.profile) setLinks(res.profile.socialLinks);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your media.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function addPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast('Permission needed: allow photo library access to add photos.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const uploaded = await performersApi.uploadPerformerPhoto({ uri: asset.uri, name: asset.fileName || 'photo.jpg', type: asset.mimeType || 'image/jpeg' });
      const [res, postRes] = await Promise.all([
        performersApi.addPerformerGalleryPhoto(uploaded.url),
        performersApi.createPerformerPost({ text: postText.trim(), mediaUrl: uploaded.url, mediaType: 'image' }),
      ]);
      setProfile(res.profile);
      setPosts((current) => [postRes.post, ...current]);
      setPostText('');
      toast('Photo and caption shared to Find a Performer.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not add that photo.', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto(url: string) {
    const ok = await confirm({ title: 'Remove photo?', message: 'This photo will be removed from your gallery.', confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    setBusyUrl(url);
    try {
      const res = await performersApi.removePerformerGalleryPhoto(url);
      setProfile(res.profile);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not remove that photo.', 'error');
    } finally {
      setBusyUrl(null);
    }
  }

  async function addVideo() {
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true });
    } catch {
      toast('Could not open the file picker. Try again in a moment.', 'error');
      return;
    }
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingVideo(true);
    try {
      const uploaded = await performersApi.uploadPerformerVideo({ uri: asset.uri, name: asset.name, type: asset.mimeType || 'video/mp4' });
      const [res, postRes] = await Promise.all([
        performersApi.addPerformerVideo(uploaded.url),
        performersApi.createPerformerPost({ text: postText.trim(), mediaUrl: uploaded.url, mediaType: 'video' }),
      ]);
      setProfile(res.profile);
      setPosts((current) => [postRes.post, ...current]);
      setPostText('');
      toast('Video and caption shared to Find a Performer.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not add that video.', 'error');
    } finally {
      setUploadingVideo(false);
    }
  }

  async function removeVideo(url: string) {
    const ok = await confirm({ title: 'Remove video?', message: 'This clip will be removed from your gallery.', confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    setBusyUrl(url);
    try {
      const res = await performersApi.removePerformerVideo(url);
      setProfile(res.profile);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not remove that video.', 'error');
    } finally {
      setBusyUrl(null);
    }
  }

  async function addVideoLink() {
    const url = videoLink.trim();
    if (!isPublicHttpUrl(url)) {
      toast('Enter a valid public http(s) video link.', 'error');
      return;
    }
    setAddingVideoLink(true);
    try {
      const profileResult = await performersApi.addPerformerVideo(url);
      const postResult = await performersApi.createPerformerPost({ text: postText.trim(), mediaUrl: url, mediaType: 'video' });
      setProfile(profileResult.profile);
      setPosts((current) => [postResult.post, ...current]);
      setPostText('');
      setVideoLink('');
      toast('Video link posted to Find a Performer.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not add that video link.', 'error');
    } finally {
      setAddingVideoLink(false);
    }
  }

  function openVideo(url: string) {
    const destination = resolveMediaUrl(url);
    if (destination) Linking.openURL(destination).catch(() => toast('That video link could not be opened.', 'error'));
  }

  async function saveLinks() {
    setSavingLinks(true);
    try {
      const res = await performersApi.setPerformerSocialLinks(links);
      setProfile(res.profile);
      toast('Social links saved.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save your social links.', 'error');
    } finally {
      setSavingLinks(false);
    }
  }

  async function publishText() {
    if (!postText.trim()) return toast('Write something to share first.', 'error');
    setPostingText(true);
    try {
      const result = await performersApi.createPerformerPost({ text: postText.trim() });
      setPosts((current) => [result.post, ...current]);
      setPostText('');
      toast('Update shared to Find a Performer.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not share that update.', 'error');
    } finally {
      setPostingText(false);
    }
  }

  async function removePost(post: PerformerPost) {
    const ok = await confirm({ title: 'Remove post?', message: 'This will remove the post and its comments from Find a Performer.', confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    setBusyUrl(`post-${post.id}`);
    try {
      await performersApi.removePerformerPost(post.id);
      setPosts((current) => current.filter((item) => item.id !== post.id));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not remove that post.', 'error');
    } finally {
      setBusyUrl(null);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <PerformerHeader
        profile={profile}
        fallbackName={user?.name}
        fallbackPhoto={user?.photoUrl}
        onNotifications={() => navigation.getParent()?.navigate('Notifications')}
        onProfile={() => navigation.getParent()?.navigate('Profile')}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error || !profile ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || 'No performer profile found.'}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryRed} />}
        >
          <Text style={styles.sectionTitle}>Share your work</Text>
          <Text style={styles.shareHint}>Add a caption, then share it by itself or with a photo or video. Posts appear in Find a Performer.</Text>
          <TextInput
            style={[styles.input, styles.postInput]}
            value={postText}
            onChangeText={setPostText}
            placeholder="Tell people about this performance..."
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={1500}
          />
          <View style={styles.postActionRow}>
            <Pressable style={styles.postMediaButton} onPress={addPhoto} disabled={uploadingPhoto}>
              {uploadingPhoto ? <ActivityIndicator size="small" color={colors.primaryRed} /> : <><Ionicons name="image-outline" size={18} color={colors.primaryRed} /><Text style={styles.postMediaText}>Photo</Text></>}
            </Pressable>
            <Pressable style={styles.postMediaButton} onPress={addVideo} disabled={uploadingVideo}>
              {uploadingVideo ? <ActivityIndicator size="small" color={colors.primaryRed} /> : <><Ionicons name="videocam-outline" size={18} color={colors.primaryRed} /><Text style={styles.postMediaText}>Video</Text></>}
            </Pressable>
            <Pressable style={styles.shareButton} onPress={publishText} disabled={postingText}>
              {postingText ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <><Ionicons name="send" size={15} color={colors.onPrimary} /><Text style={styles.shareButtonText}>Share</Text></>}
            </Pressable>
          </View>
          {posts.length ? (
            <View style={styles.postsList}>
              <Text style={styles.subsectionTitle}>Your public posts</Text>
              {posts.map((post) => (
                <View key={post.id} style={styles.postCard}>
                  {post.mediaUrl && post.mediaType === 'image' ? <Image source={{ uri: resolveMediaUrl(post.mediaUrl)! }} style={styles.postImage} /> : null}
                  {post.mediaUrl && post.mediaType === 'video' ? <Pressable style={styles.postVideo} onPress={() => openVideo(post.mediaUrl!)}><Ionicons name="play-circle" size={26} color={colors.primaryRed} /><Text style={styles.videoLabel}>{isPublicHttpUrl(post.mediaUrl) ? 'Open performance link' : 'Open performance video'}</Text></Pressable> : null}
                  {post.text ? <Text style={styles.postText}>{post.text}</Text> : null}
                  <View style={styles.postFoot}><Text style={styles.postMeta}>{post.reactionCount} reactions · {post.comments.length} comments</Text><Pressable onPress={() => removePost(post)} disabled={busyUrl === `post-${post.id}`}>{busyUrl === `post-${post.id}` ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="trash-outline" size={17} color={colors.danger} />}</Pressable></View>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Gallery photos</Text>
            <Pressable onPress={addPhoto} disabled={uploadingPhoto} hitSlop={8}>
              {uploadingPhoto ? <ActivityIndicator size="small" color={colors.primaryRed} /> : <Text style={styles.addLink}>+ Add photo</Text>}
            </Pressable>
          </View>
          {profile.galleryPhotos.length === 0 ? (
            <Text style={styles.emptyText}>No photos yet.</Text>
          ) : (
            <View style={styles.gridRow}>
              {profile.galleryPhotos.map((url) => (
                <View key={url} style={styles.gridThumbWrap}>
                  <Image source={{ uri: resolveMediaUrl(url)! }} style={styles.gridThumb} />
                  <Pressable style={styles.removeBtn} onPress={() => removePhoto(url)} disabled={busyUrl === url}>
                    {busyUrl === url ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="close" size={12} color="#fff" />}
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Video clips</Text>
            <Pressable onPress={addVideo} disabled={uploadingVideo} hitSlop={8}>
              {uploadingVideo ? <ActivityIndicator size="small" color={colors.primaryRed} /> : <Text style={styles.addLink}>+ Add video</Text>}
            </Pressable>
          </View>
          <Text style={styles.videoLinkHint}>Or post a public video link. It will be clickable in Find a Performer.</Text>
          <View style={styles.videoLinkRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={videoLink}
              onChangeText={setVideoLink}
              placeholder="https://youtube.com/..."
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Pressable style={[styles.addVideoLinkButton, addingVideoLink && { opacity: 0.65 }]} onPress={addVideoLink} disabled={addingVideoLink}>
              {addingVideoLink ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Text style={styles.addVideoLinkText}>Post link</Text>}
            </Pressable>
          </View>
          {profile.videoClips.length === 0 ? (
            <Text style={styles.emptyText}>No video clips yet.</Text>
          ) : (
            profile.videoClips.map((url, i) => (
              <View key={url} style={[styles.videoRow, i > 0 && { marginTop: 8 }]}>
                <Pressable style={styles.videoOpenBtn} onPress={() => openVideo(url)}>
                  <Ionicons name={isPublicHttpUrl(url) ? 'link-outline' : 'play-circle'} size={20} color={colors.primaryRed} />
                  <Text style={styles.videoLabel} numberOfLines={1}>{isPublicHttpUrl(url) ? `Video link ${i + 1}` : `Clip ${i + 1}`}</Text>
                </Pressable>
                <Pressable onPress={() => removeVideo(url)} disabled={busyUrl === url} hitSlop={8}>
                  {busyUrl === url ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="trash-outline" size={17} color={colors.danger} />}
                </Pressable>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Social links</Text>
          {SOCIAL_FIELDS.map((field) => (
            <View key={field.key} style={styles.linkRow}>
              <Ionicons name={field.icon} size={18} color={colors.textFaint} style={{ width: 24 }} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={links[field.key] || ''}
                onChangeText={(v) => setLinks((prev) => ({ ...prev, [field.key]: v }))}
                placeholder={field.label}
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
              />
            </View>
          ))}
          <PrimaryButton title="Save social links" onPress={saveLinks} loading={savingLinks} style={{ marginTop: 12 }} />
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    content: { padding: 20, paddingBottom: 40 },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
    sectionTitle: { fontSize: 15, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 18, marginBottom: 10 },
    subsectionTitle: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 8 },
    shareHint: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, lineHeight: 18, marginTop: -4, marginBottom: 10 },
    postInput: { minHeight: 82, textAlignVertical: 'top' },
    postActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
    postMediaButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 39, paddingHorizontal: 11, borderRadius: 10, backgroundColor: `${colors.primaryRed}10`, borderWidth: 1, borderColor: `${colors.primaryRed}33` },
    postMediaText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    shareButton: { flex: 1, minHeight: 39, borderRadius: 10, backgroundColor: colors.primaryRed, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
    shareButtonText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    postsList: { marginTop: 18 },
    postCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', padding: 12, marginBottom: 9 },
    postImage: { width: '100%', height: 170, borderRadius: 10, backgroundColor: colors.background, marginBottom: 9 },
    postVideo: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.background, padding: 12, borderRadius: 10, marginBottom: 9 },
    postText: { fontSize: 13, fontFamily: fonts.body, color: colors.text, lineHeight: 19 },
    postFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
    postMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint },
    addLink: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    gridThumbWrap: { position: 'relative' },
    gridThumb: { width: 84, height: 84, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    removeBtn: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    videoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    videoOpenBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    videoLabel: { fontSize: 13.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    videoLinkHint: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginBottom: 8, lineHeight: 16 },
    videoLinkRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    addVideoLinkButton: { minWidth: 80, borderRadius: 12, backgroundColor: colors.primaryRed, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
    addVideoLinkText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 13.5,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
  });
}

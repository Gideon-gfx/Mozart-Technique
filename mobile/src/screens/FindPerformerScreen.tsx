import { FlatList, ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Linking, Modal, Platform, StyleSheet, Text, TextInput, View,  } from 'react-native';

import { ApiError, resolveMediaUrl } from '../api/client';
import * as performersApi from '../api/performers';
import type { MarketplaceEventMedia, PerformerPost, PerformerSummary } from '../api/performers';
import Avatar from '../components/Avatar';
import BackButton from '../components/BackButton';
import PrimaryButton from '../components/PrimaryButton';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'FindPerformer'>;

// Mirrors find-performer.html: browse approved performers by category, or
// post a broadcast event request that invites every matching performer
// within a radius to respond (the same InDrive-style negotiate pattern
// FindTutorScreen's own "Smart Match" uses) - entirely native, no redirect
// to the web page.
export default function FindPerformerScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [performers, setPerformers] = useState<PerformerSummary[]>([]);
  const [posts, setPosts] = useState<PerformerPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestTarget, setRequestTarget] = useState<PerformerSummary | null>(null);
  const [commentFor, setCommentFor] = useState<PerformerPost | null>(null);

  function openBroadcastRequest() {
    setRequestTarget(null);
    setRequestOpen(true);
  }

  function openTargetedRequest(performer: PerformerSummary) {
    setRequestTarget(performer);
    setRequestOpen(true);
  }

  useEffect(() => {
    performersApi.fetchPerformerCategories().then((data) => setCategories(data.categories)).catch(() => {});
  }, []);

  const load = useCallback(async (nextCategory: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [performerData, postData] = await Promise.all([
        performersApi.fetchPerformers(nextCategory || undefined),
        performersApi.fetchPerformerPosts(),
      ]);
      setPerformers(performerData.performers);
      setPosts(postData.posts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load performers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSelectChip(next: string | null) {
    setCategory(next);
    load(next);
  }

  function replacePost(updated: PerformerPost) {
    setPosts((current) => current.map((post) => post.id === updated.id ? updated : post));
  }

  async function toggleReaction(post: PerformerPost) {
    try {
      const result = await performersApi.togglePerformerPostReaction(post.id);
      replacePost(result.post);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not react to that post.');
    }
  }

  async function sendComment(postId: number, text: string) {
    try {
      const result = await performersApi.addPerformerPostComment(postId, text);
      replacePost(result.post);
    } catch (err) {
      throw err instanceof ApiError ? err : new Error('Could not send that comment.');
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Find a Performer</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.postCard}>
          <View style={styles.postIcon}>
            <Ionicons name="megaphone" size={20} color={colors.primaryRed} />
          </View>
          <Text style={styles.postTitle}>Planning an event?</Text>
          <Text style={styles.postSub}>Post what you need and every matching performer nearby gets invited to respond with an offer.</Text>
          <PrimaryButton title="Request a Performer" onPress={openBroadcastRequest} style={styles.postBtn} />
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
          data={categories}
          keyExtractor={(c) => c}
          renderItem={({ item }) => {
            const active = category === item;
            return (
              <Pressable
                style={[styles.chip, active && { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed }]}
                onPress={() => onSelectChip(active ? null : item)}
              >
                <Text style={[styles.chipText, active && { color: colors.onPrimary }]}>{item}</Text>
              </Pressable>
            );
          }}
        />

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Browse performers</Text>
          {!loading ? <Text style={styles.sectionCount}>{performers.length}</Text> : null}
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primaryRed} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : performers.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No performers match yet - try a different category.</Text>
          </View>
        ) : (
          performers.map((p) => (
            <PerformerCard
              key={p.id}
              performer={p}
              colors={colors}
              onPress={() => navigation.navigate('PerformerPublicProfile', { performerId: p.id })}
              onRequest={() => openTargetedRequest(p)}
            />
          ))
        )}

        <View style={styles.feedHeading}>
          <View>
            <Text style={styles.sectionTitle}>Performer community</Text>
            <Text style={styles.feedHint}>Watch recent work, react, and start a conversation.</Text>
          </View>
          <View style={styles.feedBadge}><Ionicons name="people" size={15} color={colors.primaryRed} /></View>
        </View>
        {posts.length === 0 ? (
          <View style={styles.feedEmpty}>
            <Ionicons name="images-outline" size={25} color={colors.textFaint} />
            <Text style={styles.emptyText}>Performers’ photos, videos, and updates will appear here.</Text>
          </View>
        ) : posts.map((post) => (
          <PerformerPostCard key={post.id} post={post} colors={colors} onReact={() => toggleReaction(post)} onComment={() => setCommentFor(post)} />
        ))}
      </ScrollView>

      <RequestSheet
        visible={requestOpen}
        onClose={() => setRequestOpen(false)}
        categories={categories}
        target={requestTarget}
        colors={colors}
      />
      <CommentsSheet visible={!!commentFor} post={commentFor} onClose={() => setCommentFor(null)} onSend={sendComment} colors={colors} />
    </View>
  );
}

function PerformerCard({
  performer,
  colors,
  onPress,
  onRequest,
}: {
  performer: PerformerSummary;
  colors: ThemeColors;
  onPress: () => void;
  onRequest: () => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const subtitle = [performer.categories[0], performer.city].filter(Boolean).join(' · ');
  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${performer.name}'s performer profile`}>
      <View style={styles.cardTopRow}>
        <Avatar name={performer.name} photoUrl={performer.photoUrl} size={56} />
        <View style={styles.cardIdentity}>
          <Text style={styles.cardName}>{performer.name}</Text>
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
          {performer.experienceYears ? <Text style={styles.cardMeta}>{performer.experienceYears} yrs experience</Text> : null}
        </View>
        <View style={styles.pricePill}>
          {Number(performer.eventRateLocal) > 0 ? <Text style={styles.pricePillText}>{performer.symbol || '$'}{Number(performer.eventRateLocal).toLocaleString(undefined, { maximumFractionDigits: 2 })}/event</Text> : null}
          {Number(performer.hourlyRateLocal) > 0 ? <Text style={styles.pricePillSecondary}>{performer.symbol || '$'}{Number(performer.hourlyRateLocal).toLocaleString(undefined, { maximumFractionDigits: 2 })}/hr</Text> : null}
          {performer.currency ? <Text style={styles.priceCurrency}>{performer.currency}</Text> : null}
        </View>
      </View>
      {performer.bio ? <Text style={styles.cardBio} numberOfLines={2}>{performer.bio}</Text> : null}
      <View style={styles.cardActionsRow}>
        <View style={styles.openProfileRow}>
          <Text style={styles.openProfileText}>View profile & media</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.primaryRed} />
        </View>
        <Pressable
          style={styles.requestBtn}
          onPress={(e) => {
            e.stopPropagation();
            onRequest();
          }}
        >
          <Ionicons name="paper-plane-outline" size={13} color={colors.onPrimary} />
          <Text style={styles.requestBtnText}>Request</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function PerformerPostCard({ post, colors, onReact, onComment }: { post: PerformerPost; colors: ThemeColors; onReact: () => void; onComment: () => void }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const performer = post.performer;
  if (!performer) return null;
  return (
    <View style={styles.feedCard}>
      <View style={styles.feedAuthorRow}>
        <Avatar name={performer.name} photoUrl={performer.photoUrl} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={styles.feedAuthorName}>{performer.name}</Text>
          <Text style={styles.feedAuthorMeta}>{[performer.categories?.[0], performer.city].filter(Boolean).join(' · ') || 'Performer'} · {new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
        </View>
        <Ionicons name="musical-notes" size={18} color={colors.primaryRed} />
      </View>
      {post.text ? <Text style={styles.feedText}>{post.text}</Text> : null}
      {post.mediaUrl && post.mediaType === 'image' ? <Image source={{ uri: resolveMediaUrl(post.mediaUrl)! }} style={styles.feedImage} resizeMode="cover" /> : null}
      {post.mediaUrl && post.mediaType === 'video' ? (
        <Pressable style={styles.feedVideo} onPress={() => Linking.openURL(resolveMediaUrl(post.mediaUrl)!)}>
          <Ionicons name="play-circle" size={38} color={colors.onPrimary} />
          <Text style={styles.feedVideoText}>Watch performance video</Text>
        </Pressable>
      ) : null}
      <View style={styles.feedActions}>
        <Pressable style={styles.feedAction} onPress={onReact}>
          <Ionicons name={post.reactedByCurrentUser ? 'heart' : 'heart-outline'} size={20} color={post.reactedByCurrentUser ? colors.primaryRed : colors.textSoft} />
          <Text style={[styles.feedActionText, post.reactedByCurrentUser && { color: colors.primaryRed }]}>{post.reactionCount || 'React'}</Text>
        </Pressable>
        <Pressable style={styles.feedAction} onPress={onComment}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.textSoft} />
          <Text style={styles.feedActionText}>{post.comments.length || 'Comment'}</Text>
        </Pressable>
      </View>
      {post.comments.slice(-2).map((comment) => (
        <View key={comment.id} style={styles.previewComment}>
          <Text style={styles.previewCommentName}>{comment.userName}</Text><Text style={styles.previewCommentText}> {comment.text}</Text>
        </View>
      ))}
    </View>
  );
}

function CommentsSheet({ visible, post, onClose, onSend, colors }: { visible: boolean; post: PerformerPost | null; onClose: () => void; onSend: (postId: number, text: string) => Promise<void>; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  async function submit() {
    if (!post || !text.trim()) return;
    setSending(true);
    try { await onSend(post.id, text.trim()); setText(''); onClose(); } finally { setSending(false); }
  }
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.sheetBackdropTouch} onPress={onClose} />
        <View style={styles.commentsSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.commentsTitle}>Comments</Text>
          <ScrollView style={styles.commentsList} contentContainerStyle={{ gap: 12 }}>
            {post?.comments.length ? post.comments.map((comment) => (
              <View key={comment.id} style={styles.commentRow}>
                <Avatar name={comment.userName} photoUrl={comment.userPhotoUrl} size={30} />
                <View style={styles.commentBubble}><Text style={styles.previewCommentName}>{comment.userName}</Text><Text style={styles.commentText}>{comment.text}</Text></View>
              </View>
            )) : <Text style={styles.emptyText}>Be the first to comment.</Text>}
          </ScrollView>
          <View style={styles.commentInputRow}>
            <TextInput style={styles.commentInput} value={text} onChangeText={setText} placeholder="Write a comment" placeholderTextColor={colors.textFaint} multiline maxLength={600} />
            <Pressable style={styles.commentSend} onPress={submit} disabled={sending || !text.trim()}>{sending ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Ionicons name="send" size={18} color={colors.onPrimary} />}</Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const EVENT_LOCATION_PLACEHOLDER = 'City, address...';

function RequestSheet({
  visible,
  onClose,
  categories,
  target,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  categories: string[];
  // When set, this request skips the broadcast radius match entirely and
  // invites only this one performer - opened from their card/profile's own
  // "Request" button rather than the general "Request a Performer" one.
  target?: PerformerSummary | null;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [performerCategory, setPerformerCategory] = useState<string | null>(null);
  const [eventType, setEventType] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState('');
  const [durationHours, setDurationHours] = useState('3');
  const [location, setLocation] = useState('');
  const [radiusKm, setRadiusKm] = useState('25');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [eventMedia, setEventMedia] = useState<MarketplaceEventMedia[]>([]);
  const [eventLink, setEventLink] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [suggestedRate, setSuggestedRate] = useState<{ amountLocal: number; symbol: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ invitedCount: number; locationResolved: boolean } | null>(null);

  useEffect(() => {
    performersApi.fetchEventTypes().then((data) => setEventTypes(data.eventTypes)).catch(() => {});
  }, []);

  useEffect(() => {
    if (visible) {
      setPerformerCategory(target?.categories[0] || null);
      setEventType(null);
      setEventDate('');
      setDurationHours('3');
      setLocation('');
      setRadiusKm('25');
      setAmount('');
      setPhone('');
      setNotes('');
      setEventMedia([]);
      setEventLink('');
      setSuggestedRate(null);
      setError(null);
      setResult(null);
    }
  }, [visible, target]);

  useEffect(() => {
    if (!performerCategory) {
      setSuggestedRate(null);
      return;
    }
    let cancelled = false;
    performersApi
      .fetchBenchmarkRate(performerCategory)
      .then((data) => { if (!cancelled) setSuggestedRate(data.rate ? { amountLocal: data.rate.amountLocal, symbol: data.rate.symbol } : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [performerCategory]);

  async function addEventMedia() {
    if (eventMedia.length >= 6) {
      setError('You can add up to 6 event attachments.');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Allow photo library access to attach event photos or videos.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 6 - eventMedia.length,
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets.length) return;
    setUploadingMedia(true);
    setError(null);
    try {
      const additions: MarketplaceEventMedia[] = [];
      for (const asset of picked.assets.slice(0, 6 - eventMedia.length)) {
        const isVideo = asset.type === 'video';
        const name = asset.fileName || asset.uri.split('/').pop() || (isVideo ? 'event-video.mp4' : 'event-photo.jpg');
        const file = { uri: asset.uri, name, type: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg') };
        const uploaded = isVideo ? await performersApi.uploadPerformerVideo(file) : await performersApi.uploadPerformerPhoto(file);
        additions.push({ type: isVideo ? 'video' : 'image', url: uploaded.url, name });
      }
      setEventMedia((current) => [...current, ...additions].slice(0, 6));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload that event media.');
    } finally {
      setUploadingMedia(false);
    }
  }

  function addEventLink() {
    const url = eventLink.trim();
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol');
    } catch {
      setError('Enter a valid http(s) event link.');
      return;
    }
    if (eventMedia.length >= 6) {
      setError('You can add up to 6 event attachments.');
      return;
    }
    setEventMedia((current) => [...current, { type: 'link', url, name: url }]);
    setEventLink('');
    setError(null);
  }

  async function send() {
    if (!performerCategory) return setError('Choose a performer category.');
    if (!eventType) return setError('Choose an event type.');
    if (!location.trim()) return setError('Enter the event location.');
    if (!amount.trim() || Number(amount) <= 0) return setError('Enter a proposed amount.');
    setSending(true);
    setError(null);
    try {
      const data = await performersApi.postMarketplaceRequest({
        performerCategory,
        eventType,
        eventDate,
        eventDurationHours: Number(durationHours) || 1,
        eventLocation: location.trim(),
        radiusKm: Number(radiusKm) || 25,
        proposedAmountUsd: Number(amount),
        notes: notes.trim() || undefined,
        phone: phone.trim() || undefined,
        eventMedia,
        performerId: target?.id,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post that request.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.sheetBackdropTouch} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          {!result ? (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '100%' }}>
              <Text style={styles.sheetTitle}>{target ? `Request ${target.name}` : 'Request a Performer'}</Text>
              {target ? (
                <View style={styles.targetBanner}>
                  <Avatar name={target.name} photoUrl={target.photoUrl} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.targetBannerName}>{target.name}</Text>
                    <Text style={styles.targetBannerMeta}>{[target.categories[0], target.city].filter(Boolean).join(' · ')}</Text>
                  </View>
                </View>
              ) : null}

              <Text style={styles.sheetLabel}>Performer category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                {categories.map((c) => {
                  const active = performerCategory === c;
                  return (
                    <Pressable
                      key={c}
                      style={[styles.chip, { marginHorizontal: 4 }, active && { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed }]}
                      onPress={() => setPerformerCategory(c)}
                    >
                      <Text style={[styles.chipText, active && { color: colors.onPrimary }]}>{c}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.sheetLabel}>Event type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                {eventTypes.map((e) => {
                  const active = eventType === e;
                  return (
                    <Pressable
                      key={e}
                      style={[styles.chip, { marginHorizontal: 4 }, active && { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed }]}
                      onPress={() => setEventType(e)}
                    >
                      <Text style={[styles.chipText, active && { color: colors.onPrimary }]}>{e}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetLabel}>Event date</Text>
                  <TextInput style={styles.sheetInput} value={eventDate} onChangeText={setEventDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetLabel}>Duration (hrs)</Text>
                  <TextInput style={styles.sheetInput} value={durationHours} onChangeText={setDurationHours} keyboardType="decimal-pad" placeholderTextColor={colors.textFaint} />
                </View>
              </View>

              <Text style={styles.sheetLabel}>Event location</Text>
              <TextInput style={styles.sheetInput} value={location} onChangeText={setLocation} placeholder={EVENT_LOCATION_PLACEHOLDER} placeholderTextColor={colors.textFaint} />

              {!target ? (
                <>
                  <Text style={styles.sheetLabel}>Search radius (km)</Text>
                  <TextInput style={styles.sheetInput} value={radiusKm} onChangeText={setRadiusKm} keyboardType="number-pad" placeholderTextColor={colors.textFaint} />
                </>
              ) : null}

              <Text style={styles.sheetLabel}>Your proposed amount (USD)</Text>
              {suggestedRate ? (
                <Text style={styles.suggestedRateHint}>Typical rate: {suggestedRate.symbol}{suggestedRate.amountLocal} - guidance, not a requirement.</Text>
              ) : null}
              <TextInput style={styles.sheetInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="e.g. 200" placeholderTextColor={colors.textFaint} />

              <Text style={styles.sheetLabel}>Your phone (optional)</Text>
              <TextInput style={styles.sheetInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={colors.textFaint} />

              <Text style={styles.sheetLabel}>Tell performers about your event</Text>
              <TextInput
                style={[styles.sheetInput, styles.sheetTextarea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="What should performers know?"
                placeholderTextColor={colors.textFaint}
                multiline
              />

              <Text style={styles.sheetLabel}>Event photos, videos, or links (optional)</Text>
              <Pressable style={styles.eventMediaPicker} onPress={addEventMedia} disabled={uploadingMedia}>
                {uploadingMedia ? <ActivityIndicator size="small" color={colors.primaryRed} /> : <Ionicons name="images-outline" size={19} color={colors.primaryRed} />}
                <Text style={styles.eventMediaPickerText}>{uploadingMedia ? 'Uploading event media…' : 'Add photos or videos'}</Text>
              </Pressable>
              <View style={styles.eventLinkRow}>
                <TextInput
                  style={[styles.sheetInput, { flex: 1 }]}
                  value={eventLink}
                  onChangeText={setEventLink}
                  placeholder="Paste an event link"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Pressable style={styles.addEventLinkButton} onPress={addEventLink}>
                  <Text style={styles.addEventLinkText}>Add link</Text>
                </Pressable>
              </View>
              {eventMedia.length ? <View style={styles.eventAttachments}>
                {eventMedia.map((item, index) => (
                  <View key={`${item.url}-${index}`} style={styles.eventAttachment}>
                    <Ionicons name={item.type === 'image' ? 'image-outline' : item.type === 'video' ? 'videocam-outline' : 'link-outline'} size={16} color={colors.primaryRed} />
                    <Text style={styles.eventAttachmentText} numberOfLines={1}>{item.name || 'Event attachment'}</Text>
                    <Pressable onPress={() => setEventMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                    </Pressable>
                  </View>
                ))}
              </View> : null}

              {error ? <Text style={styles.sheetError}>{error}</Text> : null}
              <PrimaryButton title="Send Request to Performers" onPress={send} loading={sending} style={styles.sheetSubmit} />
            </ScrollView>
          ) : (
            <View style={styles.sentState}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              <Text style={styles.sheetTitle}>Request posted</Text>
              <Text style={styles.sheetLabel}>
                {!result.locationResolved
                  ? "We couldn't verify that location precisely - try a more specific address next time. Your request was still posted."
                  : result.invitedCount === 0
                    ? 'No performers matched your radius yet - try a larger radius.'
                    : `${result.invitedCount} performer${result.invitedCount === 1 ? '' : 's'} notified. Review their responses once they reply.`}
              </Text>
              <PrimaryButton title="Done" onPress={onClose} style={styles.sheetSubmit} />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    },
    title: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text },
    headerSpacer: { width: 36 },
    content: { paddingHorizontal: 16, paddingBottom: 30 },
    postCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      padding: 18,
      alignItems: 'center',
      marginBottom: 20,
    },
    postIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: `${colors.primaryRed}17`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    postTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text },
    postSub: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', marginTop: 6, lineHeight: 18 },
    postBtn: { alignSelf: 'stretch', marginTop: 16 },
    chipsRow: { flexGrow: 0, marginBottom: 16 },
    chipsContent: { gap: 8, paddingVertical: 2 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    chipText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text },
    sectionCount: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint },
    centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, fontSize: 13, textAlign: 'center' },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      padding: 16,
      marginBottom: 12,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    cardIdentity: { flex: 1 },
    cardName: { fontSize: 15.5, fontFamily: fonts.bodyBold, color: colors.text },
    cardSubtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    cardMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    cardBio: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textSoft, marginTop: 10, lineHeight: 18 },
    cardActionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 },
    openProfileRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    requestBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primaryRed, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 },
    requestBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    openProfileText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    pricePill: { backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'flex-end' },
    pricePillText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    pricePillSecondary: { fontSize: 10.5, fontFamily: fonts.bodySemiBold, color: colors.textSoft, marginTop: 2 },
    priceCurrency: { fontSize: 9.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 1 },
    feedHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 12 },
    feedHint: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 3 },
    feedBadge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.primaryRed}12` },
    feedEmpty: { alignItems: 'center', gap: 8, padding: 22, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
    feedCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, marginBottom: 14, overflow: 'hidden' },
    feedAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    feedAuthorName: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    feedAuthorMeta: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    feedText: { fontSize: 13.5, fontFamily: fonts.body, color: colors.text, lineHeight: 20, marginTop: 12 },
    feedImage: { width: '100%', height: 220, borderRadius: 13, marginTop: 12, backgroundColor: colors.background },
    feedVideo: { minHeight: 132, borderRadius: 13, marginTop: 12, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primaryRed },
    feedVideoText: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    feedActions: { flexDirection: 'row', gap: 22, marginTop: 13, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    feedAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    feedActionText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textSoft },
    previewComment: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 7 },
    previewCommentName: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.text },
    previewCommentText: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textSoft, flexShrink: 1 },
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end' },
    sheetBackdropTouch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 34,
      maxHeight: '88%',
    },
    commentsSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, height: '62%' },
    commentsTitle: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    commentsList: { flex: 1 },
    commentRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    commentBubble: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: colors.background },
    commentText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.text, marginTop: 2, lineHeight: 18 },
    commentInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    commentInput: { flex: 1, maxHeight: 96, minHeight: 42, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.background, color: colors.text, fontSize: 13, fontFamily: fonts.body },
    commentSend: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primaryRed, alignItems: 'center', justifyContent: 'center' },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    targetBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background, borderRadius: 14, padding: 10, marginBottom: 14 },
    targetBannerName: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    targetBannerMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    sheetLabel: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textFaint, marginBottom: 6, marginTop: 10 },
    fieldRow: { flexDirection: 'row', gap: 10 },
    sheetInput: {
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
    sheetTextarea: { minHeight: 70, textAlignVertical: 'top' },
    eventMediaPicker: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: `${colors.primaryRed}55`, backgroundColor: `${colors.primaryRed}0d`, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
    eventMediaPickerText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    eventLinkRow: { flexDirection: 'row', gap: 8, marginTop: 9 },
    addEventLinkButton: { backgroundColor: colors.primaryRed, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11 },
    addEventLinkText: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    eventAttachments: { gap: 7, marginTop: 10 },
    eventAttachment: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.background },
    eventAttachmentText: { flex: 1, fontSize: 11.5, fontFamily: fonts.body, color: colors.textSoft },
    suggestedRateHint: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginBottom: 8, lineHeight: 16 },
    sheetError: { color: colors.danger, fontFamily: fonts.bodySemiBold, fontSize: 12.5, marginTop: 10 },
    sheetSubmit: { marginTop: 18 },
    sentState: { alignItems: 'center', gap: 8, paddingVertical: 10 },
  });
}

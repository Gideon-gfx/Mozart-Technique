import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../api/client';
import * as organizationsApi from '../api/organizations';
import type { OrgContentItem } from '../api/organizations';
import { useToast } from '../context/ToastContext';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import PrimaryButton from './PrimaryButton';

type FeedKind = 'none' | 'photo' | 'video';
type AnnouncementKind = 'none' | 'document';

// Shared by the Feed and Announcement composers - only shown to the
// account that's also this organization's own owner login, since that's
// who /api/organizations/private-content actually accepts posts from
// (mirrors the real ngo-dashboard.html posting flow, just reached from the
// mobile app for the one account that happens to hold both roles).
export default function OrgContentComposer({
  visible,
  onClose,
  mode,
  onPosted,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  mode: 'feed' | 'announcement';
  onPosted: (item: OrgContentItem) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [feedKind, setFeedKind] = useState<FeedKind>('none');
  const [announcementKind, setAnnouncementKind] = useState<AnnouncementKind>('none');
  const [asset, setAsset] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setText('');
      setFeedKind('none');
      setAnnouncementKind('none');
      setAsset(null);
    }
  }, [visible]);

  // Guards against expo-document-picker/expo-image-picker's
  // PickingInProgressException - only one native picking session is
  // allowed at a time, and Photo/Video/Document are all buttons on the
  // same composer, so a second tap before the first sheet appears used to
  // throw this completely unhandled.
  const pickerBusyRef = useRef(false);

  async function pickPhoto() {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast('Permission needed: allow photo library access.', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      const picked = result.assets[0];
      setAsset({ uri: picked.uri, name: picked.fileName || 'photo.jpg', type: picked.mimeType || 'image/jpeg' });
    } catch {
      toast('Could not open the photo picker. Try again in a moment.', 'error');
    } finally {
      pickerBusyRef.current = false;
    }
  }

  async function pickVideo() {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast('Permission needed: allow photo library access.', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      const picked = result.assets[0];
      setAsset({ uri: picked.uri, name: picked.fileName || 'video.mp4', type: picked.mimeType || 'video/mp4' });
    } catch {
      toast('Could not open the video picker. Try again in a moment.', 'error');
    } finally {
      pickerBusyRef.current = false;
    }
  }

  async function pickDocument() {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const picked = result.assets[0];
      setAsset({ uri: picked.uri, name: picked.name, type: picked.mimeType || 'application/octet-stream' });
    } catch {
      toast('Could not open the file picker. Try again in a moment.', 'error');
    } finally {
      pickerBusyRef.current = false;
    }
  }

  async function post() {
    if (!title.trim()) {
      toast('Enter a title.', 'error');
      return;
    }
    setPosting(true);
    try {
      let fileUrl: string | undefined;
      if (asset) {
        const mediaType = mode === 'feed' ? (feedKind === 'photo' ? 'photo' : 'video') : 'document';
        const uploaded = await organizationsApi.uploadOrgMedia(mediaType, asset);
        fileUrl = uploaded.url;
      }
      const type: organizationsApi.OrgContentType =
        mode === 'announcement' ? 'announcement' : feedKind === 'photo' ? 'photo' : feedKind === 'video' ? 'video' : 'feed';
      const result = await organizationsApi.createOrgContent({ type, title: title.trim(), text: text.trim() || undefined, fileUrl });
      onPosted(result.item);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not post that.', 'error');
    } finally {
      setPosting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{mode === 'feed' ? 'New feed post' : 'New announcement'}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="What's this about?" placeholderTextColor={colors.textFaint} />

            <Text style={styles.fieldLabel}>Text (optional)</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={text}
              onChangeText={setText}
              placeholder="Say more..."
              placeholderTextColor={colors.textFaint}
              multiline
            />

            {mode === 'feed' ? (
              <>
                <Text style={styles.fieldLabel}>Attach</Text>
                <View style={styles.chipsRow}>
                  {(['none', 'photo', 'video'] as FeedKind[]).map((kind) => {
                    const active = feedKind === kind;
                    return (
                      <Pressable
                        key={kind}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => {
                          setFeedKind(kind);
                          setAsset(null);
                          if (kind === 'photo') pickPhoto();
                          else if (kind === 'video') pickVideo();
                        }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{kind === 'none' ? 'Just text' : kind === 'photo' ? 'Photo' : 'Video'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Attach</Text>
                <View style={styles.chipsRow}>
                  {(['none', 'document'] as AnnouncementKind[]).map((kind) => {
                    const active = announcementKind === kind;
                    return (
                      <Pressable
                        key={kind}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => {
                          setAnnouncementKind(kind);
                          setAsset(null);
                          if (kind === 'document') pickDocument();
                        }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{kind === 'none' ? 'Just text' : 'Document'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {asset ? (
              <View style={styles.assetRow}>
                <Ionicons name="document-attach-outline" size={16} color={colors.primaryRed} />
                <Text style={styles.assetName} numberOfLines={1}>{asset.name}</Text>
              </View>
            ) : null}

            <PrimaryButton title={mode === 'feed' ? 'Post to feed' : 'Post announcement'} onPress={post} loading={posting} style={{ marginTop: 18, marginBottom: 20 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, maxHeight: '85%' },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
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
    textarea: { minHeight: 80, textAlignVertical: 'top' },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
    chipActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    chipText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    chipTextActive: { color: colors.onPrimary },
    assetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: colors.background, borderRadius: 10, padding: 10 },
    assetName: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
  });
}

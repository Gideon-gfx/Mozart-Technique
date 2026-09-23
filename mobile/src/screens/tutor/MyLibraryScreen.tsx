import { FlatList, ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../../api/client';
import * as libraryApi from '../../api/library';
import * as tutorsApi from '../../api/tutors';
import type { LibraryItem } from '../../api/types';
import BackButton from '../../components/BackButton';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../context/ToastContext';
import type { MainStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'MyLibrary'>;

function isDirectVideoUrl(url: string, isFile?: boolean) {
  if (isFile) return true;
  return /(\.(mp4|webm|ogg|mov|m4v|m3u8)(?:[?#]|$)|\/uploads\/videos\/|\/video\/upload\/)/i.test(url);
}

// Mirrors tutor.html's "Technique video uploads" card exactly - same real
// /api/tutor-library* routes: list what this tutor has added, upload a new
// clip (a local file or a pasted link), and remove one. This is the
// tutor's own contributions, separate from the shared Mozart library
// (LibraryScreen), which is why it lives as its own screen.
export default function MyLibraryScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { actionSheet, toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [openItem, setOpenItem] = useState<LibraryItem | null>(null);

  const load = React.useCallback(() => {
    Promise.all([libraryApi.fetchMyTutorLibrary(), tutorsApi.fetchMyTutorProfile(), tutorsApi.fetchTaxonomy()])
      .then(([libData, profileData, tax]) => {
        setItems(libData.items);
        setCategories(profileData.profile?.categories || []);
        setGenres(tax.genres);
      })
      .catch(() => toast('Could not load your library uploads.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function onLongPressItem(item: LibraryItem) {
    actionSheet({
      title: item.title,
      actions: [
        {
          label: 'Remove from library',
          destructive: true,
          onPress: async () => {
            try {
              await libraryApi.deleteTutorLibraryItem(item.id);
              toast('Removed from your library.', 'success');
              load();
            } catch (err) {
              toast(err instanceof ApiError ? err.message : 'Could not remove that clip.', 'error');
            }
          },
        },
      ],
    });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.title} numberOfLines={1}>My Library</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setUploadOpen(true)}>
          <Ionicons name="add" size={16} color={colors.onPrimary} />
          <Text style={styles.addBtnText}>Upload</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="folder-open-outline" size={28} color={colors.textFaint} />
              <Text style={styles.emptyText}>You haven&apos;t added any clips yet. Tap Upload to add your first one.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => setOpenItem(item)} onLongPress={() => onLongPressItem(item)}>
              <View style={styles.rowIcon}>
                <Ionicons name="videocam" size={18} color={colors.primaryRed} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rowMeta}>{item.category || 'Any subject'}{item.genre ? ` · ${item.genre}` : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          )}
        />
      )}

      <UploadSheet
        visible={uploadOpen}
        onClose={() => setUploadOpen(false)}
        colors={colors}
        categories={categories}
        genres={genres}
        onUploaded={load}
      />
      <MyClipModal item={openItem} onClose={() => setOpenItem(null)} colors={colors} />
    </View>
  );
}

function MyClipModal({ item, onClose, colors }: { item: LibraryItem | null; onClose: () => void; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isVideo = item ? isDirectVideoUrl(item.url, item.isFile) : false;
  const resolvedUrl = item ? resolveMediaUrl(item.url) : null;
  const player = useVideoPlayer(isVideo && resolvedUrl ? resolvedUrl : null, (p) => { p.loop = false; });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });

  return (
    <Modal visible={!!item} animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailScreen}>
        <View style={styles.header}>
          <BackButton onPress={onClose} />
          <Text style={[styles.title, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{item?.title}</Text>
          <View style={{ width: 36 }} />
        </View>
        {item ? (
          isVideo ? (
            <View style={styles.playerFull}>
              <VideoView player={player} style={styles.playerInner} contentFit="contain" nativeControls />
              {status === 'error' ? (
                <View style={styles.playerErrorOverlay}>
                  <Text style={styles.playerErrorText}>{error?.message || 'Could not play this clip.'}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.playerFull}>
              <Pressable style={styles.externalLinkBtn} onPress={() => resolvedUrl && Linking.openURL(resolvedUrl)}>
                <Ionicons name="open-outline" size={20} color="#fff" />
                <Text style={styles.externalLinkText}>Open link</Text>
              </Pressable>
            </View>
          )
        ) : null}
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.rowMeta}>{item?.category || 'Any subject'}{item?.genre ? ` · ${item.genre}` : ''}</Text>
          {item?.description ? <Text style={styles.description}>{item.description}</Text> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function UploadSheet({
  visible,
  onClose,
  colors,
  categories,
  genres,
  onUploaded,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ThemeColors;
  categories: string[];
  genres: string[];
  onUploaded: () => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [category, setCategory] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');
  const [pickedFile, setPickedFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setCategory(categories[0] || null);
      setGenre(null);
      setTitle('');
      setDescription('');
      setLink('');
      setPickedFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function pickVideoFile() {
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true });
    } catch {
      toast('Could not open the file picker. Try again in a moment.', 'error');
      return;
    }
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPickedFile({ uri: asset.uri, name: asset.name, type: asset.mimeType || 'video/mp4' });
    setLink('');
  }

  async function submit() {
    if (!title.trim() || !category) {
      toast('Choose one of your teaching subjects and add a title.', 'error');
      return;
    }
    if (!link.trim() && !pickedFile) {
      toast('Paste a video link or choose a video file.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      let url = link.trim();
      let isFile = false;
      if (!url && pickedFile) {
        const uploaded = await libraryApi.uploadTutorLibraryVideo(pickedFile);
        url = uploaded.url;
        isFile = true;
      }
      await libraryApi.createTutorLibraryItem({ title: title.trim(), description: description.trim() || undefined, url, category, genre, isFile });
      toast(`Added to ${category} library.`, 'success');
      onUploaded();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not add to library.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Upload a technique clip</Text>
            <Text style={styles.fieldLabel}>Subject</Text>
            <View style={styles.pillRow}>
              {categories.map((c) => {
                const active = category === c;
                return (
                  <Pressable key={c} style={[styles.pill, active && styles.pillActive]} onPress={() => setCategory(c)}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>Genre (optional)</Text>
            <View style={styles.pillRow}>
              {genres.map((g) => {
                const active = genre === g;
                return (
                  <Pressable key={g} style={[styles.pill, active && styles.pillActive]} onPress={() => setGenre(active ? null : g)}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{g}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Video title" placeholderTextColor={colors.textFaint} />
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. How to position your hands on the piano"
              placeholderTextColor={colors.textFaint}
              multiline
            />
            <Text style={styles.fieldLabel}>Video link</Text>
            <TextInput
              style={styles.input}
              value={link}
              onChangeText={(t) => { setLink(t); if (t) setPickedFile(null); }}
              placeholder="Paste a video link (mp4, YouTube, etc.)"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
            />
            <Text style={styles.orText}>or</Text>
            <Pressable style={styles.filePickBtn} onPress={pickVideoFile}>
              <Ionicons name="film-outline" size={16} color={colors.primaryRed} />
              <Text style={styles.filePickBtnText}>{pickedFile ? pickedFile.name : 'Choose a video file'}</Text>
            </Pressable>
            <PrimaryButton title="Add to library" onPress={submit} loading={submitting} style={{ marginTop: 18, marginBottom: 8 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    detailScreen: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 14,
      gap: 10,
    },
    headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
    title: { flexShrink: 1, fontSize: 18, fontFamily: fonts.displayBlack, color: colors.text },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primaryRed,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 9,
      flexShrink: 0,
    },
    addBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingTop: 60, gap: 8 },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, textAlign: 'center', fontSize: 13 },
    content: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: `${colors.primaryRed}12`, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    rowMeta: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    description: { fontSize: 13, fontFamily: fonts.body, color: colors.textSoft, lineHeight: 19, marginTop: 10 },
    playerFull: { width: '100%', height: 260, backgroundColor: '#000' },
    playerInner: { width: '100%', height: '100%' },
    playerErrorOverlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 24 },
    playerErrorText: { color: '#fff', fontSize: 12.5, fontFamily: fonts.body, textAlign: 'center' },
    externalLinkBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    externalLinkText: { color: '#fff', fontSize: 13, fontFamily: fonts.bodyBold },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34, maxHeight: '85%' },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 6, textAlign: 'center' },
    fieldLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 12, marginBottom: 6 },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    pillActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    pillText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
    pillTextActive: { color: colors.onPrimary },
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
    textarea: { minHeight: 60, textAlignVertical: 'top' },
    orText: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', marginVertical: 8 },
    filePickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: 12,
    },
    filePickBtnText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.primaryRed },
  });
}

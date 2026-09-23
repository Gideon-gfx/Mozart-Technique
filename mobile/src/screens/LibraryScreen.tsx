import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { FontAwesome6, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useEvent } from 'expo';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Modal, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { API_BASE_URL, ApiError, resolveMediaUrl } from '../api/client';
import * as libraryApi from '../api/library';
import * as tutorsApi from '../api/tutors';
import type { LibraryItem } from '../api/types';
import BackButton from '../components/BackButton';
import ScreenWatermark from '../components/ScreenWatermark';
import { useTourTarget } from '../context/TourTargetsContext';
import { useToast } from '../context/ToastContext';
import type { MainTabParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

// Same shareable-link shape library.html's own copy/share buttons build -
// a slugified title, resolved via the real ?item= deep link the server
// already supports for the web page.
function librarySlug(title: string) {
  return String(title || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function libraryShareUrl(item: LibraryItem) {
  return `${API_BASE_URL}/library?item=${encodeURIComponent(librarySlug(item.title))}`;
}

type Props = BottomTabScreenProps<MainTabParamList, 'Library'>;

// isFile is the authoritative signal (a real upload we host); the regex is
// a fallback for admin-entered external links. Widened to also catch our
// own /uploads/videos/ path and Cloudinary's /video/upload/ resource type,
// since a Cloudinary-hosted clip's URL doesn't always end in a recognized
// file extension - those were falling through to the WebView path with an
// unresolved/unplayable URL and showing a browser "error loading page"
// instead of ever reaching the native player.
function isDirectVideoUrl(url: string, isFile?: boolean) {
  if (isFile) return true;
  return /(\.(mp4|webm|ogg|mov|m4v|m3u8)(?:[?#]|$)|video\/|\/uploads\/videos\/|\/video\/upload\/)/i.test(url);
}

// Mirrors library.html's videoPlayerHtml() - same YouTube/Vimeo/Drive embed
// URL detection, rendered through a WebView instead of an <iframe> so it
// plays inside the app, not a browser hand-off.
function embedUrl(url: string): string | null {
  const youtube = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/i);
  if (youtube) return `https://www.youtube-nocookie.com/embed/${youtube[1]}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/i) || url.match(/drive\.google\.com\/uc\?id=([\w-]+)/i);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  return null;
}

// A decorative instrument glyph per subject (data/taxonomy.js's SUBJECTS) -
// there's no per-clip thumbnail image in the real data, so this dresses up
// the gradient cover with something honestly decorative rather than a fake
// photo standing in for real artwork.
// MaterialCommunityIcons has no drum glyph at all - FontAwesome6 does
// ("drum"), so percussion is the one category pulled from a second icon
// set rather than leaving it on the generic treble-clef fallback.
type CategoryIcon = { set: 'mci'; name: keyof typeof MaterialCommunityIcons.glyphMap } | { set: 'fa6'; name: string };

const CATEGORY_ICON: Record<string, CategoryIcon> = {
  Piano: { set: 'mci', name: 'piano' },
  Organ: { set: 'mci', name: 'piano' },
  Vocals: { set: 'mci', name: 'microphone-variant' },
  'Choral Techniques': { set: 'mci', name: 'microphone-variant' },
  Violin: { set: 'mci', name: 'violin' },
  Viola: { set: 'mci', name: 'violin' },
  Cello: { set: 'mci', name: 'violin' },
  'Double Bass': { set: 'mci', name: 'violin' },
  Guitar: { set: 'mci', name: 'guitar-acoustic' },
  Trumpet: { set: 'mci', name: 'trumpet' },
  Trombone: { set: 'mci', name: 'trumpet' },
  'French Horn': { set: 'mci', name: 'trumpet' },
  Tuba: { set: 'mci', name: 'trumpet' },
  'Flugel Horn': { set: 'mci', name: 'trumpet' },
  Euphonium: { set: 'mci', name: 'trumpet' },
  Flute: { set: 'mci', name: 'saxophone' },
  Piccolo: { set: 'mci', name: 'saxophone' },
  Recorder: { set: 'mci', name: 'saxophone' },
  Clarinet: { set: 'mci', name: 'saxophone' },
  Saxophone: { set: 'mci', name: 'saxophone' },
  Oboe: { set: 'mci', name: 'saxophone' },
  Bassoon: { set: 'mci', name: 'saxophone' },
  Drums: { set: 'fa6', name: 'drum' },
  Xylophone: { set: 'fa6', name: 'drum' },
  'Talking Drum': { set: 'fa6', name: 'drum' },
  'Percussive Instruments (Native)': { set: 'fa6', name: 'drum' },
  DJing: { set: 'mci', name: 'disc-player' },
  Production: { set: 'mci', name: 'waveform' },
  Conducting: { set: 'mci', name: 'gesture-tap' },
  Dance: { set: 'mci', name: 'dance-ballroom' },
};

function categoryIcon(category: string | null): CategoryIcon {
  return (category && CATEGORY_ICON[category]) || { set: 'mci', name: 'music-clef-treble' };
}

// Native rebuild of library.html - same /api/library, /api/library/my-subjects
// and /api/taxonomy endpoints, real clip data, and every clip plays inside
// the app: direct video files through expo-video, YouTube/Vimeo/Drive/any
// other link through an in-app WebView - never a browser hand-off.
export default function LibraryScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { actionSheet, toast } = useToast();
  const headerTargetRef = useTourTarget('library-main');

  function onLongPressItem(item: LibraryItem) {
    const url = libraryShareUrl(item);
    actionSheet({
      title: item.title,
      actions: [
        {
          label: 'Copy link',
          onPress: async () => {
            await Clipboard.setStringAsync(url);
            toast('Library link copied.', 'success');
          },
        },
        {
          label: 'Share',
          onPress: () => {
            Share.share({ message: url, url }).catch(() => {});
          },
        },
      ],
    });
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noAccess, setNoAccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [openItem, setOpenItem] = useState<LibraryItem | null>(null);

  useEffect(() => {
    Promise.all([libraryApi.fetchMySubjects(), tutorsApi.fetchTaxonomy()])
      .then(([subData, tax]) => {
        setIsAdmin(subData.isAdmin);
        setSubjects(subData.subjects);
        setGenres(tax.genres);
        if (!subData.isAdmin && subData.subjects.length === 0) setNoAccess(true);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the library.'))
      .finally(() => setLoading(false));
  }, []);

  const search = useCallback(async (nextCategory: string | null, nextGenre: string | null, nextQuery: string) => {
    setItemsLoading(true);
    try {
      const data = await libraryApi.fetchLibraryItems({ category: nextCategory || undefined, genre: nextGenre || undefined, q: nextQuery || undefined });
      setItems(data.items);
    } catch {
      setItems([]);
    } finally {
      setItemsLoading(false);
      setSearchedOnce(true);
    }
  }, []);

  useEffect(() => {
    if (!loading && !noAccess) search(category, genre, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, noAccess]);

  // Arriving from a library share link tapped in chat (openItemSlug) -
  // once the default "All" list loads, jump straight to that clip's detail
  // modal instead of just showing the list. Cleared from params right
  // after so it doesn't reopen if the tab is revisited later.
  const openItemSlug = route.params?.openItemSlug;
  useEffect(() => {
    if (!openItemSlug || !searchedOnce) return;
    const match = items.find((item) => librarySlug(item.title) === openItemSlug);
    if (match) setOpenItem(match);
    navigation.setParams({ openItemSlug: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItemSlug, items, searchedOnce]);

  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View ref={headerTargetRef} collapsable={false} style={styles.header}>
        <View style={styles.headerLeft}>
          {/* As the student Library tab there's nothing to go back to
              (canGoBack() is false), so this switches to the Home tab
              instead; reused as a pushed stack screen from tutor mode
              (which has no Library tab of its own) there's a real screen
              underneath, so this just pops back to it. */}
          <BackButton onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))} />
          <Text style={styles.title}>Technique Library</Text>
        </View>
        {!loading && !noAccess ? (
          <Pressable style={styles.filterIconBtn} onPress={() => setFilterSheetOpen(true)} hitSlop={8}>
            <Ionicons name="options" size={17} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : noAccess ? (
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={26} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>No library access yet</Text>
          <Text style={styles.emptyBody}>It unlocks once you're matched with a tutor (or approved to teach) in a subject.</Text>
          <Pressable style={styles.findTutorBtn} onPress={() => navigation.getParent()?.navigate('FindTutor')}>
            <Text style={styles.findTutorBtnText}>Find a Tutor</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.primaryRed} />
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={17} color={colors.textFaint} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search videos by title or topic..."
              placeholderTextColor={colors.textFaint}
              value={query}
              onChangeText={(v) => { setQuery(v); search(category, genre, v); }}
            />
          </View>

          {subjects.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={styles.chipsContent}>
              <Pressable
                style={[styles.chip, !category && styles.chipActive]}
                onPress={() => { setCategory(null); search(null, genre, query); }}
              >
                <Text style={[styles.chipText, !category && styles.chipTextActive]}>All</Text>
              </Pressable>
              {subjects.map((s) => {
                const active = category === s;
                return (
                  <Pressable
                    key={s}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => { const next = active ? null : s; setCategory(next); search(next, genre, query); }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {itemsLoading ? (
            <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 24 }} />
          ) : items.length === 0 ? (
            <Text style={styles.noClipsText}>No clips match yet.</Text>
          ) : (
            <View style={styles.list}>
              {items.map((item) => (
                <ClipCard key={item.id} item={item} colors={colors} onPress={() => setOpenItem(item)} onLongPress={() => onLongPressItem(item)} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <ClipDetailModal item={openItem} onClose={() => setOpenItem(null)} colors={colors} />
      <LibraryFilterSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        genres={genres}
        genre={genre}
        colors={colors}
        onApply={(nextGenre) => { setGenre(nextGenre); setFilterSheetOpen(false); search(category, nextGenre, query); }}
      />
    </View>
  );
}

// Row layout, gradient cover + pill badge - matches the reference design's
// clip-list treatment (not a card-icon grid).
function ClipCard({ item, colors, onPress, onLongPress }: { item: LibraryItem; colors: ThemeColors; onPress: () => void; onLongPress: () => void }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const meta = [item.category || 'Any subject', item.genre].filter(Boolean).join(' · ');
  return (
    <Pressable style={styles.card} onPress={onPress} onLongPress={onLongPress}>
      <View style={styles.cover}>
        <LinearGradient
          colors={['#262c3a', '#b40000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View style={styles.coverCircle} />
        {(() => {
          const icon = categoryIcon(item.category);
          return icon.set === 'fa6' ? (
            <FontAwesome6 name={icon.name} size={22} color="rgba(255,255,255,0.85)" />
          ) : (
            <MaterialCommunityIcons name={icon.name} size={26} color="rgba(255,255,255,0.85)" />
          );
        })()}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{meta}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        {item.description ? <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text> : null}
      </View>
      <View style={styles.playBtn}>
        <Ionicons name="play" size={16} color={colors.textSoft} />
      </View>
    </Pressable>
  );
}

function LibraryFilterSheet({
  visible,
  onClose,
  genres,
  genre,
  onApply,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  genres: string[];
  genre: string | null;
  onApply: (genre: string | null) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selected, setSelected] = useState(genre);

  useEffect(() => {
    if (visible) setSelected(genre);
  }, [visible, genre]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={styles.sheetBackdropTouch} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Library filters</Text>
          <Text style={styles.sheetLabel}>Genre</Text>
          <View style={styles.chipsContent}>
            {genres.map((g) => {
              const active = selected === g;
              return (
                <Pressable key={g} style={[styles.chip, active && styles.chipActive]} onPress={() => setSelected(active ? null : g)}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{g}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.applyBtn} onPress={() => onApply(selected)}>
            <Text style={styles.applyBtnText}>Apply filters</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ClipDetailModal({ item, onClose, colors }: { item: LibraryItem | null; onClose: () => void; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isVideo = item ? isDirectVideoUrl(item.url, item.isFile) : false;
  // item.url from /api/library can be a local /uploads/videos/... path
  // (relative, no page-origin context for RN to resolve against) or an
  // absolute Cloudinary URL - same resolution every photo/attachment URL
  // already goes through, just missed here originally.
  const resolvedUrl = item ? resolveMediaUrl(item.url) : null;
  const [retryTick, setRetryTick] = useState(0);
  const embed = item && !isVideo ? embedUrl(item.url) : null;

  useEffect(() => {
    setRetryTick(0);
  }, [item?.id]);

  return (
    <Modal visible={!!item} animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailScreen}>
        <View style={styles.detailHeader}>
          <BackButton onPress={onClose} />
          <Text style={styles.detailTitle} numberOfLines={1}>{item?.title}</Text>
          <View style={{ width: 42 }} />
        </View>
        {item ? (
          <>
            {isVideo ? (
              // A fixed-height block (not a fixed aspect ratio) so a
              // portrait/vertical clip - the common case for a short
              // technique clip filmed on a phone - gets real screen height
              // instead of being squeezed into a 16:9 box with huge letterbox
              // bars either side, which is what left barely any visible
              // (and tappable) video at all on a small device.
              <LibraryVideoPlayer key={`${item.id}-${retryTick}`} url={resolvedUrl} styles={styles} onRetry={() => setRetryTick((n) => n + 1)} />
            ) : (
              <View style={styles.webviewBoxFull}>
                <WebView source={{ uri: embed || resolvedUrl || item.url }} style={styles.webview} allowsFullscreenVideo mediaPlaybackRequiresUserAction={false} javaScriptEnabled />
              </View>
            )}
            <ScrollView contentContainerStyle={styles.detailContent}>
              <Text style={styles.detailMeta}>{item.category || 'Any subject'}{item.genre ? ` · ${item.genre}` : ''}</Text>
              {item.description ? <Text style={styles.detailDesc}>{item.description}</Text> : null}
            </ScrollView>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

// A separate component (not inlined in ClipDetailModal) so changing its
// `key` on retry truly remounts useVideoPlayer and creates a fresh player -
// bumping a sibling state value would leave the same, still-errored player
// instance in place, since the hook lives above wherever that key sits.
function LibraryVideoPlayer({
  url,
  styles,
  onRetry,
}: {
  url: string | null;
  styles: ReturnType<typeof createStyles>;
  onRetry: () => void;
}) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  // Surfaces the player's real status instead of a silent stuck/blank
  // screen - "it's not playing" with no other detail was undiagnosable
  // from the previous version, which never exposed *why* a clip failed.
  const { status, error: playerError } = useEvent(player, 'statusChange', { status: player.status });

  return (
    <View style={styles.playerFull}>
      <VideoView player={player} style={styles.playerInner} contentFit="contain" nativeControls />
      {status === 'loading' ? (
        <View style={styles.playerStatusOverlay} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
      {status === 'error' ? (
        <View style={styles.playerStatusOverlay}>
          <Ionicons name="alert-circle" size={22} color="#fff" />
          <Text style={styles.playerErrorText}>{playerError?.message || 'This clip could not be played.'}</Text>
          <Pressable style={styles.playerRetryBtn} onPress={onRetry}>
            <Text style={styles.playerRetryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  const pillTint = `${colors.primaryRed}17`;
  const chipActiveTint = `${colors.primaryRed}20`;
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
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { fontSize: 18, fontFamily: fonts.displayBlack, color: colors.text },
    filterIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 8 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    emptyTitle: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text, marginTop: 4 },
    emptyBody: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center' },
    findTutorBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    findTutorBtnText: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      backgroundColor: colors.surface,
      borderRadius: 13,
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.body, color: colors.text },
    chipsRow: { flexGrow: 0, marginBottom: 14 },
    chipsContent: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 2 },
    chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
    chipActive: { backgroundColor: chipActiveTint, borderColor: colors.primaryRed },
    chipText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text },
    chipTextActive: { color: colors.primaryRed },
    noClipsText: { textAlign: 'center', color: colors.textFaint, fontFamily: fonts.body, fontSize: 13, marginTop: 30 },
    list: { gap: 12, marginTop: 4 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      padding: 12,
    },
    cover: { width: 76, height: 60, borderRadius: 13, overflow: 'hidden', flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
    coverCircle: {
      position: 'absolute',
      width: 90,
      height: 90,
      borderRadius: 45,
      right: -24,
      top: -40,
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    cardBody: { flex: 1 },
    pill: { alignSelf: 'flex-start', backgroundColor: pillTint, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginBottom: 5 },
    pillText: { fontSize: 10.5, fontFamily: fonts.bodyBold, color: colors.primaryRed, textTransform: 'uppercase' },
    cardTitle: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    cardDesc: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 3 },
    playBtn: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end' },
    sheetBackdropTouch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 34,
    },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    sheetLabel: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textFaint, marginBottom: 8 },
    applyBtn: { backgroundColor: colors.primaryRed, borderRadius: 13, alignItems: 'center', paddingVertical: 13, marginTop: 20 },
    applyBtnText: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    detailScreen: { flex: 1, backgroundColor: colors.background },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
    detailTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text, marginHorizontal: 10 },
    detailContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
    // Edge-to-edge (no horizontal inset) and a fixed height rather than a
    // fixed 16:9 aspect ratio - a vertical/portrait clip (the common case
    // for a short technique video shot on a phone) squeezed into a 16:9 box
    // renders as a thin sliver with huge letterbox bars, leaving almost no
    // visible - or tappable - video at all on a small screen.
    playerFull: { width: '100%', height: Math.round(Dimensions.get('window').height * 0.55), backgroundColor: '#000' },
    playerInner: { width: '100%', height: '100%' },
    playerStatusOverlay: {
      position: 'absolute',
      inset: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.55)',
      gap: 10,
      paddingHorizontal: 24,
    },
    playerErrorText: { color: '#fff', fontSize: 12.5, fontFamily: fonts.body, textAlign: 'center', lineHeight: 18 },
    playerRetryBtn: {
      backgroundColor: colors.primaryRed,
      borderRadius: 999,
      paddingHorizontal: 18,
      paddingVertical: 9,
    },
    playerRetryText: { color: '#fff', fontSize: 12.5, fontFamily: fonts.bodyBold },
    webviewBoxFull: { width: '100%', height: Math.round(Dimensions.get('window').height * 0.55), overflow: 'hidden', backgroundColor: '#000' },
    webview: { flex: 1 },
    detailMeta: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.primaryRed, textTransform: 'uppercase', marginTop: 16 },
    detailDesc: { fontSize: 13.5, fontFamily: fonts.body, color: colors.textSoft, marginTop: 8, lineHeight: 20 },
  });
}

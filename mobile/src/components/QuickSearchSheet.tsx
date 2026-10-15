import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from '../api/client';
import * as performersApi from '../api/performers';
import type { PerformerSummary } from '../api/performers';
import * as tutorsApi from '../api/tutors';
import type { TutorSummary } from '../api/types';
import { useQuickSearch } from '../context/QuickSearchContext';
import type { MainStackParamList } from '../navigation/types';
import Avatar from './Avatar';
import GlassSurface from './GlassSurface';
import { liquidTabBarStyle } from './LiquidTabBar';
import { fonts } from '../theme/fonts';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/useTheme';
import { matchesAnyCategory } from '../utils/searchSynonyms';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAG_CLOSE_DISTANCE = 120;
const DRAG_CLOSE_VELOCITY = 1.1;
const TRIGGER_SIZE = 44;
const TRIGGER_TAP_SLOP = 6;
const TRIGGER_POSITION_KEY = 'mt-quick-search-trigger-position';

type Category = 'tutors' | 'performers';
type Row = { id: number; name: string; photoUrl: string | null; subtitle: string; categories: string[] };

function tutorToRow(t: TutorSummary): Row {
  const bits = [t.categories.join(', '), t.avgRating != null ? `★ ${t.avgRating.toFixed(1)}` : null].filter(Boolean);
  return { id: t.id, name: t.name, photoUrl: t.photoUrl, subtitle: bits.join(' · ') || 'Tutor', categories: t.categories };
}

function performerToRow(p: PerformerSummary): Row {
  const bits = [p.categories.join(', '), p.city].filter(Boolean);
  return { id: p.id, name: p.name, photoUrl: p.photoUrl, subtitle: bits.join(' · ') || 'Performer', categories: p.categories };
}

const SEARCH_PLACEHOLDER: Record<Category, string> = {
  tutors: 'Search tutors by name or subject',
  performers: 'Search performers by name or act',
};

// Two ways to open this: DashboardScreen calls open() itself (useFocusEffect,
// every time Home gains focus - see QuickSearchContext), and the small
// edge-attached trigger button below is always available too, for opening
// it manually from any tab. Mounted once from TabsRouter.tsx as a sibling
// of whichever tab set is active. Deliberately a fast discovery list into
// the real FindTutor/FindPerformer screens, not a second copy of their
// filtering/booking logic - tapping a row just gets the user there faster
// than digging through Dashboard/Library/More.
export default function QuickSearchSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { visible, open, close, triggerVisible } = useQuickSearch();

  // Separate from `visible` (the requested open/closed state) so the
  // close animation gets to finish playing before the overlay unmounts.
  const [rendered, setRendered] = useState(false);
  const [category, setCategory] = useState<Category>('tutors');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const load = useCallback((cat: Category) => {
    setLoading(true);
    setError(null);
    const request = cat === 'tutors'
      ? tutorsApi.searchTutors({}).then((d) => d.tutors.map(tutorToRow))
      : performersApi.fetchPerformers().then((d) => d.performers.map(performerToRow));
    request
      .then((mapped) => setRows(mapped))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load results.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      setQuery('');
      load(category);
      translateY.setValue(SCREEN_HEIGHT);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, mass: 0.9, stiffness: 220 }).start();
      // Only re-run when visibility flips open, not on every category
      // change - selectCategory below reloads explicitly while open.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    } else if (rendered) {
      Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }).start(() => {
        setRendered(false);
      });
    }
  }, [visible]);

  const selectCategory = useCallback((cat: Category) => {
    if (cat === category) return;
    setCategory(cat);
    setQuery('');
    load(cat);
  }, [category, load]);

  const goToFullScreen = useCallback(() => {
    close();
    const target = category === 'tutors' ? 'FindTutor' : 'FindPerformer';
    // This component is mounted as a sibling of the active *Tabs
    // navigator (from TabsRouter.tsx), not nested inside it, so the
    // nearest navigation context here is already MainStack itself - where
    // FindTutor/FindPerformer are registered directly (MainStack.tsx),
    // same as every other caller of these two routes.
    navigation.navigate(target as never);
  }, [category, close, navigation]);

  // Only the handle strip is a pan responder target, not the list below it -
  // otherwise a vertical swipe on the list would fight FlatList's own scroll.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderMove: (_evt, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy > DRAG_CLOSE_DISTANCE || gesture.vy > DRAG_CLOSE_VELOCITY) {
          close();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, mass: 0.9, stiffness: 220 }).start();
        }
      },
    }),
  ).current;

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(q) || row.subtitle.toLowerCase().includes(q) || matchesAnyCategory(row.categories, q));
  }, [rows, query]);

  const tabBarBottom = liquidTabBarStyle(colors, insets).bottom as number;

  // Draggable trigger - starts pinned above the tab bar, but can be moved
  // anywhere and remembers where it was left (AsyncStorage), same as the
  // sheet itself is independent of where the trigger sits.
  const clampToScreen = useCallback((point: { x: number; y: number }) => ({
    x: Math.max(4, Math.min(point.x, SCREEN_WIDTH - TRIGGER_SIZE - 4)),
    y: Math.max(insets.top + 4, Math.min(point.y, SCREEN_HEIGHT - TRIGGER_SIZE - 4)),
  }), [insets.top]);

  const defaultTriggerPos = useRef(
    clampToScreen({ x: SCREEN_WIDTH - TRIGGER_SIZE - 12, y: SCREEN_HEIGHT - tabBarBottom - 74 - TRIGGER_SIZE }),
  ).current;
  const triggerPan = useRef(new Animated.ValueXY(defaultTriggerPos)).current;
  const triggerPos = useRef(defaultTriggerPos);

  useEffect(() => {
    const id = triggerPan.addListener((value) => { triggerPos.current = value; });
    return () => triggerPan.removeListener(id);
  }, [triggerPan]);

  useEffect(() => {
    AsyncStorage.getItem(TRIGGER_POSITION_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (typeof saved.x === 'number' && typeof saved.y === 'number') {
          triggerPan.setValue(clampToScreen(saved));
        }
      } catch {
        // Corrupt/old value - keep the default position.
      }
    });
    // Only ever loaded once on mount - a live drag shouldn't get
    // overwritten by this resolving late.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        triggerPan.setOffset(triggerPos.current);
        triggerPan.setValue({ x: 0, y: 0 });
      },
      // NOT native-driven, despite the temptation - Animated.event with
      // useNativeDriver:true as a PanResponder onPanResponderMove handler
      // crashes under Fabric ("Object is not a function" inside React
      // Native's own PanResponder.js, trying to invoke the native-driven
      // event object as a plain callback). PanResponder's move handler
      // needs a real JS function it can call directly on every touch move;
      // native-driven Animated.event only works wired to an actual event
      // prop (onScroll, etc.), not invoked manually like this. The
      // release-time spring below is a separate, standalone animation call
      // (not a PanResponder callback) and stays native-driven safely.
      onPanResponderMove: Animated.event([null, { dx: triggerPan.x, dy: triggerPan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_evt, gesture) => {
        triggerPan.flattenOffset();
        if (Math.abs(gesture.dx) < TRIGGER_TAP_SLOP && Math.abs(gesture.dy) < TRIGGER_TAP_SLOP) {
          open();
          return;
        }
        const clamped = clampToScreen(triggerPos.current);
        Animated.spring(triggerPan, { toValue: clamped, useNativeDriver: true, damping: 24, stiffness: 260 }).start();
        AsyncStorage.setItem(TRIGGER_POSITION_KEY, JSON.stringify(clamped)).catch(() => {});
      },
    }),
  ).current;

  return (
    <>
      {triggerVisible ? (
        <Animated.View
          {...triggerResponder.panHandlers}
          style={[styles.trigger, { transform: triggerPan.getTranslateTransform() }]}
          accessibilityRole="button"
          accessibilityLabel="Quick search - drag to move, tap to open"
        >
          <GlassSurface clear pointerEvents="none" style={StyleSheet.absoluteFill} />
          <Ionicons name="search" size={20} color={colors.text} />
        </Animated.View>
      ) : null}

      {rendered ? (
        <KeyboardAvoidingView
          style={[StyleSheet.absoluteFill, styles.sheetLayer]}
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={close} />
          <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 14, transform: [{ translateY }] }]}>
            <GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} />
            <View {...panResponder.panHandlers} style={styles.handleArea}>
              <View style={styles.handle} />
              <Text style={styles.title}>Quick Search</Text>
            </View>

            <View style={styles.segmentRow}>
              <Pressable
                style={[styles.segment, category === 'tutors' && { backgroundColor: colors.primaryRed }]}
                onPress={() => selectCategory('tutors')}
              >
                <Text style={[styles.segmentText, { color: category === 'tutors' ? colors.onPrimary : colors.text }]}>Find a Tutor</Text>
              </Pressable>
              <Pressable
                style={[styles.segment, category === 'performers' && { backgroundColor: colors.primaryRed }]}
                onPress={() => selectCategory('performers')}
              >
                <Text style={[styles.segmentText, { color: category === 'performers' ? colors.onPrimary : colors.text }]}>Find a Performer</Text>
              </Pressable>
            </View>

            <View style={styles.searchBar}>
              <Ionicons name="search" size={16} color={colors.textFaint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={SEARCH_PLACEHOLDER[category]}
                placeholderTextColor={colors.textFaint}
                style={styles.searchInput}
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textFaint} />
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
            ) : (
              <FlatList
                data={filteredRows}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.list}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={<Text style={styles.emptyText}>{query ? 'No matches.' : 'No results yet.'}</Text>}
                renderItem={({ item }) => (
                  <Pressable style={styles.row} onPress={goToFullScreen}>
                    <Avatar name={item.name} photoUrl={item.photoUrl} size={42} viewable={false} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.rowSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                  </Pressable>
                )}
              />
            )}

            <Pressable style={styles.seeAllBtn} onPress={goToFullScreen}>
              <Text style={[styles.seeAllText, { color: colors.primaryRed }]}>
                {category === 'tutors' ? 'See all tutors' : 'See all performers'}
              </Text>
              <Ionicons name="arrow-forward" size={15} color={colors.primaryRed} />
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      ) : null}
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    trigger: {
      // All real positioning comes from triggerPan's translateX/Y transform
      // (screen-space coordinates) - this is just the (0,0) origin the
      // transform offsets from, not a resting position of its own.
      position: 'absolute',
      top: 0,
      left: 0,
      width: TRIGGER_SIZE,
      height: TRIGGER_SIZE,
      borderRadius: TRIGGER_SIZE / 2,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      // No solid fill here - GlassSurface below provides the actual glass
      // background. A solid color on this container would sit behind (and
      // defeat) that translucency.
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: colors.background === '#000000' ? 0.44 : 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: Platform.OS === 'android' ? 14 : 0,
      zIndex: 50,
    },
    // The KeyboardAvoidingView itself replaces what used to be the sheet's
    // own position:'absolute' bottom-anchoring - flex + flex-end achieves
    // the same bottom-pinned look while still letting the "padding"
    // behavior push the whole layer (backdrop + sheet) up over the
    // keyboard on iOS, instead of the keyboard just overlaying a
    // fixed-position sheet and covering the search input inside it.
    sheetLayer: { justifyContent: 'flex-end' },
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: {
      maxHeight: '75%',
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 10 },
    title: { fontSize: 15, fontFamily: fonts.displayBlack, color: colors.text },
    segmentRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
    segment: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    segmentText: { fontSize: 13, fontFamily: fonts.bodyBold },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 10,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 10 : 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    searchInput: { flex: 1, fontSize: 13.5, fontFamily: fonts.body, color: colors.text, padding: 0 },
    centered: { paddingVertical: 40, alignItems: 'center', justifyContent: 'center' },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, fontSize: 13 },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, fontSize: 13, textAlign: 'center', paddingVertical: 30 },
    list: { paddingHorizontal: 16, paddingBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowName: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    rowSubtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    seeAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
    seeAllText: { fontSize: 13, fontFamily: fonts.bodyBold },
  });
}

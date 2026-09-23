import { FlatList, ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, PanResponder, Platform, StyleSheet, Text, TextInput, View,  } from 'react-native';
import TutorDiscoveryMap from '../components/TutorDiscoveryMap';

import { ApiError } from '../api/client';
import * as tutorsApi from '../api/tutors';
import type { AgeGroup, TutorSummary } from '../api/types';
import Avatar from '../components/Avatar';
import BackButton from '../components/BackButton';
import PrimaryButton from '../components/PrimaryButton';
import { useTourTarget } from '../context/TourTargetsContext';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';
import { matchesAnyCategory } from '../utils/searchSynonyms';

type Props = NativeStackScreenProps<MainStackParamList, 'FindTutor'>;

const LESSON_TYPES: { value: 'online' | 'physical' | 'studio'; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'physical', label: 'Tutor travels to me' },
  { value: 'studio', label: 'I travel to tutor' },
];

function stars(rating: number) {
  const full = Math.round(rating);
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
}

export default function FindTutorScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const searchTargetRef = useTourTarget('find-tutor-search');
  const filterTargetRef = useTourTarget('find-tutor-filter');
  const chipsTargetRef = useTourTarget('find-tutor-chips');
  const listTargetRef = useTourTarget('find-tutor-list');
  const assignForStudent = route.params?.assignForStudent || null;
  const orgScope = route.params?.orgScope || null;
  const [subjects, setSubjects] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [ageGroups, setAgeGroups] = useState<AgeGroup[]>([]);
  const [category, setCategory] = useState<string | null>(assignForStudent?.preferredCategories[0] || null);
  const [filters, setFilters] = useState<{ genre: string | null; ageGroup: string | null; city: string; lessonType: 'online' | 'physical' | 'studio' | null }>({
    genre: null,
    ageGroup: null,
    city: '',
    lessonType: null,
  });
  const [query, setQuery] = useState('');
  const [tutors, setTutors] = useState<TutorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestTarget, setRequestTarget] = useState<TutorSummary | null>(null);
  const [matchingOpen, setMatchingOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [expandedMapList, setExpandedMapList] = useState(false);
  const showMap = filters.lessonType === 'physical' || filters.lessonType === 'studio';
  const sheetDrag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderRelease: (_, gesture) => { if (Math.abs(gesture.dy) > 15) setExpandedMapList(gesture.dy < 0); },
  }), []);

  useEffect(() => {
    tutorsApi.fetchTaxonomy().then((data) => {
      // Assigning on behalf of a sponsored student stays limited to the
      // courses they're already taking or have requested, so the match
      // still "follows the courses" instead of drifting to something new.
      setSubjects(assignForStudent?.preferredCategories.length ? assignForStudent.preferredCategories : data.subjects);
      setGenres(data.genres);
      setAgeGroups(data.ageGroups);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }).catch(() => {});
  }, []);

  const search = useCallback(
    async (nextCategory: string | null, nextFilters: typeof filters) => {
      setLoading(true);
      setError(null);
      try {
        const data = await tutorsApi.searchTutors({
          category: nextCategory || undefined,
          genre: nextFilters.genre || undefined,
          ageGroup: nextFilters.ageGroup || undefined,
          city: nextFilters.city || undefined,
          lessonType: nextFilters.lessonType || undefined,
          orgId: orgScope?.id,
        });
        setTutors(data.tutors);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load tutors.');
      } finally {
        setLoading(false);
      }
    },
    [orgScope?.id],
  );

  useEffect(() => {
    search(category, filters);
    // Only on mount - subsequent searches are user-triggered (chip tap,
    // filter apply), not a dependency-driven refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeFilterCount = [filters.genre, filters.ageGroup, filters.city, filters.lessonType].filter(Boolean).length;

  // The API only filters by category/genre/ageGroup/city/lessonType, not
  // free text - "search subject, genre or tutor" is applied client-side
  // across what's already been fetched.
  const visibleTutors = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tutors;
    return tutors.filter((t) => {
      const haystack = [t.name, ...t.categories, ...t.genres, t.bio || ''].join(' ').toLowerCase();
      return haystack.includes(needle) || matchesAnyCategory(t.categories, needle);
    });
  }, [tutors, query]);

  function onSelectChip(subject: string | null) {
    setCategory(subject);
    search(subject, filters);
  }

  function onApplyFilters(next: typeof filters) {
    setFilters(next);
    setFilterSheetOpen(false);
    search(category, next);
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { zIndex: 2 }]}>
        {showMap ? <LinearGradient pointerEvents="none" colors={[colors.background, `${colors.background}ee`, `${colors.background}00`]} locations={[0, 0.6, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: -28 }} /> : null}
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Find a Tutor</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* bottom matches the draggable tutor-list sheet below (an opaque
          view stacked on top of this, since it's the later sibling) rather
          than 0 - Leaflet only knows the map container's own real height,
          so if this extended the full screen behind that opaque sheet,
          fitBounds/popup placement could put a marker's popup exactly
          where the sheet covers it, hiding whatever's lower in the popup
          (the "Show route distance" button, being last) without it ever
          having failed to render - it was just never visible. */}
      {showMap ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: expandedMapList ? '80%' : '38%' }}><TutorDiscoveryMap tutors={visibleTutors} mode={filters.lessonType!} onProfile={id => navigation.navigate('CounterpartProfile', { type: 'tutor', id })} /></View> : null}
      <View style={showMap ? { position: 'absolute', bottom: 0, left: 0, right: 0, height: expandedMapList ? '80%' : '38%', backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' } : { flex: 1 }}>
      {showMap ? <View {...sheetDrag.panHandlers} accessible accessibilityLabel="Drag up or down to resize tutor list" style={{ padding: 12, alignItems: 'center' }}><View style={{ width: 44, height: 5, backgroundColor: '#999', borderRadius: 3 }} /><Text style={{ color: colors.text }}>Drag to browse tutors</Text></View> : null}
      <ScrollView contentContainerStyle={styles.content}>
        {assignForStudent ? (
          <View style={styles.assignBanner}>
            <Ionicons name="people" size={15} color={colors.primaryRed} />
            <Text style={styles.assignBannerText}>Matching {assignForStudent.name} with a tutor</Text>
          </View>
        ) : orgScope ? (
          <View style={styles.assignBanner}>
            <Ionicons name="business" size={15} color={colors.primaryRed} />
            <Text style={styles.assignBannerText}>Showing {orgScope.name}'s own tutors</Text>
          </View>
        ) : null}

        <View ref={searchTargetRef} collapsable={false} style={styles.searchRow}>
          <Ionicons name="search" size={17} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search subject, genre or tutor"
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <Pressable
          ref={filterTargetRef}
          style={({ pressed }) => [styles.filterRow, pressed && styles.filterRowPressed]}
          onPress={() => setFilterSheetOpen(true)}
          hitSlop={8}
        >
          <Ionicons name="options" size={18} color={colors.primaryRed} />
          <Text style={styles.filterRowText}>Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</Text>
        </Pressable>

        <View ref={chipsTargetRef} collapsable={false}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
          data={subjects}
          keyExtractor={(s) => s}
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
        </View>

        <View ref={listTargetRef} collapsable={false} style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Recommended tutors</Text>
          {!loading ? <Text style={styles.sectionCount}>{visibleTutors.length} nearby</Text> : null}
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primaryRed} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : visibleTutors.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No tutors match yet - try a different subject.</Text>
          </View>
        ) : (
          visibleTutors.map((tutor) => (
            <TutorCard
              key={tutor.id}
              tutor={tutor}
              colors={colors}
              assignStudentName={assignForStudent?.name}
              onRequest={() => setRequestTarget(tutor)}
              onViewProfile={() => navigation.navigate('CounterpartProfile', { type: 'tutor', id: tutor.id })}
            />
          ))
        )}

        {!assignForStudent && !orgScope ? (
          <View style={styles.notSureCard}>
            <View style={styles.notSureIcon}>
              <Ionicons name="help-buoy" size={20} color={colors.primaryRed} />
            </View>
            <Text style={styles.notSureTitle}>Not sure who to pick?</Text>
            <Text style={styles.notSureSub}>Get suggested rates and find tutors within your budget - describe what you need and matching tutors respond with an offer.</Text>
            <PrimaryButton title="Get suggested rates" onPress={() => setMatchingOpen(true)} style={styles.notSureBtn} />
            <Pressable style={styles.notSureLink} onPress={() => navigation.navigate('TutorResponses')}>
              <Text style={styles.notSureLinkText}>View my requests & responses</Text>
              <Ionicons name="chevron-forward" size={13} color={colors.primaryRed} />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      </View>

      <RequestSheet tutor={requestTarget} assignForStudent={assignForStudent} onClose={() => setRequestTarget(null)} colors={colors} />
      <MatchingSheet
        visible={matchingOpen}
        onClose={() => setMatchingOpen(false)}
        subjects={subjects}
        colors={colors}
        onSent={() => { setMatchingOpen(false); navigation.navigate('TutorResponses'); }}
      />
      <FilterSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        onApply={onApplyFilters}
        initial={filters}
        genres={genres}
        ageGroups={ageGroups}
        colors={colors}
      />
    </View>
  );
}

function TutorCard({
  tutor,
  colors,
  assignStudentName,
  onRequest,
  onViewProfile,
}: {
  tutor: TutorSummary;
  colors: ThemeColors;
  assignStudentName?: string;
  onRequest: () => void;
  onViewProfile: () => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const subtitle = [tutor.categories[0], tutor.genres[0], tutor.levels[0]].filter(Boolean).join(' · ');
  const tags = [
    tutor.teachesOnline ? 'Online' : null,
    tutor.city,
    tutor.ageGroups[0] || null,
  ].filter(Boolean) as string[];

  return (
    <Pressable style={styles.card} onPress={onViewProfile}>
      <View style={styles.cardTopRow}>
        <Avatar name={tutor.name} photoUrl={tutor.photoUrl} size={56} />
        <View style={styles.cardIdentity}>
          <Text style={styles.cardName}>{tutor.name}</Text>
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
          {tutor.avgRating ? (
            <Text style={styles.cardRating}>
              {stars(tutor.avgRating)} <Text style={styles.cardRatingNum}>{tutor.avgRating.toFixed(1)}</Text>
            </Text>
          ) : null}
        </View>
        <View style={styles.pricePill}>
          <Text style={styles.pricePillText}>
            {tutor.symbol}{tutor.hourlyRateLocal}/hr
          </Text>
        </View>
      </View>

      {tags.length ? (
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <PrimaryButton
        title={assignStudentName ? `Match with ${assignStudentName.split(' ')[0]}` : `Request ${tutor.name.split(' ')[0]}`}
        onPress={onRequest}
        style={styles.cardBtn}
      />
    </Pressable>
  );
}

function RequestSheet({
  tutor,
  assignForStudent,
  onClose,
  colors,
}: {
  tutor: TutorSummary | null;
  assignForStudent: { id: number; name: string; preferredCategories: string[] } | null;
  onClose: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [lessonType, setLessonType] = useState<'online' | 'physical' | 'studio'>('online');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (tutor) {
      setLessonType(tutor.teachesOnline ? 'online' : 'physical');
      setCity('');
      setNotes('');
      setError(null);
      setSent(false);
    }
  }, [tutor]);

  async function send() {
    if (!tutor) return;
    if (lessonType !== 'online' && !city.trim()) {
      setError('Enter your city for an in-person lesson.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      // When assigning on behalf of a student, keep the match on a course
      // they actually take/want if the tutor teaches it - otherwise fall
      // back to the tutor's primary subject.
      const matchedCategory = assignForStudent
        ? tutor.categories.find((c) => assignForStudent.preferredCategories.includes(c)) || tutor.categories[0]
        : tutor.categories[0];
      await tutorsApi.requestTutor({
        category: matchedCategory,
        lessonType,
        city: lessonType !== 'online' ? city.trim() : undefined,
        notes: notes.trim() || undefined,
        preferredTutorIds: [tutor.id],
        assignStudentId: assignForStudent?.id,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send that request.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={!!tutor} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.sheetBackdropTouch} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          {tutor && !sent ? (
            <>
              <Text style={styles.sheetTitle}>
                {assignForStudent ? `Match ${assignForStudent.name} with ${tutor.name}` : `Request ${tutor.name}`}
              </Text>
              <Text style={styles.sheetLabel}>Lesson type</Text>
              <View style={styles.segmentRow}>
                {LESSON_TYPES.map((opt) => {
                  const active = lessonType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.segment, active && { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed }]}
                      onPress={() => setLessonType(opt.value)}
                    >
                      <Text style={[styles.segmentText, active && { color: colors.onPrimary }]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {lessonType !== 'online' ? (
                <>
                  <Text style={styles.sheetLabel}>Your city</Text>
                  <TextInput style={styles.sheetInput} value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.textFaint} />
                </>
              ) : null}
              <Text style={styles.sheetLabel}>Note (optional)</Text>
              <TextInput
                style={[styles.sheetInput, styles.sheetTextarea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Tell them what you want to learn…"
                placeholderTextColor={colors.textFaint}
                multiline
              />
              {error ? <Text style={styles.sheetError}>{error}</Text> : null}
              <PrimaryButton title="Send request" onPress={send} loading={sending} style={styles.sheetSubmit} />
            </>
          ) : tutor && sent ? (
            <View style={styles.sentState}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              <Text style={styles.sheetTitle}>Request sent</Text>
              <Text style={styles.sheetLabel}>
                {assignForStudent
                  ? `${tutor.name} will be notified and can accept the match with ${assignForStudent.name}.`
                  : `${tutor.name} will be notified. You'll see this in your courses once matched.`}
              </Text>
              <PrimaryButton title="Done" onPress={onClose} style={styles.sheetSubmit} />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// The "Smart Match" funnel - a negotiate request with no specific tutor
// (preferredTutorIds: []), broadcasting to any matching tutor instead of
// requesting one by name.
function MatchingSheet({
  visible,
  onClose,
  subjects,
  colors,
  onSent,
}: {
  visible: boolean;
  onClose: () => void;
  subjects: string[];
  colors: ThemeColors;
  onSent: () => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [category, setCategory] = useState<string | null>(null);
  const [lessonType, setLessonType] = useState<'online' | 'physical' | 'studio'>('online');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [budget, setBudget] = useState('');
  const [suggestedRate, setSuggestedRate] = useState<{ amountLocal: number; symbol: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (visible) {
      setCategory(null);
      setLessonType('online');
      setCity('');
      setNotes('');
      setBudget('');
      setSuggestedRate(null);
      setError(null);
      setSent(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!category) {
      setSuggestedRate(null);
      return;
    }
    let cancelled = false;
    tutorsApi
      .fetchBenchmarkRate(category)
      .then((data) => {
        if (!cancelled) setSuggestedRate(data.rate ? { amountLocal: data.rate.amountLocal, symbol: data.rate.symbol } : null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [category]);

  async function send() {
    if (!category) {
      setError('Choose a subject.');
      return;
    }
    if (lessonType !== 'online' && !city.trim()) {
      setError('Enter your city for an in-person lesson.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await tutorsApi.requestTutor({
        category,
        lessonType,
        city: lessonType !== 'online' ? city.trim() : undefined,
        notes: notes.trim() || undefined,
        preferredTutorIds: [],
        suggestedAmountUsd: budget.trim() ? Number(budget.trim()) : undefined,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send that request.');
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
          {!sent ? (
            <>
              <Text style={styles.sheetTitle}>Smart Match</Text>
              <Text style={styles.sheetLabel}>Subject</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                {subjects.map((s) => {
                  const active = category === s;
                  return (
                    <Pressable
                      key={s}
                      style={[styles.chip, { marginHorizontal: 4 }, active && { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed }]}
                      onPress={() => setCategory(s)}
                    >
                      <Text style={[styles.chipText, active && { color: colors.onPrimary }]}>{s}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={styles.sheetLabel}>Lesson type</Text>
              <View style={styles.segmentRow}>
                {LESSON_TYPES.map((opt) => {
                  const active = lessonType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.segment, active && { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed }]}
                      onPress={() => setLessonType(opt.value)}
                    >
                      <Text style={[styles.segmentText, active && { color: colors.onPrimary }]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {lessonType !== 'online' ? (
                <>
                  <Text style={styles.sheetLabel}>Your city</Text>
                  <TextInput style={styles.sheetInput} value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.textFaint} />
                </>
              ) : null}
              <Text style={styles.sheetLabel}>Suggested rate you&apos;re willing to pay (optional)</Text>
              {suggestedRate ? (
                <Text style={styles.suggestedRateHint}>
                  Tutors for {category} typically charge around {suggestedRate.symbol}{suggestedRate.amountLocal}/hr
                </Text>
              ) : null}
              <View style={styles.amountInputWrap}>
                <Text style={styles.amountInputSymbol}>{suggestedRate?.symbol || '$'}</Text>
                <TextInput
                  style={styles.amountInput}
                  value={budget}
                  onChangeText={setBudget}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 15"
                  placeholderTextColor={colors.textFaint}
                />
                <Text style={styles.amountInputSuffix}>/hr</Text>
              </View>
              <Text style={styles.sheetLabel}>Note (optional)</Text>
              <TextInput
                style={[styles.sheetInput, styles.sheetTextarea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="What are you looking for?"
                placeholderTextColor={colors.textFaint}
                multiline
              />
              {error ? <Text style={styles.sheetError}>{error}</Text> : null}
              <PrimaryButton title="Send request" onPress={send} loading={sending} style={styles.sheetSubmit} />
            </>
          ) : (
            <View style={styles.sentState}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              <Text style={styles.sheetTitle}>Request sent</Text>
              <Text style={styles.sheetLabel}>Matching tutors have been notified. Review their responses and pick one when you're ready.</Text>
              <PrimaryButton title="View responses" onPress={onSent} style={styles.sheetSubmit} />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface FilterValues {
  genre: string | null;
  ageGroup: string | null;
  city: string;
  lessonType: 'online' | 'physical' | 'studio' | null;
}

// Refines the visible tutor list itself (server-side, via /api/tutors) -
// separate from the Smart Match wizard above, which starts a request
// rather than filtering.
function FilterSheet({
  visible,
  onClose,
  onApply,
  initial,
  genres,
  ageGroups,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: (values: FilterValues) => void;
  initial: FilterValues;
  genres: string[];
  ageGroups: AgeGroup[];
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [genre, setGenre] = useState<string | null>(initial.genre);
  const [ageGroup, setAgeGroup] = useState<string | null>(initial.ageGroup);
  const [city, setCity] = useState(initial.city);
  const [lessonType, setLessonType] = useState<'online' | 'physical' | 'studio' | null>(initial.lessonType);

  useEffect(() => {
    if (visible) {
      setGenre(initial.genre);
      setAgeGroup(initial.ageGroup);
      setCity(initial.city);
      setLessonType(initial.lessonType);
    }
  }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.sheetBackdropTouch} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Filters</Text>

          <Text style={styles.sheetLabel}>Lesson type</Text>
          <View style={styles.segmentRow}>
            {LESSON_TYPES.map((opt) => {
              const active = lessonType === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.segment, active && { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed }]}
                  onPress={() => setLessonType(active ? null : opt.value)}
                >
                  <Text style={[styles.segmentText, active && { color: colors.onPrimary }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>City</Text>
          <TextInput style={styles.sheetInput} value={city} onChangeText={setCity} placeholder="Any city" placeholderTextColor={colors.textFaint} />

          {genres.length ? (
            <>
              <Text style={styles.sheetLabel}>Genre</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                {genres.map((g) => {
                  const active = genre === g;
                  return (
                    <Pressable
                      key={g}
                      style={[styles.chip, { marginHorizontal: 4 }, active && { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed }]}
                      onPress={() => setGenre(active ? null : g)}
                    >
                      <Text style={[styles.chipText, active && { color: colors.onPrimary }]}>{g}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          {ageGroups.length ? (
            <>
              <Text style={styles.sheetLabel}>Age group</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                {ageGroups.map((a) => {
                  const active = ageGroup === a.id;
                  return (
                    <Pressable
                      key={a.id}
                      style={[styles.chip, { marginHorizontal: 4 }, active && { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed }]}
                      onPress={() => setAgeGroup(active ? null : a.id)}
                    >
                      <Text style={[styles.chipText, active && { color: colors.onPrimary }]}>{a.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          <View style={styles.filterBtnRow}>
            <Pressable
              style={styles.clearBtn}
              onPress={() => onApply({ genre: null, ageGroup: null, city: '', lessonType: null })}
            >
              <Text style={styles.clearBtnText}>Clear</Text>
            </Pressable>
            <PrimaryButton
              title="Apply filters"
              onPress={() => onApply({ genre, ageGroup, city: city.trim(), lessonType })}
              style={styles.applyBtn}
            />
          </View>
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
    assignBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: `${colors.primaryRed}12`,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 12,
    },
    assignBannerText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.primaryRed },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.body, color: colors.text },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
      marginBottom: 14,
    },
    filterRowPressed: { opacity: 0.6 },
    filterRowText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    filterBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
    clearBtn: { paddingHorizontal: 16, paddingVertical: 13 },
    clearBtnText: { fontSize: 13.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint },
    applyBtn: { flex: 1 },
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
    notSureCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      padding: 18,
      marginTop: 8,
      alignItems: 'center',
    },
    notSureIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: `${colors.primaryRed}17`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    notSureTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text },
    notSureSub: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', marginTop: 6, lineHeight: 18 },
    notSureBtn: { alignSelf: 'stretch', marginTop: 16 },
    notSureLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14 },
    notSureLinkText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    suggestedRateHint: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginBottom: 8, lineHeight: 16 },
    amountInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.background,
    },
    amountInputSymbol: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.textFaint },
    amountInput: { flex: 1, paddingVertical: 11, paddingHorizontal: 8, fontSize: 14, fontFamily: fonts.body, color: colors.text },
    amountInputSuffix: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint },
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
    cardRating: { fontSize: 12, color: '#EAB308', marginTop: 4, fontFamily: fonts.bodySemiBold },
    cardRatingNum: { color: colors.textFaint, fontFamily: fonts.body },
    pricePill: { backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    pricePillText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    tag: { backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    tagText: { fontSize: 10.5, fontFamily: fonts.bodyBold, color: colors.textSoft },
    cardBtn: { marginTop: 14 },
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
    sheetLabel: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textFaint, marginBottom: 6, marginTop: 10 },
    segmentRow: { flexDirection: 'row', gap: 6 },
    segment: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
    segmentText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.text, textAlign: 'center' },
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
    sheetError: { color: colors.danger, fontFamily: fonts.bodySemiBold, fontSize: 12.5, marginTop: 10 },
    sheetSubmit: { marginTop: 18 },
    sentState: { alignItems: 'center', gap: 8, paddingVertical: 10 },
  });
}

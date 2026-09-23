import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../api/client';
import * as studentsApi from '../api/students';
import * as tutorsApi from '../api/tutors';
import type { StudentPublicProfile } from '../api/students';
import type { TutorPublicProfile, TutorReview } from '../api/types';
import Avatar from '../components/Avatar';
import BackButton from '../components/BackButton';
import PrimaryButton from '../components/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'CounterpartProfile'>;

const VENUE_LABELS: Record<string, string> = {
  student_location: 'Travels to student',
  tutor_studio: "At tutor's studio",
  either: 'Either venue',
};

const LESSON_TYPES: { value: 'online' | 'physical' | 'studio'; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'physical', label: 'Tutor travels to me' },
  { value: 'studio', label: 'I travel to tutor' },
];

function stars(rating: number) {
  const full = Math.round(rating);
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
}

// Mirrors public/tutor-profile.html card-for-card: header card (avatar,
// name + rate, rating line, tag row, address, bio, Request button),
// Qualifications card, Reviews card. Same /api/tutors/:id/public and
// /api/students/:id/public data either way - no email or phone in either
// shape (server-enforced). Reached from My Courses, Find a Tutor, and the
// chat header.
export default function CounterpartProfileScreen({ navigation, route }: Props) {
  const { type, id } = route.params;
  const { user } = useAuth();
  const isOwnTutorProfile = type === 'tutor' && user?.tutorProfileId === id;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tutor, setTutor] = useState<TutorPublicProfile | null>(null);
  const [reviews, setReviews] = useState<TutorReview[]>([]);
  const [student, setStudent] = useState<StudentPublicProfile | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    if (type === 'tutor') {
      tutorsApi
        .fetchTutorPublicProfile(id)
        .then((data) => { setTutor(data.tutor); setReviews(data.reviews); setError(null); })
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this profile.'))
        .finally(() => setLoading(false));
    } else {
      studentsApi
        .fetchStudentPublicProfile(id)
        .then((data) => { setStudent(data.student); setError(null); })
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this profile.'))
        .finally(() => setLoading(false));
    }
  }, [type, id]);

  const name = tutor?.name || student?.name || 'Profile';
  const photoUrl = tutor?.photoUrl ?? student?.photoUrl ?? null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title} numberOfLines={1}>{name}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : tutor ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.identityRow}>
              <Avatar name={tutor.name} photoUrl={tutor.photoUrl} size={72} />
              <View style={{ flex: 1 }}>
                <View style={styles.nameRateRow}>
                  <Text style={styles.name} numberOfLines={1}>{tutor.name}</Text>
                  <Text style={styles.rate}>{tutor.symbol}{tutor.hourlyRateLocal}/hr</Text>
                </View>
                {tutor.avgRating != null ? (
                  <View style={styles.ratingLine}>
                    <Text style={styles.ratingText}>★ {tutor.avgRating.toFixed(1)}</Text>
                    <Text style={styles.metaText}>({tutor.ratingCount} rating{tutor.ratingCount === 1 ? '' : 's'})</Text>
                    {tutor.avgProfessionalism != null ? <Text style={styles.metaText}>Professionalism {tutor.avgProfessionalism.toFixed(1)}/5</Text> : null}
                  </View>
                ) : (
                  <Text style={styles.metaText}>Not yet rated</Text>
                )}
                <Text style={styles.metaText}>{tutor.lessonsCompletedCount || 0} lesson{tutor.lessonsCompletedCount === 1 ? '' : 's'} taught</Text>
              </View>
            </View>

            <View style={styles.pillRow}>
              {tutor.categories.map((c) => <Tag key={`c-${c}`} label={c} colors={colors} accent />)}
              {tutor.genres.map((g) => <Tag key={`g-${g}`} label={g} colors={colors} />)}
              {tutor.city ? <Tag label={`📍 ${tutor.city}${tutor.inPersonVenue ? ` · ${VENUE_LABELS[tutor.inPersonVenue] || ''}` : ''}`} colors={colors} muted /> : null}
              {tutor.teachesOnline ? <Tag label="🌐 Online" colors={colors} success /> : null}
              {tutor.orientationCompleted ? <Tag label="✓ Onboarded" colors={colors} warn /> : null}
            </View>

            {tutor.fullAddress ? (
              <View style={styles.addressRow}>
                <Ionicons name="location" size={13} color={colors.primaryRed} />
                <Text style={styles.addressText}>{tutor.fullAddress}</Text>
              </View>
            ) : tutor.addressLocked ? (
              <View style={styles.addressRow}>
                <Ionicons name="location" size={13} color={colors.textFaint} />
                <Text style={[styles.addressText, styles.addressLocked]}>Exact address shown once you request in-studio lessons with this tutor.</Text>
              </View>
            ) : null}

            <Text style={styles.bio}>{tutor.bio || 'This tutor has not added a bio yet.'}</Text>

            {isOwnTutorProfile ? (
              <PrimaryButton title="Edit Profile" onPress={() => navigation.navigate('TutorEditProfile')} style={styles.requestBtn} />
            ) : (
              <PrimaryButton title="Request This Tutor" onPress={() => setRequestOpen(true)} style={styles.requestBtn} />
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Qualifications</Text>
            <Text style={styles.bio}>{tutor.qualifications || 'No qualifications listed.'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Student Reviews</Text>
            {reviews.length === 0 ? (
              <Text style={styles.noReviews}>No written reviews yet.</Text>
            ) : (
              reviews.map((r, i) => (
                <View key={i} style={[styles.reviewRow, i > 0 && styles.reviewDivider]}>
                  <View style={styles.reviewTopRow}>
                    <Text style={styles.reviewAuthor}>{r.studentFirstName} <Text style={styles.reviewCategory}>· {r.category}</Text></Text>
                    <Text style={styles.ratingText}>★ {r.score}</Text>
                  </View>
                  <Text style={styles.bio}>{r.comment}</Text>
                  <Text style={styles.reviewDate}>{new Date(r.ratedAt).toLocaleDateString()}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      ) : student ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.identityRow}>
              <Avatar name={student.name} photoUrl={student.photoUrl} size={72} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{student.name}</Text>
                <Text style={styles.metaText}>{student.studentProfile?.city || 'Student'}</Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Age group</Text>
              <Text style={styles.summaryValue}>{student.studentProfile?.ageGroup || 'Not set'}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>City</Text>
              <Text style={styles.summaryValue}>{student.studentProfile?.city || 'Not set'}</Text>
            </View>
          </View>
        </ScrollView>
      ) : null}

      {tutor ? <RequestTutorSheet visible={requestOpen} onClose={() => setRequestOpen(false)} tutor={tutor} colors={colors} /> : null}
    </View>
  );
}

function RequestTutorSheet({
  visible,
  onClose,
  tutor,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  tutor: TutorPublicProfile;
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
    if (visible) {
      setLessonType(tutor.teachesOnline ? 'online' : 'physical');
      setCity('');
      setNotes('');
      setError(null);
      setSent(false);
    }
  }, [visible, tutor]);

  async function send() {
    if (lessonType !== 'online' && !city.trim()) {
      setError('Enter your city for an in-person lesson.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await tutorsApi.requestTutor({
        category: tutor.categories[0],
        lessonType,
        city: lessonType !== 'online' ? city.trim() : undefined,
        notes: notes.trim() || undefined,
        preferredTutorIds: [tutor.id],
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
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          {!sent ? (
            <>
              <Text style={styles.sheetTitle}>Request {tutor.name}</Text>
              <Text style={styles.sheetLabel}>Lesson type</Text>
              <View style={styles.segmentRow}>
                {LESSON_TYPES.map((opt) => {
                  const active = lessonType === opt.value;
                  return (
                    <Pressable key={opt.value} style={[styles.segment, active && styles.segmentActive]} onPress={() => setLessonType(opt.value)}>
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
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
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <PrimaryButton title="Send request" onPress={send} loading={sending} style={styles.requestBtn} />
            </>
          ) : (
            <View style={styles.sentState}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              <Text style={styles.sheetTitle}>Request sent</Text>
              <Text style={styles.sheetLabel}>{tutor.name} will be notified.</Text>
              <PrimaryButton title="Done" onPress={onClose} style={styles.requestBtn} />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Tag({ label, colors, accent, muted, success, warn }: { label: string; colors: ThemeColors; accent?: boolean; muted?: boolean; success?: boolean; warn?: boolean }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.tag, accent && styles.tagAccent, muted && styles.tagMuted, success && styles.tagSuccess, warn && styles.tagWarn]}>
      <Text style={[styles.tagText, accent && styles.tagTextAccent, success && styles.tagTextSuccess, warn && styles.tagTextWarn]}>{label}</Text>
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
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 14,
      gap: 10,
    },
    title: { flex: 1, fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center' },
    headerSpacer: { width: 36 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 14,
    },
    cardTitle: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 8 },
    identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 14 },
    nameRateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    name: { fontSize: 18, fontFamily: fonts.displayBlack, color: colors.text, flexShrink: 1 },
    rate: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    ratingLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
    ratingText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: '#B45309' },
    metaText: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
    tag: { backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    tagAccent: { backgroundColor: `${colors.primaryRed}17` },
    tagMuted: { backgroundColor: colors.border },
    tagSuccess: { backgroundColor: `${colors.success}1A` },
    tagWarn: { backgroundColor: '#FEF3C7' },
    tagText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textSoft },
    tagTextAccent: { color: colors.primaryRed },
    tagTextSuccess: { color: colors.success },
    tagTextWarn: { color: '#B45309' },
    addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 10 },
    addressText: { flex: 1, fontSize: 12.5, fontFamily: fonts.body, color: colors.textSoft, lineHeight: 17 },
    addressLocked: { fontStyle: 'italic', color: colors.textFaint },
    bio: { fontSize: 13.5, fontFamily: fonts.body, color: colors.textSoft, lineHeight: 20 },
    requestBtn: { marginTop: 16 },
    noReviews: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    reviewRow: { paddingVertical: 12 },
    reviewDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    reviewTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    reviewAuthor: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    reviewCategory: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint },
    reviewDate: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 4 },
    summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
    summaryLabel: { fontSize: 13, fontFamily: fonts.body, color: colors.textFaint },
    summaryValue: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    summaryDivider: { height: 1, backgroundColor: colors.border },
    // Request sheet
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    sheetLabel: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textFaint, marginBottom: 6, marginTop: 10 },
    segmentRow: { flexDirection: 'row', gap: 6 },
    segment: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
    segmentActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    segmentText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.text, textAlign: 'center' },
    segmentTextActive: { color: colors.onPrimary },
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
    sentState: { alignItems: 'center', gap: 8, paddingVertical: 10 },
  });
}

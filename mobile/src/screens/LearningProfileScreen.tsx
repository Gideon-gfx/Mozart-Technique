import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View,  } from 'react-native';

import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import * as profileApi from '../api/profile';
import * as tutorsApi from '../api/tutors';
import type { AgeGroup, AssignmentSummary } from '../api/types';
import Avatar from '../components/Avatar';
import BackButton from '../components/BackButton';
import PrimaryButton from '../components/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'LearningProfile'>;

const SEX_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Prefer not to say' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
];

const AGREEMENT_TEXT =
  "Your first completed class with each new tutor is free. From the second class, lesson bills are confirmed before payment is released. If your account uses an organization subscription code, your organization is responsible for eligible lesson bills - you will not be charged personally. Be respectful, keep the session safe, and use the platform for matched tutors. End of agreement.";

// Matches agreementScroll's style maxHeight below - short enough that the
// text often fits without scrolling at all, in which case there's nothing
// for the user to physically scroll and the accept checkbox must unlock
// itself (see onContentSizeChange) rather than waiting for a scroll event
// that will never come.
const AGREEMENT_SCROLL_HEIGHT = 100;

function startOfWeekAgo() {
  return Date.now() - 7 * 24 * 60 * 60 * 1000;
}

// Mirrors dashboard.html's "My Learning Profile" modal exactly (same
// /api/profile/student fields) rather than the read-only summary this
// screen started as - reached via the header avatar's parent stack, not a
// web redirect.
export default function LearningProfileScreen({ navigation }: Props) {
  const { user, refresh } = useAuth();
  const { colors } = useTheme();
  const { toast } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [ageGroups, setAgeGroups] = useState<AgeGroup[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [courses, setCourses] = useState<AssignmentSummary[]>([]);

  const [pickSubject, setPickSubject] = useState<string | null>(null);
  const [pickLevel, setPickLevel] = useState<string | null>(null);
  const [settingSubject, setSettingSubject] = useState(false);
  const [subjectError, setSubjectError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState<string | null>(null);
  const [sex, setSex] = useState<string>('');
  const [genre, setGenre] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [agreementAcceptedAt, setAgreementAcceptedAt] = useState<string | null>(null);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [agreementScrolledEnd, setAgreementScrolledEnd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tax, dash, assignmentsData] = await Promise.all([
        tutorsApi.fetchTaxonomy(),
        authApi.fetchDashboardStats(),
        authApi.fetchMyAssignments(),
      ]);
      setGenres(tax.genres);
      setAgeGroups(tax.ageGroups);
      setSubjects(tax.subjects);
      setLevels(tax.levels);
      setCourses(assignmentsData.asStudent || []);
      const p = dash.studentProfile;
      setName(user?.name || '');
      setAgeGroup(p?.ageGroup || null);
      setSex(p?.sex || '');
      setGenre(p?.genres?.[0] || null);
      setCity(p?.city || '');
      setPhotoUrl(user?.photoUrl || null);
      setAgreementAcceptedAt(p?.agreementAcceptedAt || null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your learning profile.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const practiceStats = useMemo(() => {
    const since = startOfWeekAgo();
    let sessionsThisWeek = 0;
    let minutesThisWeek = 0;
    for (const course of courses) {
      for (const session of course.sessions || []) {
        if (new Date(session.loggedAt).getTime() >= since) {
          sessionsThisWeek += 1;
          minutesThisWeek += Number(session.durationMinutes) || 0;
        }
      }
    }
    const hours = Math.floor(minutesThisWeek / 60);
    const mins = minutesThisWeek % 60;
    return { sessionsThisWeek, hoursLabel: minutesThisWeek > 0 ? `${hours}h ${mins}m` : '0h 0m' };
  }, [courses]);

  const agreementAlreadyAccepted = Boolean(agreementAcceptedAt);
  const canCheckAgreement = agreementAlreadyAccepted || agreementScrolledEnd;

  async function changePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast('Permission needed: allow photo library access to upload a photo.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const fileName = asset.fileName || asset.uri.split('/').pop() || 'photo.jpg';
      const type = asset.mimeType || 'image/jpeg';
      const data = await profileApi.uploadPhoto({ uri: asset.uri, name: fileName, type });
      setPhotoUrl(data.url);
    } catch {
      toast('Could not upload photo. Try again in a moment.', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  }

  // Level and primary subject aren't standalone profile fields on the
  // backend (no /api/profile/student field for either) - they're set the
  // same way the web app sets them: by requesting a tutor, which carries
  // category + desiredLevel. This calls that same real endpoint
  // (preferredTutorIds: [] - the negotiate/broadcast form, no specific
  // tutor picked yet) so it lands as a real course, not a fake field.
  async function setSubjectAndLevel() {
    if (!pickSubject) {
      setSubjectError('Choose a subject.');
      return;
    }
    setSettingSubject(true);
    setSubjectError(null);
    try {
      await tutorsApi.requestTutor({
        category: pickSubject,
        desiredLevel: pickLevel || undefined,
        lessonType: 'online',
        preferredTutorIds: [],
      });
      setPickSubject(null);
      setPickLevel(null);
      await load();
    } catch (err) {
      setSubjectError(err instanceof ApiError ? err.message : 'Could not save that.');
    } finally {
      setSettingSubject(false);
    }
  }

  async function save() {
    if (!agreementAlreadyAccepted && !agreementChecked) {
      toast('Read and accept the Student Agreement before saving.', 'error');
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      await profileApi.updateStudentProfile({
        name: name.trim() || undefined,
        ageGroup: ageGroup || null,
        genres: genre ? [genre] : [],
        city: city.trim(),
        sex: sex || null,
        photoUrl: photoUrl || null,
        agreementAccepted: agreementChecked || agreementAlreadyAccepted,
      });
      await refresh();
      setSaved(true);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save. Try again in a moment.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.title}>Learning profile</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Learning profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      {error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.label}>Practice progress</Text>
          <View style={styles.practiceCard}>
            <View style={styles.practiceStat}>
              <Text style={styles.practiceNumber}>{practiceStats.sessionsThisWeek}</Text>
              <Text style={styles.practiceLabel}>Sessions this week</Text>
            </View>
            <View style={styles.practiceDivider} />
            <View style={styles.practiceStat}>
              <Text style={styles.practiceNumber}>{practiceStats.hoursLabel}</Text>
              <Text style={styles.practiceLabel}>Practiced this week</Text>
            </View>
          </View>

          <Text style={[styles.label, styles.labelSpaced]}>Learning summary</Text>
          {courses.length === 0 ? (
            <View style={styles.summaryEmptyCard}>
              <Text style={styles.summaryEmptyText}>
                Pick a subject and level to set your learning summary - this sends a tutor request (the same as Find a Tutor&apos;s Smart Match), so matching tutors can respond.
              </Text>
              <Text style={styles.fieldLabel}>Subject</Text>
              <View style={styles.pillRow}>
                {subjects.map((s) => {
                  const active = pickSubject === s;
                  return (
                    <Pressable key={s} style={[styles.pill, active && styles.pillActive]} onPress={() => setPickSubject(s)}>
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{s}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>Level</Text>
              <View style={styles.pillRow}>
                {levels.map((lvl) => {
                  const active = pickLevel === lvl;
                  return (
                    <Pressable key={lvl} style={[styles.pill, active && styles.pillActive]} onPress={() => setPickLevel(active ? null : lvl)}>
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{lvl}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {subjectError ? <Text style={styles.errorText}>{subjectError}</Text> : null}
              <PrimaryButton title="Save" onPress={setSubjectAndLevel} loading={settingSubject} style={styles.saveBtn} />
              <Pressable style={styles.summaryEmptyLink} onPress={() => navigation.getParent()?.navigate('FindTutor')}>
                <Text style={styles.summaryEmptyLinkText}>Or go to Find a Tutor for more options</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.primaryRed} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Level</Text>
                <Text style={styles.summaryValue}>{courses[0]?.desiredLevel || 'Not set yet'}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Primary subject</Text>
                <Text style={styles.summaryValue}>{courses[0]?.category || 'Not set yet'}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>City</Text>
                <Text style={styles.summaryValue}>{city || 'Not set yet'}</Text>
              </View>
            </View>
          )}

          <Text style={[styles.label, styles.labelSpaced]}>Your details</Text>
          <Text style={styles.hint}>Shared with your matched tutor so they can tailor lessons for you.</Text>

          <View style={styles.avatarRow}>
            <Pressable onPress={changePhoto} disabled={uploadingPhoto}>
              <Avatar name={name || user?.name || '?'} photoUrl={photoUrl} size={64} viewable={false} />
              <View style={styles.avatarBadge}>
                {uploadingPhoto ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Ionicons name="camera" size={13} color={colors.onPrimary} />
                )}
              </View>
            </Pressable>
            <Text style={styles.avatarHint}>Photo for your tutor{'\n'}Tap to change</Text>
          </View>

          <Text style={styles.fieldLabel}>Full name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor={colors.textFaint} />

          <Text style={styles.fieldLabel}>Age group</Text>
          <View style={styles.pillRow}>
            {ageGroups.map((a) => {
              const active = ageGroup === a.id;
              return (
                <Pressable
                  key={a.id}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setAgeGroup(active ? null : a.id)}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{a.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Sex</Text>
          <View style={styles.pillRow}>
            {SEX_OPTIONS.map((opt) => {
              const active = sex === opt.value;
              return (
                <Pressable
                  key={opt.value || 'none'}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setSex(opt.value)}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Preferred genre</Text>
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

          <Text style={styles.fieldLabel}>City or address</Text>
          <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="e.g. Lagos, Nigeria" placeholderTextColor={colors.textFaint} />

          <Text style={[styles.label, styles.labelSpaced]}>Student Agreement</Text>
          <View style={styles.agreementBox}>
            <ScrollView
              style={styles.agreementScroll}
              onContentSizeChange={(_, contentHeight) => {
                if (contentHeight <= AGREEMENT_SCROLL_HEIGHT) setAgreementScrolledEnd(true);
              }}
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 4) setAgreementScrolledEnd(true);
              }}
              scrollEventThrottle={100}
            >
              <Text style={styles.agreementText}>{AGREEMENT_TEXT}</Text>
            </ScrollView>
            <Pressable
              style={styles.checkboxRow}
              onPress={() => canCheckAgreement && setAgreementChecked((v) => !v)}
              disabled={!canCheckAgreement}
            >
              <View style={[styles.checkbox, (agreementChecked || agreementAlreadyAccepted) && styles.checkboxChecked]}>
                {agreementChecked || agreementAlreadyAccepted ? <Ionicons name="checkmark" size={13} color={colors.onPrimary} /> : null}
              </View>
              <Text style={styles.checkboxLabel}>
                {agreementAlreadyAccepted ? 'You already accepted the Student Agreement.' : canCheckAgreement ? 'I have read and accept the Student Agreement.' : 'Scroll to the end to accept the Student Agreement.'}
              </Text>
            </Pressable>
          </View>

          {courses.length ? (
            <>
              <Text style={[styles.label, styles.labelSpaced]}>My courses ({courses.length})</Text>
              <View style={styles.coursesCard}>
                {courses.map((course, index) => (
                  <View key={course.id}>
                    {index > 0 ? <View style={styles.coursesDivider} /> : null}
                    <View style={styles.courseRow}>
                      <View style={styles.courseInfo}>
                        <Text style={styles.courseTitle}>{course.category}</Text>
                        {course.desiredLevel ? <Text style={styles.courseLevel}>{course.desiredLevel}</Text> : null}
                      </View>
                      <Text style={styles.courseStatus}>{course.status}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <PrimaryButton
            title={saved ? 'Saved' : 'Save details'}
            onPress={save}
            loading={saving}
            style={styles.saveBtn}
          />
        </ScrollView>
      )}
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
    },
    title: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text },
    headerSpacer: { width: 36 },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    label: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textFaint, marginBottom: 8 },
    labelSpaced: { marginTop: 24 },
    hint: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: -4, marginBottom: 12, lineHeight: 17 },
    practiceCard: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingVertical: 16,
    },
    practiceStat: { flex: 1, alignItems: 'center' },
    practiceDivider: { width: 1, backgroundColor: colors.border },
    practiceNumber: { fontSize: 20, fontFamily: fonts.displayBlack, color: colors.text },
    practiceLabel: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 3, textAlign: 'center' },
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
    },
    summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
    summaryLabel: { fontSize: 13, fontFamily: fonts.body, color: colors.textFaint },
    summaryValue: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    summaryEmptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    summaryEmptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, lineHeight: 18, marginBottom: 4 },
    summaryEmptyLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 14 },
    summaryEmptyLinkText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    summaryDivider: { height: 1, backgroundColor: colors.border },
    avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
    avatarBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primaryRed,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    avatarHint: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, lineHeight: 16 },
    fieldLabel: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 6, marginTop: 14 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14.5,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    pillActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    pillText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    pillTextActive: { color: colors.onPrimary },
    agreementBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 14,
      backgroundColor: colors.surface,
    },
    agreementScroll: { maxHeight: 100, marginBottom: 10 },
    agreementText: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, lineHeight: 18 },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    checkboxLabel: { flex: 1, fontSize: 12, fontFamily: fonts.body, color: colors.textSoft, lineHeight: 16 },
    coursesCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
    },
    coursesDivider: { height: 1, backgroundColor: colors.border },
    courseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
    courseInfo: { flex: 1 },
    courseTitle: { fontSize: 13.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    courseLevel: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    courseStatus: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.textFaint, textTransform: 'capitalize' },
    saveBtn: { marginTop: 26 },
  });
}

import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../../api/client';
import * as tutorsApi from '../../api/tutors';
import type { MyTutorProfile } from '../../api/tutors';
import BackButton from '../../components/BackButton';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../context/ToastContext';
import type { MainStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'TutorEditProfile'>;

const VENUES: { value: MyTutorProfile['inPersonVenue']; label: string }[] = [
  { value: 'student_location', label: "I travel to the student" },
  { value: 'tutor_studio', label: 'At my studio' },
  { value: 'either', label: 'Either works' },
];

// Everything about the teacher that CounterpartProfileScreen's tutor view
// shows to students - courses, rate, bio, qualifications, city/venue,
// genres, online availability - editable here via the real
// /api/tutors/me/categories, /hourly-rate and /profile routes (the last one
// added this turn specifically so this screen isn't editing fields with
// nowhere real to save to).
export default function TutorEditProfileScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [genreOptions, setGenreOptions] = useState<string[]>([]);

  const [categories, setCategories] = useState<string[]>([]);
  const [hourlyRate, setHourlyRate] = useState('');
  const [bio, setBio] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [city, setCity] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [teachesOnline, setTeachesOnline] = useState(true);
  const [publicExactLocation, setPublicExactLocation] = useState(false);
  const [inPersonVenue, setInPersonVenue] = useState<MyTutorProfile['inPersonVenue']>('either');

  useEffect(() => {
    Promise.all([tutorsApi.fetchMyTutorProfile(), tutorsApi.fetchTaxonomy()])
      .then(([data, tax]) => {
        setSubjects(tax.subjects);
        setGenreOptions(tax.genres);
        if (data.profile) {
          setCategories(data.profile.categories || []);
          setHourlyRate(String(data.profile.hourlyRateUsd || ''));
          setBio(data.profile.bio || '');
          setQualifications(data.profile.qualifications || '');
          setCity(data.profile.city || '');
          setGenres(data.profile.genres || []);
          setTeachesOnline(Boolean(data.profile.teachesOnline));
          setPublicExactLocation(data.profile.publicExactLocation === true);
          setInPersonVenue(data.profile.inPersonVenue || 'either');
        }
      })
      .catch(() => toast('Could not load your profile.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCategory(subject: string) {
    setCategories((prev) => (prev.includes(subject) ? prev.filter((c) => c !== subject) : [...prev, subject]));
  }

  function toggleGenre(genre: string) {
    setGenres((prev) => (prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]));
  }

  async function save() {
    const rate = Number(hourlyRate);
    if (!categories.length) {
      toast('Choose at least one course you teach.', 'error');
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      toast('Enter a valid hourly rate.', 'error');
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        tutorsApi.setMyCategories(categories),
        tutorsApi.setMyHourlyRate(rate),
        tutorsApi.updateMyTutorProfile({ bio: bio.trim(), qualifications: qualifications.trim(), city: city.trim(), genres, teachesOnline, inPersonVenue, publicExactLocation }),
      ]);
      toast('Profile updated.', 'success');
      navigation.goBack();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save your profile.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.title}>Edit Tutor Profile</Text>
          <View style={{ width: 36 }} />
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
        <Text style={styles.title}>Edit Tutor Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: publicExactLocation }} onPress={() => setPublicExactLocation(!publicExactLocation)} style={{ padding: 16, borderWidth: 1, borderColor: colors.primaryRed, borderRadius: 12 }}>
          <Text style={{ color: colors.text }}>{publicExactLocation ? '☑' : '☐'} Publish my exact teaching location</Text>
          <Text style={{ color: colors.text }}>I agree to show my saved location as a street-level pin publicly on web and mobile. Anyone can identify it even without a written street address. Leave this off for an approximate area. Save changes to apply.</Text>
        </Pressable>
        <Text style={styles.label}>Courses you teach</Text>
        <View style={styles.pillRow}>
          {subjects.map((subject) => {
            const active = categories.includes(subject);
            return (
              <Pressable key={subject} style={[styles.pill, active && styles.pillActive]} onPress={() => toggleCategory(subject)}>
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{subject}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, styles.labelSpaced]}>Hourly charge (USD)</Text>
        <TextInput style={styles.input} value={hourlyRate} onChangeText={setHourlyRate} keyboardType="decimal-pad" placeholder="e.g. 25.00" placeholderTextColor={colors.textFaint} />
        <Text style={styles.hint}>Students see this amount converted to their local currency.</Text>

        <Text style={[styles.label, styles.labelSpaced]}>Genres</Text>
        <View style={styles.pillRow}>
          {genreOptions.map((g) => {
            const active = genres.includes(g);
            return (
              <Pressable key={g} style={[styles.pill, active && styles.pillActive]} onPress={() => toggleGenre(g)}>
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{g}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, styles.labelSpaced]}>City</Text>
        <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="e.g. Lagos, Nigeria" placeholderTextColor={colors.textFaint} />

        <Text style={[styles.label, styles.labelSpaced]}>Lesson availability</Text>
        <Pressable style={styles.switchRow} onPress={() => setTeachesOnline((v) => !v)}>
          <Text style={styles.switchLabel}>Teach online</Text>
          <View style={[styles.switchTrack, teachesOnline && styles.switchTrackOn]}>
            <View style={[styles.switchThumb, teachesOnline && styles.switchThumbOn]} />
          </View>
        </Pressable>
        <View style={[styles.pillRow, { marginTop: 10 }]}>
          {VENUES.map((v) => {
            const active = inPersonVenue === v.value;
            return (
              <Pressable key={v.value} style={[styles.pill, active && styles.pillActive]} onPress={() => setInPersonVenue(v.value)}>
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{v.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, styles.labelSpaced]}>Bio</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell students about your teaching style and experience..."
          placeholderTextColor={colors.textFaint}
          multiline
        />

        <Text style={[styles.label, styles.labelSpaced]}>Qualifications</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={qualifications}
          onChangeText={setQualifications}
          placeholder="Degrees, certifications, notable experience..."
          placeholderTextColor={colors.textFaint}
          multiline
        />

        <PrimaryButton title="Save Changes" onPress={save} loading={saving} style={{ marginTop: 24 }} />
      </ScrollView>
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
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    label: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textFaint, marginBottom: 6 },
    labelSpaced: { marginTop: 18 },
    hint: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 4 },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
    pillActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    pillText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    pillTextActive: { color: colors.onPrimary },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    textarea: { minHeight: 80, textAlignVertical: 'top' },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
    switchLabel: { fontSize: 14, fontFamily: fonts.bodyMedium, color: colors.text },
    switchTrack: { width: 42, height: 24, borderRadius: 12, backgroundColor: colors.border, padding: 2, justifyContent: 'center' },
    switchTrackOn: { backgroundColor: colors.primaryRed },
    switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
    switchThumbOn: { alignSelf: 'flex-end' },
  });
}

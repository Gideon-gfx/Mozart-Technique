import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import * as geoApi from '../api/geo';
import * as profileApi from '../api/profile';
import * as tutorsApi from '../api/tutors';
import Avatar from '../components/Avatar';
import BackButton from '../components/BackButton';
import PrimaryButton from '../components/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'EditProfile'>;

// Mirrors edit-profile.html field-for-field: photo, name, tutor-only
// courses + hourly rate, email (read-only), country (read-only - and
// sourced from /api/geo's *current detected* countryCode, same as the web
// form, not the account's stored countryCode, which can lag behind where
// the account actually is). Native, not a web redirect.
export default function EditProfileScreen({ navigation }: Props) {
  const { user, refresh } = useAuth();
  const { colors } = useTheme();
  const { toast } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState(user?.name || '');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [countryName, setCountryName] = useState<string | null>(null);

  const [subjects, setSubjects] = useState<string[]>([]);
  const [tutorProfile, setTutorProfile] = useState<tutorsApi.MyTutorProfile | null>(null);
  const [tutorCategories, setTutorCategories] = useState<string[]>([]);
  const [hourlyRate, setHourlyRate] = useState('');
  const [loadingTutor, setLoadingTutor] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    geoApi
      .fetchGeo()
      .then((geo) => {
        const match = geo.countries.find((c) => c.code === geo.countryCode);
        setCountryName(match?.name || geo.countryCode || null);
      })
      .catch(() => {});
  }, []);

  // Gated on approval, not just "a tutor record exists" - the same
  // approval-gating rule applied everywhere else in the app (Profile menu's
  // Tutor Profile item, etc.). A pending or rejected applicant has a tutor
  // record too, and shouldn't see tutor-only editing UI because of it.
  const isApprovedTutor = Boolean(user?.hasTutorProfile) && user?.tutorStatus === 'approved';

  useEffect(() => {
    if (!isApprovedTutor) return;
    setLoadingTutor(true);
    Promise.all([tutorsApi.fetchMyTutorProfile(), tutorsApi.fetchTaxonomy()])
      .then(([tutorData, tax]) => {
        setSubjects(tax.subjects);
        if (tutorData.profile) {
          setTutorProfile(tutorData.profile);
          setTutorCategories(tutorData.profile.categories || []);
          setHourlyRate(String(tutorData.profile.hourlyRateUsd || ''));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTutor(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApprovedTutor]);

  if (!user) return null;

  function toggleCategory(subject: string) {
    setTutorCategories((prev) => (prev.includes(subject) ? prev.filter((c) => c !== subject) : [...prev, subject]));
  }

  async function changePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast('Permission needed: allow photo library access to change your photo.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const fileName = asset.fileName || asset.uri.split('/').pop() || 'photo.jpg';
      const type = asset.mimeType || 'image/jpeg';
      await profileApi.uploadProfilePhoto({ uri: asset.uri, name: fileName, type });
      await refresh();
    } catch {
      toast('Could not update photo. Try again in a moment.', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function saveChanges() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }
    if (tutorProfile) {
      if (!tutorCategories.length) {
        setError('Choose at least one course.');
        return;
      }
      const rate = Number(hourlyRate);
      if (!Number.isFinite(rate) || rate <= 0) {
        setError('Enter a valid hourly charge.');
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const calls: Promise<unknown>[] = [];
      if (trimmedName !== user!.name) calls.push(profileApi.updateName(trimmedName));
      if (tutorProfile) {
        calls.push(tutorsApi.setMyCategories(tutorCategories));
        calls.push(tutorsApi.setMyHourlyRate(Number(hourlyRate)));
      }
      await Promise.all(calls);
      await refresh();
      navigation.goBack();
    } catch {
      setError('Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Edit Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarWrap}>
          <Pressable onPress={changePhoto} disabled={uploadingPhoto}>
            <Avatar name={user.name} photoUrl={user.photoUrl} size={84} viewable={false} />
            <View style={styles.avatarBadge}>
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Ionicons name="camera" size={15} color={colors.onPrimary} />
              )}
            </View>
          </Pressable>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </View>

        <Text style={styles.label}>Full Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor={colors.textFaint} />

        {isApprovedTutor ? (
          loadingTutor ? (
            <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
          ) : tutorProfile ? (
            <>
              <Text style={[styles.label, styles.labelSpaced]}>Courses you teach</Text>
              <View style={styles.pillRow}>
                {subjects.map((subject) => {
                  const active = tutorCategories.includes(subject);
                  return (
                    <Pressable key={subject} style={[styles.pill, active && styles.pillActive]} onPress={() => toggleCategory(subject)}>
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{subject}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, styles.labelSpaced]}>Hourly charge (USD)</Text>
              <TextInput
                style={styles.input}
                value={hourlyRate}
                onChangeText={setHourlyRate}
                keyboardType="decimal-pad"
                placeholder="e.g. 25.00"
                placeholderTextColor={colors.textFaint}
              />
              <Text style={styles.hint}>Students see this amount converted to their local currency.</Text>
            </>
          ) : null
        ) : null}

        <Text style={[styles.label, styles.labelSpaced]}>Email</Text>
        <Text style={styles.readonlyValue}>{user.email}</Text>
        <Text style={styles.hint}>Email cannot be changed</Text>

        <Text style={[styles.label, styles.labelSpaced]}>Country</Text>
        <Text style={styles.readonlyValue}>{countryName || 'Not set'}</Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.btnRow}>
          <Pressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <PrimaryButton title="Save Changes" onPress={saveChanges} loading={saving} style={{ flex: 1 }} />
        </View>
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
    headerSpacer: { width: 36 },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    avatarWrap: { alignItems: 'center', marginBottom: 24 },
    avatarBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.primaryRed,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    avatarHint: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 8 },
    label: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textFaint, marginBottom: 6 },
    labelSpaced: { marginTop: 18 },
    hint: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 4 },
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
    readonlyValue: { fontSize: 15, fontFamily: fonts.bodyMedium, color: colors.text },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, fontSize: 12.5, marginTop: 16 },
    btnRow: { flexDirection: 'row', gap: 10, marginTop: 26, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.border },
    cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    cancelBtnText: { fontSize: 14.5, fontFamily: fonts.bodyBold, color: colors.textSoft },
  });
}

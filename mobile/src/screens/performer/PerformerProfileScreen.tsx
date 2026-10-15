import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../../api/client';
import * as performersApi from '../../api/performers';
import type { MyPerformerProfile } from '../../api/performers';
import Avatar from '../../components/Avatar';
import PerformerHeader from '../../components/PerformerHeader';
import PrimaryButton from '../../components/PrimaryButton';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { PerformerTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<PerformerTabParamList, 'Profile'>;

export default function PerformerProfileScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<MyPerformerProfile | null>(null);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [customCategory, setCustomCategory] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [eventRate, setEventRate] = useState('');
  const [savingCategories, setSavingCategories] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutBio, setAboutBio] = useState('');
  const [aboutExperienceYears, setAboutExperienceYears] = useState('');
  const [aboutQualifications, setAboutQualifications] = useState('');
  const [aboutStyleTags, setAboutStyleTags] = useState<string[]>([]);
  const [newStyleTag, setNewStyleTag] = useState('');
  const [savingAbout, setSavingAbout] = useState(false);

  function hydrateAbout(nextProfile: MyPerformerProfile) {
    setAboutBio(nextProfile.bio || '');
    setAboutExperienceYears(nextProfile.experienceYears ? String(nextProfile.experienceYears) : '');
    setAboutQualifications(nextProfile.qualifications || '');
    setAboutStyleTags(nextProfile.styleTags || []);
    setNewStyleTag('');
  }

  const load = useCallback(async () => {
    try {
      const [profileRes, categoriesRes] = await Promise.all([
        performersApi.fetchMyPerformerProfile(),
        performersApi.fetchPerformerCategories(),
      ]);
      setProfile(profileRes.profile);
      setAllCategories(categoriesRes.categories);
      if (profileRes.profile) {
        setCategories(profileRes.profile.categories);
        setHourlyRate(profileRes.profile.hourlyRateLocal ? String(profileRes.profile.hourlyRateLocal) : '');
        setEventRate(profileRes.profile.eventRateLocal ? String(profileRes.profile.eventRateLocal) : '');
        hydrateAbout(profileRes.profile);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your profile.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function toggleCategory(cat: string) {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function addCustomCategory() {
    const name = customCategory.trim().replace(/\s+/g, ' ');
    if (!name) return toast('Enter the category you perform.', 'error');
    setAddingCategory(true);
    try {
      const res = await performersApi.createPerformerCategory(name);
      setAllCategories(res.categories);
      setCategories((prev) => (prev.includes(res.category) ? prev : [...prev, res.category]));
      setCustomCategory('');
      toast(`${res.category} added and selected.`, 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not add that category.', 'error');
    } finally {
      setAddingCategory(false);
    }
  }

  async function saveCategories() {
    if (!categories.length) return toast('Choose at least one category.', 'error');
    setSavingCategories(true);
    try {
      const res = await performersApi.setPerformerCategories(categories);
      setProfile(res.profile);
      toast('Categories saved.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save your categories.', 'error');
    } finally {
      setSavingCategories(false);
    }
  }

  async function saveRate() {
    if (!hourlyRate.trim() || Number(hourlyRate) < 0 || !eventRate.trim() || Number(eventRate) < 0) {
      return toast('Enter both a valid hourly and event rate.', 'error');
    }
    if (!Number(hourlyRate) && !Number(eventRate)) return toast('Enter at least one rate.', 'error');
    setSavingRate(true);
    try {
      const res = await performersApi.setPerformerRates(Number(hourlyRate), Number(eventRate));
      setProfile(res.profile);
      toast('Hourly and event rates saved.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save your rate.', 'error');
    } finally {
      setSavingRate(false);
    }
  }

  async function changePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast('Permission needed: allow photo library access to change your photo.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const uploaded = await performersApi.uploadPerformerPhoto({ uri: asset.uri, name: asset.fileName || 'photo.jpg', type: asset.mimeType || 'image/jpeg' });
      const res = await performersApi.setPerformerPhoto(uploaded.url);
      setProfile(res.profile);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update your photo.', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  }

  function startEditingAbout() {
    if (!profile) return;
    hydrateAbout(profile);
    setEditingAbout(true);
  }

  function cancelEditingAbout() {
    if (profile) hydrateAbout(profile);
    setEditingAbout(false);
  }

  function addStyleTag() {
    const tag = newStyleTag.trim().replace(/\s+/g, ' ');
    if (!tag) return;
    if (tag.length > 50) return toast('Each style can be up to 50 characters.', 'error');
    if (aboutStyleTags.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      setNewStyleTag('');
      return;
    }
    if (aboutStyleTags.length >= 12) return toast('Add up to 12 styles.', 'error');
    setAboutStyleTags((current) => [...current, tag]);
    setNewStyleTag('');
  }

  async function saveAbout() {
    const bio = aboutBio.trim();
    const qualifications = aboutQualifications.trim();
    const experienceYears = aboutExperienceYears.trim() === '' ? 0 : Number(aboutExperienceYears);
    if (!Number.isFinite(experienceYears) || experienceYears < 0 || experienceYears > 100) {
      return toast('Enter experience between 0 and 100 years.', 'error');
    }
    setSavingAbout(true);
    try {
      const res = await performersApi.updatePerformerAbout({
        bio,
        experienceYears,
        qualifications,
        styleTags: aboutStyleTags,
      });
      setProfile(res.profile);
      hydrateAbout(res.profile);
      setEditingAbout(false);
      toast('About you updated.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update your profile.', 'error');
    } finally {
      setSavingAbout(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <PerformerHeader
        profile={profile}
        fallbackName={user?.name}
        fallbackPhoto={user?.photoUrl}
        onNotifications={() => navigation.getParent()?.navigate('Notifications')}
        onProfile={() => navigation.getParent()?.navigate('Profile')}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error || !profile ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || 'No performer profile found.'}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryRed} />}
        >
          <View style={styles.profileHeader}>
            <Pressable onPress={changePhoto} disabled={uploadingPhoto}>
              {uploadingPhoto ? (
                <View style={[styles.avatarWrap, styles.avatarLoading]}><ActivityIndicator color={colors.primaryRed} /></View>
              ) : (
                <Avatar name={profile.name} photoUrl={profile.photoUrl} size={72} viewable={false} />
              )}
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={12} color={colors.onPrimary} />
              </View>
            </Pressable>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.typeText}>
              {profile.performerType === 'group' ? `Group${profile.groupSize ? ` of ${profile.groupSize}` : ''}` : 'Solo performer'}{profile.city ? ` · ${profile.city}` : ''}
            </Text>
            <View style={styles.badgesRow}>
              <View style={[styles.badge, styles.badgeActive]}>
                <Text style={[styles.badgeText, styles.badgeTextActive]}>{profile.status}</Text>
              </View>
              <View style={[styles.badge, profile.activationPaid ? styles.badgeActive : styles.badgePending]}>
                <Text style={[styles.badgeText, profile.activationPaid ? styles.badgeTextActive : styles.badgeTextPending]}>
                  {profile.activationPaid ? 'Activated' : 'Not activated'}
                </Text>
              </View>
            </View>
          </View>

          {!profile.activationPaid ? (
            <View style={styles.noticeCard}>
              <Ionicons name="information-circle" size={16} color={colors.statusPendingText} />
              <Text style={styles.noticeText}>Pay the one-time activation fee from the Requests tab to start receiving invites.</Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Categories</Text>
          <Text style={styles.sectionHint}>Select every category you perform, or add one that is not listed.</Text>
          <View style={styles.chipsRow}>
            {allCategories.map((cat) => {
              const active = categories.includes(cat);
              return (
                <Pressable key={cat} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleCategory(cat)}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.customCategoryRow}>
            <TextInput
              style={[styles.input, styles.customCategoryInput]}
              value={customCategory}
              onChangeText={setCustomCategory}
              placeholder="Add your own category"
              placeholderTextColor={colors.textFaint}
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={addCustomCategory}
            />
            <Pressable style={styles.addCategoryButton} onPress={addCustomCategory} disabled={addingCategory}>
              {addingCategory ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Ionicons name="add" size={20} color={colors.onPrimary} />}
              <Text style={styles.addCategoryButtonText}>Add</Text>
            </Pressable>
          </View>
          <PrimaryButton title="Save categories" onPress={saveCategories} loading={savingCategories} style={{ marginTop: 12 }} />

          <Text style={styles.sectionTitle}>Your rates{profile.currency ? ` (${profile.currency})` : ''}</Text>
          <Text style={styles.sectionHint}>Set the two prices separately. Your local currency is used here and shown to clients.</Text>
          <Text style={styles.rateLabel}>Rate per hour</Text>
          <View style={styles.currencyInputRow}>
            <View style={styles.currencyPrefix}><Text style={styles.currencyPrefixText}>{profile.symbol || '$'}</Text></View>
            <TextInput style={[styles.input, styles.currencyInput]} value={hourlyRate} onChangeText={setHourlyRate} placeholder="0.00" placeholderTextColor={colors.textFaint} keyboardType="decimal-pad" />
          </View>
          <Text style={styles.rateLabel}>Rate per event</Text>
          <View style={styles.currencyInputRow}>
            <View style={styles.currencyPrefix}><Text style={styles.currencyPrefixText}>{profile.symbol || '$'}</Text></View>
            <TextInput style={[styles.input, styles.currencyInput]} value={eventRate} onChangeText={setEventRate} placeholder="0.00" placeholderTextColor={colors.textFaint} keyboardType="decimal-pad" />
          </View>
          <PrimaryButton title="Save both rates" onPress={saveRate} loading={savingRate} style={{ marginTop: 12 }} />

          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>About you</Text>
            {!editingAbout ? (
              <Pressable style={styles.editAboutButton} onPress={startEditingAbout}>
                <Ionicons name="create-outline" size={15} color={colors.primaryRed} />
                <Text style={styles.editAboutButtonText}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
          {editingAbout ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Short bio</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={aboutBio}
                onChangeText={setAboutBio}
                placeholder="Tell clients about your performance."
                placeholderTextColor={colors.textFaint}
                maxLength={1500}
                multiline
                textAlignVertical="top"
              />
              <Text style={styles.characterCount}>{aboutBio.length}/1500</Text>

              <Text style={[styles.infoLabel, styles.editFieldLabel]}>Years of experience</Text>
              <TextInput
                style={styles.input}
                value={aboutExperienceYears}
                onChangeText={setAboutExperienceYears}
                placeholder="0"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                maxLength={3}
              />

              <Text style={[styles.infoLabel, styles.editFieldLabel]}>Qualifications</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={aboutQualifications}
                onChangeText={setAboutQualifications}
                placeholder="Training, awards, certifications…"
                placeholderTextColor={colors.textFaint}
                maxLength={800}
                multiline
                textAlignVertical="top"
              />
              <Text style={styles.characterCount}>{aboutQualifications.length}/800</Text>

              <Text style={[styles.infoLabel, styles.editFieldLabel]}>Performance styles</Text>
              {aboutStyleTags.length ? (
                <View style={styles.chipsRow}>
                  {aboutStyleTags.map((tag) => (
                    <Pressable key={tag} style={styles.editableTag} onPress={() => setAboutStyleTags((current) => current.filter((item) => item !== tag))}>
                      <Text style={styles.tagText}>{tag}</Text>
                      <Ionicons name="close" size={13} color={colors.textSoft} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={styles.customCategoryRow}>
                <TextInput
                  style={[styles.input, styles.customCategoryInput]}
                  value={newStyleTag}
                  onChangeText={setNewStyleTag}
                  placeholder="Add a style"
                  placeholderTextColor={colors.textFaint}
                  maxLength={50}
                  returnKeyType="done"
                  onSubmitEditing={addStyleTag}
                />
                <Pressable style={styles.addCategoryButton} onPress={addStyleTag}>
                  <Ionicons name="add" size={20} color={colors.onPrimary} />
                  <Text style={styles.addCategoryButtonText}>Add</Text>
                </Pressable>
              </View>

              <View style={styles.aboutActions}>
                <Pressable style={styles.cancelAboutButton} onPress={cancelEditingAbout} disabled={savingAbout}>
                  <Text style={styles.cancelAboutButtonText}>Cancel</Text>
                </Pressable>
                <PrimaryButton title="Save about" onPress={saveAbout} loading={savingAbout} style={styles.saveAboutButton} />
              </View>
            </View>
          ) : (
            <View style={styles.infoCard}>
              {profile.bio ? <Text style={styles.infoText}>{profile.bio}</Text> : <Text style={styles.infoMuted}>Add a short introduction so clients can get to know you.</Text>}
              <View style={styles.infoDivider} />
              <Text style={styles.infoLabel}>Experience</Text>
              <Text style={styles.infoText}>{profile.experienceYears ? `${profile.experienceYears} years` : 'Not specified'}</Text>
              {profile.qualifications ? (
                <>
                  <View style={styles.infoDivider} />
                  <Text style={styles.infoLabel}>Qualifications</Text>
                  <Text style={styles.infoText}>{profile.qualifications}</Text>
                </>
              ) : null}
              {profile.styleTags?.length ? (
                <>
                  <View style={styles.infoDivider} />
                  <Text style={styles.infoLabel}>Style</Text>
                  <View style={styles.chipsRow}>
                    {profile.styleTags.map((tag) => (
                      <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    content: { padding: 20, paddingBottom: 40 },
    profileHeader: { alignItems: 'center', marginBottom: 10 },
    avatarWrap: { width: 72, height: 72, borderRadius: 36 },
    avatarLoading: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    avatarEditBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primaryRed,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    name: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 10 },
    typeText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    badgesRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    badgeActive: { backgroundColor: colors.statusActiveBg },
    badgePending: { backgroundColor: colors.statusPendingBg },
    badgeText: { fontSize: 10.5, fontFamily: fonts.bodyBold, textTransform: 'capitalize' },
    badgeTextActive: { color: colors.statusActiveText },
    badgeTextPending: { color: colors.statusPendingText },
    noticeCard: { flexDirection: 'row', gap: 10, backgroundColor: colors.statusPendingBg, borderRadius: 14, padding: 14, marginTop: 14 },
    noticeText: { flex: 1, fontSize: 12.5, fontFamily: fonts.body, color: colors.statusPendingText, lineHeight: 18 },
    sectionTitle: { fontSize: 15, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 22, marginBottom: 10 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    editAboutButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, marginTop: 14, borderRadius: 999, backgroundColor: `${colors.primaryRed}12` },
    editAboutButtonText: { color: colors.primaryRed, fontSize: 11.5, fontFamily: fonts.bodyBold },
    sectionHint: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: -4, marginBottom: 10, lineHeight: 17 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.surface },
    chipActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    chipText: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.text, textTransform: 'capitalize' },
    chipTextActive: { color: colors.onPrimary },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    rateLabel: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textSoft, marginTop: 10, marginBottom: 6 },
    currencyInputRow: { flexDirection: 'row', alignItems: 'stretch' },
    currencyPrefix: { minWidth: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.primaryRed}12`, borderWidth: 1, borderRightWidth: 0, borderColor: colors.border, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
    currencyPrefixText: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.primaryRed },
    currencyInput: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
    customCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    customCategoryInput: { flex: 1 },
    addCategoryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 44, paddingHorizontal: 13, borderRadius: 12, backgroundColor: colors.primaryRed },
    addCategoryButtonText: { color: colors.onPrimary, fontSize: 12, fontFamily: fonts.bodyBold },
    infoCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14 },
    infoLabel: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 4 },
    infoText: { fontSize: 13, fontFamily: fonts.body, color: colors.text, lineHeight: 19 },
    infoMuted: { fontSize: 13, fontFamily: fonts.body, color: colors.textFaint },
    infoDivider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
    tag: { backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
    editableTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
    tagText: { fontSize: 10.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    multilineInput: { minHeight: 92, lineHeight: 19 },
    characterCount: { alignSelf: 'flex-end', marginTop: 4, fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint },
    editFieldLabel: { marginTop: 14 },
    aboutActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
    cancelAboutButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 999, backgroundColor: colors.background },
    cancelAboutButtonText: { color: colors.textSoft, fontFamily: fonts.bodyBold, fontSize: 14 },
    saveAboutButton: { flex: 1 },
  });
}

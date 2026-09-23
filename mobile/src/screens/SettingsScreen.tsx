import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { API_BASE_URL, ApiError, resolveMediaUrl } from '../api/client';
import * as organizationsApi from '../api/organizations';
import type { MySponsorOrg } from '../api/organizations';
import * as profileApi from '../api/profile';
import BackButton from '../components/BackButton';
import ExternalLinkRow from '../components/ExternalLinkRow';
import PrimaryButton from '../components/PrimaryButton';
import { useRoleMode } from '../context/RoleModeContext';
import { useToast } from '../context/ToastContext';
import type { MoreStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';
import { dialCodeForCountry, splitPhone } from '../utils/dialCodes';

type Props = NativeStackScreenProps<MoreStackParamList, 'Settings'>;

// The Organization Dashboard's own profile fields (mirrors ngo-dashboard.html's
// Settings tab: logo, name, type/email/country read-only, contact, phone) -
// a section INSIDE this same shared Settings screen rather than its own
// destination, so there's exactly one "Settings" entry point in every
// mode's More menu, not two competing ones.
function OrganizationProfileSection({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createOrgStyles(colors), [colors]);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<MySponsorOrg | null>(null);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    organizationsApi
      .fetchMySponsorOrg()
      .then(({ organization }) => {
        setOrg(organization);
        setName(organization.name || '');
        setContactName(organization.contactName || '');
        setPhone(splitPhone(organization.phone, dialCodeForCountry(organization.locality?.country)));
        setLogoUrl(organization.logoUrl);
      })
      .catch((err) => toast(err instanceof ApiError ? err.message : 'Could not load your organization.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const dialCode = dialCodeForCountry(org?.locality?.country);
  const typeLabel = org?.organizationType === 'institution' ? 'Educational Institution' : 'NGO';
  const country = org?.locality?.country || '';

  async function pickLogo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast('Permission needed: allow photo library access.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets[0]) return;
    const picked = result.assets[0];
    setUploadingLogo(true);
    try {
      const uploaded = await profileApi.uploadPhoto({ uri: picked.uri, name: picked.fileName || 'logo.jpg', type: picked.mimeType || 'image/jpeg' });
      setLogoUrl(uploaded.url);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not upload that photo.', 'error');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function save() {
    if (!name.trim()) {
      toast('Organization name is required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const { organization } = await organizationsApi.updateOrgProfile({
        name: name.trim(),
        contactName: contactName.trim(),
        phone: phone ? `${dialCode}${phone}` : '',
        ...(logoUrl ? { logoUrl } : {}),
      });
      setOrg(organization);
      toast('Saved.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save your changes.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={{ marginBottom: 10 }}>
        <ActivityIndicator color={colors.primaryRed} />
      </View>
    );
  }

  return (
    <>
      <Text style={styles.label}>Organization Profile</Text>
      <View style={styles.card}>
        <View style={styles.logoRow}>
          <Image source={{ uri: resolveMediaUrl(logoUrl) || 'https://placehold.co/80' }} style={styles.logo} />
          <Pressable style={styles.logoUploadBtn} onPress={pickLogo} disabled={uploadingLogo}>
            {uploadingLogo ? <ActivityIndicator size="small" color={colors.primaryRed} /> : (
              <>
                <Ionicons name="camera-outline" size={14} color={colors.primaryRed} />
                <Text style={styles.logoUploadBtnText}>Upload profile image</Text>
              </>
            )}
          </Pressable>
        </View>

        <Text style={styles.fieldLabel}>Organization Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Organization name" placeholderTextColor={colors.textFaint} />

        <Text style={styles.fieldLabel}>Type</Text>
        <View style={styles.inputDisabled}><Text style={styles.inputDisabledText}>{typeLabel}</Text></View>

        <Text style={styles.fieldLabel}>Contact Name</Text>
        <TextInput style={styles.input} value={contactName} onChangeText={setContactName} placeholder="Contact name" placeholderTextColor={colors.textFaint} />

        <Text style={styles.fieldLabel}>Gmail</Text>
        <View style={styles.inputDisabled}><Text style={styles.inputDisabledText}>{org?.email || '—'}</Text></View>

        <Text style={styles.fieldLabel}>Phone</Text>
        <View style={styles.phoneRow}>
          <View style={styles.phoneDialCode}><Text style={styles.phoneDialCodeText}>{dialCode}</Text></View>
          <TextInput
            style={styles.phoneInput}
            value={phone}
            onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
            placeholder="8012345678"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            maxLength={10}
          />
        </View>

        <Text style={styles.fieldLabel}>Country</Text>
        <View style={styles.inputDisabled}><Text style={styles.inputDisabledText}>{country || '—'}</Text></View>

        <PrimaryButton title="Save all changes" onPress={save} loading={saving} style={{ marginTop: 18 }} />
      </View>
    </>
  );
}

function createOrgStyles(colors: ThemeColors) {
  return StyleSheet.create({
    label: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textFaint, marginBottom: 8 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 22,
    },
    logoRow: { alignItems: 'center', gap: 12, marginBottom: 18 },
    logo: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.background },
    logoUploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    logoUploadBtnText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.primaryRed },
    fieldLabel: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text, marginTop: 14, marginBottom: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
    },
    inputDisabled: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.background,
    },
    inputDisabledText: { fontSize: 14, fontFamily: fonts.body, color: colors.textFaint },
    phoneRow: { flexDirection: 'row', gap: 8 },
    phoneDialCode: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.background,
      justifyContent: 'center',
    },
    phoneDialCodeText: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.textFaint },
    phoneInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
    },
  });
}

// Card setup itself stays on the web (the project's standing decision -
// one place managing that sensitive flow, not two). What's real here is
// checking the actual saved-card status: re-fetched every time this screen
// regains focus, so coming back from adding a card in the browser (app
// switcher, or the browser's own back button) shows the real result
// without needing a fragile deep link back into the app.
export default function SettingsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { mode } = useRoleMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [status, setStatus] = useState<profileApi.PaymentMethodStatus | null>(null);
  const [loading, setLoading] = useState(true);
  // Local, UI-only for now - there's no real push-notification delivery
  // wired into the mobile app yet (that's a deliberately deferred piece:
  // web/native notifications need to coexist without duplicating before
  // that's built), so these toggles don't drive real behavior yet. Doesn't
  // persist across app restarts either, same caveat as the theme override.
  const [messagesEnabled, setMessagesEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      profileApi
        .fetchPaymentMethod()
        .then((data) => { if (!cancelled) setStatus(data); })
        .catch(() => { if (!cancelled) setStatus(null); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, []),
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        {mode === 'organization' ? <OrganizationProfileSection colors={colors} /> : null}
        <Text style={styles.label}>Payment method</Text>
        <View style={styles.card}>
          {loading ? (
            <ActivityIndicator color={colors.primaryRed} />
          ) : status?.hasCard ? (
            <View style={styles.cardRow}>
              <Ionicons name="card" size={22} color={colors.text} />
              <View style={styles.cardInfo}>
                <Text style={styles.cardText}>
                  {status.brand ? `${status.brand} ` : ''}•••• {status.last4}
                </Text>
                <Text style={styles.cardSub}>On file for automatic lesson payments</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.cardSub}>No payment method on file yet.</Text>
          )}
          <ExternalLinkRow url={`${API_BASE_URL}/payment-methods`} style={styles.addBtn} trailingIcon="open-outline" trailingColor={colors.primaryRed}>
            <Text style={styles.addBtnText}>{status?.hasCard ? 'Update payment method' : 'Add payment method'}</Text>
          </ExternalLinkRow>
        </View>

        <Text style={[styles.label, styles.labelSpaced]}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Message notifications</Text>
              <Text style={styles.cardSub}>Alerts for new lesson chat messages</Text>
            </View>
            <Switch
              value={messagesEnabled}
              onValueChange={setMessagesEnabled}
              trackColor={{ true: colors.primaryRed, false: colors.border }}
              thumbColor={colors.onPrimary}
            />
          </View>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Sound</Text>
              <Text style={styles.cardSub}>Play a sound with notifications</Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              disabled={!messagesEnabled}
              trackColor={{ true: colors.primaryRed, false: colors.border }}
              thumbColor={colors.onPrimary}
            />
          </View>
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
    content: { paddingHorizontal: 20 },
    label: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textFaint, marginBottom: 8 },
    labelSpaced: { marginTop: 22 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    toggleInfo: { flex: 1 },
    toggleLabel: { fontSize: 14, fontFamily: fonts.bodyMedium, color: colors.text },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 14,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardInfo: { flex: 1 },
    cardText: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text },
    cardSub: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 999,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.primaryRed,
    },
    addBtnText: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.primaryRed },
  });
}

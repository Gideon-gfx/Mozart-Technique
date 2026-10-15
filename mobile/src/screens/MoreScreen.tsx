import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { API_BASE_URL } from '../api/client';
import type { PublicUser } from '../api/types';
import Avatar from '../components/Avatar';
import BackButton from '../components/BackButton';
import ExternalLinkRow from '../components/ExternalLinkRow';
import { useAuth } from '../context/AuthContext';
import { useTourTarget } from '../context/TourTargetsContext';
import { useToast } from '../context/ToastContext';
import type { MoreStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import type { ThemeOverride } from '../theme/ThemeContext';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MoreStackParamList, 'MoreHome'>;

const THEME_OPTIONS: { value: ThemeOverride; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

// Applications open a real web form (the only items meant to leave the
// app, per explicit instruction) - everything else here stays native.
// `already` checks whether the user has that role approved already - a
// pending or rejected applicant still needs this (become-tutor.html's own
// "You've Already Applied" state covers pending, and RoleStatusBanner's
// "Apply again" button covers rejected by reopening this exact URL), so
// only an *approved* role is filtered out of this list entirely.
const ROLE_APPLICATIONS: {
  key: string;
  label: string;
  path: string;
  already: (user: PublicUser) => boolean;
}[] = [
  { key: 'tutor', label: 'Become a Tutor', path: '/become-tutor', already: (user) => user.tutorStatus === 'approved' },
  { key: 'performer', label: 'Become a Performer', path: '/become-performer', already: (user) => user.performerStatus === 'approved' },
  { key: 'sponsor', label: 'Become a Sponsor', path: '/become-sponsor', already: (user) => user.hasSponsorOrg },
];

const SUPPORT_EMAIL = 'mozarttechniques@gmail.com';

export default function MoreScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const { colors, override, setOverride } = useTheme();
  const { confirm } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [roleSheetOpen, setRoleSheetOpen] = useState(false);
  const profileTargetRef = useTourTarget('more-main');

  if (!user) return null;

  async function confirmSignOut() {
    const ok = await confirm({ title: 'Sign out', message: 'Are you sure you want to sign out?', confirmLabel: 'Sign out', destructive: true });
    if (ok) logout();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        {/* Reaching More by tapping the header avatar (from Home) has
            somewhere to go back to; reaching it via the bottom tab itself
            doesn't - this always lands back on Home either way, since a
            tab switch doesn't leave a "previous screen" to pop like a
            pushed stack screen would. */}
        <BackButton onPress={() => navigation.getParent()?.navigate('Home')} />
      </View>
      <View ref={profileTargetRef} collapsable={false} style={styles.profileRow}>
        <Avatar name={user.name} photoUrl={user.photoUrl} size={56} />
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>{user.role}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.themeRow}>
          <Text style={styles.themeLabel}>Color theme</Text>
          <View style={styles.themeToggle}>
            {THEME_OPTIONS.map((opt) => {
              const active = override === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.themeOption, active && { backgroundColor: colors.primaryRed }]}
                  onPress={() => setOverride(opt.value)}
                >
                  <Text style={[styles.themeOptionText, active && { color: colors.onPrimary }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <MenuRow icon="musical-notes" label="Find a Performer" onPress={() => navigation.getParent()?.navigate('FindPerformer')} colors={colors} />
        <MenuRow icon="headset" label="Live support" onPress={() => navigation.navigate('LiveSupport')} colors={colors} />
        <MenuRow icon="add-circle" label="Become a role" onPress={() => setRoleSheetOpen(true)} colors={colors} />
        <MenuRow icon="settings" label="Settings" onPress={() => navigation.navigate('Settings')} colors={colors} last />
      </View>

      <Pressable style={styles.logoutRow} onPress={confirmSignOut}>
        <Ionicons name="log-out" size={19} color={colors.danger} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>

      <Text style={[styles.sectionLabel, styles.labelSpaced]}>Get in touch</Text>
      <View style={styles.card}>
        <MenuRow icon="chatbubbles" label="Live chat" onPress={() => navigation.navigate('LiveSupport')} colors={colors} />
        <ExternalLinkRow url={`mailto:${SUPPORT_EMAIL}`} style={[styles.menuRow, styles.menuRowLast]} trailingIcon="mail-outline">
          <Ionicons name="mail" size={19} color={colors.text} />
          <Text style={styles.menuLabel}>Mail us</Text>
        </ExternalLinkRow>
      </View>

      <Text style={[styles.sectionLabel, styles.labelSpaced]}>Legal</Text>
      <View style={styles.card}>
        <ExternalLinkRow url={`${API_BASE_URL}/terms-of-service`} style={styles.menuRow}>
          <Ionicons name="document-text-outline" size={19} color={colors.text} />
          <Text style={styles.menuLabel}>Terms of Service</Text>
        </ExternalLinkRow>
        <ExternalLinkRow url={`${API_BASE_URL}/privacy-policy`} style={[styles.menuRow, styles.menuRowLast]}>
          <Ionicons name="shield-checkmark-outline" size={19} color={colors.text} />
          <Text style={styles.menuLabel}>Privacy Policy</Text>
        </ExternalLinkRow>
      </View>

      <Modal visible={roleSheetOpen} transparent animationType="slide" onRequestClose={() => setRoleSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setRoleSheetOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Expand your role</Text>
            {ROLE_APPLICATIONS.filter((role) => !role.already(user)).map((role) => (
              <ExternalLinkRow
                key={role.key}
                url={`${API_BASE_URL}${role.path}`}
                style={styles.sheetOption}
                onBeforeOpen={() => setRoleSheetOpen(false)}
              >
                <Text style={styles.sheetOptionText}>{role.label}</Text>
              </ExternalLinkRow>
            ))}
            {ROLE_APPLICATIONS.every((role) => role.already(user)) ? (
              <Text style={styles.sheetEmptyText}>You already have every available role.</Text>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  colors,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: ThemeColors;
  last?: boolean;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable style={[styles.menuRow, last && styles.menuRowLast]} onPress={onPress}>
      <Ionicons name={icon} size={19} color={colors.text} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 30,
    },
    topRow: {
      marginBottom: 14,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: fonts.bodyBold,
      color: colors.textFaint,
      marginBottom: 8,
    },
    labelSpaced: {
      marginTop: 22,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 22,
    },
    profileInfo: { flex: 1 },
    name: {
      fontSize: 18,
      fontFamily: fonts.displayBlack,
      color: colors.text,
    },
    role: {
      fontSize: 12.5,
      fontFamily: fonts.bodySemiBold,
      color: colors.textFaint,
      textTransform: 'capitalize',
      marginTop: 2,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      marginBottom: 14,
    },
    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    themeLabel: {
      fontSize: 14,
      fontFamily: fonts.bodyMedium,
      color: colors.text,
    },
    themeToggle: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: 999,
      padding: 3,
      gap: 2,
    },
    themeOption: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    themeOptionText: {
      fontSize: 11,
      fontFamily: fonts.bodyBold,
      color: colors.textSoft,
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 15,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    menuRowLast: { borderBottomWidth: 0 },
    menuLabel: {
      flex: 1,
      fontSize: 14.5,
      fontFamily: fonts.bodyMedium,
      color: colors.text,
    },
    logoutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 15,
    },
    logoutText: {
      fontSize: 14.5,
      fontFamily: fonts.bodyBold,
      color: colors.danger,
    },
    sheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 34,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 16,
    },
    sheetTitle: {
      fontSize: 16,
      fontFamily: fonts.bodyBold,
      color: colors.text,
      marginBottom: 10,
    },
    sheetOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    sheetOptionText: {
      fontSize: 14.5,
      fontFamily: fonts.bodyMedium,
      color: colors.text,
    },
    sheetEmptyText: {
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.textFaint,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      textAlign: 'center',
    },
  });
}

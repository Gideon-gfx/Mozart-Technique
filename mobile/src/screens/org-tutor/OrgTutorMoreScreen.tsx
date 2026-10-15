import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { API_BASE_URL } from '../../api/client';
import Avatar from '../../components/Avatar';
import ExternalLinkRow from '../../components/ExternalLinkRow';
import { useAuth } from '../../context/AuthContext';
import { useRoleMode } from '../../context/RoleModeContext';
import { useToast } from '../../context/ToastContext';
import type { OrgTutorMoreStackParamList } from '../../navigation/types';
import type { ThemeOverride } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<OrgTutorMoreStackParamList, 'OrgTutorMoreHome'>;

const THEME_OPTIONS: { value: ThemeOverride; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const SUPPORT_EMAIL = 'mozarttechniques@gmail.com';

// Org Tutor mode's own lean More menu - "Switch to Tutor" is the one way
// back, since Organization Tutor is reached from Tutor mode (ProfileScreen's
// "Organization Tutor" row only shows once already an approved tutor).
export default function OrgTutorMoreScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const { switchToTutor } = useRoleMode();
  const { colors, override, setOverride } = useTheme();
  const { confirm } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!user) return null;

  async function confirmSignOut() {
    const ok = await confirm({ title: 'Sign out', message: 'Are you sure you want to sign out?', confirmLabel: 'Sign out', destructive: true });
    if (ok) logout();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.profileRow}>
        <Avatar name={user.name} photoUrl={user.photoUrl} size={56} />
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>Organization Tutor</Text>
        </View>
      </View>

      <Pressable style={styles.switchCard} onPress={switchToTutor}>
        <View style={styles.switchIcon}>
          <Ionicons name="swap-horizontal" size={19} color={colors.onPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchTitle}>Switch to Tutor</Text>
          <Text style={styles.switchSubtitle}>Back to your regular tutor dashboard</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.onPrimary} />
      </Pressable>

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
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 30 },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
    profileInfo: { flex: 1 },
    name: { fontSize: 18, fontFamily: fonts.displayBlack, color: colors.text },
    role: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 2 },
    switchCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.primaryRed,
      borderRadius: 16,
      padding: 14,
      marginBottom: 18,
    },
    switchIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    switchTitle: { fontSize: 14.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    switchSubtitle: { fontSize: 11.5, fontFamily: fonts.body, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      marginBottom: 14,
    },
    sectionLabel: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textFaint, marginBottom: 8 },
    labelSpaced: { marginTop: 22 },
    themeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
    themeLabel: { fontSize: 14, fontFamily: fonts.bodyMedium, color: colors.text },
    themeToggle: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 999, padding: 3, gap: 2 },
    themeOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    themeOptionText: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.textSoft },
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
    menuLabel: { flex: 1, fontSize: 14.5, fontFamily: fonts.bodyMedium, color: colors.text },
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
    logoutText: { fontSize: 14.5, fontFamily: fonts.bodyBold, color: colors.danger },
  });
}

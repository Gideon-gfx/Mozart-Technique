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
import { useAdminIdentity } from '../../hooks/useAdminIdentity';
import type { AdminMoreStackParamList } from '../../navigation/types';
import type { ThemeOverride } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<AdminMoreStackParamList, 'AdminMoreHome'>;

const THEME_OPTIONS: { value: ThemeOverride; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

// Same general support inbox every other mode's "Mail us" row uses (see
// MoreScreen.tsx/TutorMoreScreen.tsx) - a Country Admin gets that one. Main
// Admin gets a direct personal line instead, since they're the account that
// actually needs to hear about anything a Country Admin can't resolve.
const SUPPORT_EMAIL = 'mozarttechniques@gmail.com';
const MAIN_ADMIN_EMAIL = 'thegideons.2.5.1@gmail.com';

// Everything from admin.html that isn't an application/moderation queue or
// a matching/content tool - Activity & Flags' two read-only logs, Tutor
// Payouts, and Marketplace (request oversight plus Store Products/Orders,
// nested one level under it).
export default function AdminMoreScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const { switchToStudent } = useRoleMode();
  const { isPrimary, countryCode } = useAdminIdentity();
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
      <Pressable style={styles.backBtn} onPress={() => navigation.getParent()?.navigate('Analytics')} hitSlop={10}>
        <Ionicons name="arrow-back" size={20} color={colors.text} />
      </Pressable>
      <View style={styles.profileRow}>
        <Avatar name={user.name} photoUrl={user.photoUrl} size={56} />
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>{isPrimary ? 'Main Admin' : `Country Admin${countryCode ? ` (${countryCode})` : ''}`}</Text>
        </View>
      </View>

      <Pressable style={styles.switchCard} onPress={switchToStudent}>
        <View style={styles.switchIcon}>
          <Ionicons name="swap-horizontal" size={19} color={colors.onPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchTitle}>Switch to Student</Text>
          <Text style={styles.switchSubtitle}>Back to your student dashboard</Text>
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
                <Pressable key={opt.value} style={[styles.themeOption, active && { backgroundColor: colors.primaryRed }]} onPress={() => setOverride(opt.value)}>
                  <Text style={[styles.themeOptionText, active && { color: colors.onPrimary }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <MenuRow icon="pulse" label="Activity & Flags" onPress={() => navigation.navigate('AdminActivity')} colors={colors} />
        <MenuRow icon="cash" label="Tutor Payouts" onPress={() => navigation.navigate('AdminPayouts')} colors={colors} />
        <MenuRow icon="storefront" label="Marketplace" onPress={() => navigation.navigate('AdminMarketplace')} colors={colors} />
        <MenuRow icon="musical-notes" label="Find a Performer" onPress={() => navigation.getParent()?.navigate('FindPerformer')} colors={colors} />
        <MenuRow icon="chatbubbles" label="Feedbacks" onPress={() => navigation.navigate('LiveSupport')} colors={colors} />
        <ExternalLinkRow url={`mailto:${isPrimary ? MAIN_ADMIN_EMAIL : SUPPORT_EMAIL}`} style={styles.menuRow} trailingIcon="mail-outline">
          <Ionicons name="mail" size={19} color={colors.text} />
          <Text style={styles.menuLabel}>Mail Us</Text>
        </ExternalLinkRow>
        <MenuRow icon="settings" label="Settings" onPress={() => navigation.navigate('Settings')} colors={colors} last />
      </View>

      <Pressable style={styles.logoutRow} onPress={confirmSignOut}>
        <Ionicons name="log-out" size={19} color={colors.danger} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>

      <Text style={[styles.role, { marginTop: 22, marginBottom: 8 }]}>Legal</Text>
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
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
    profileInfo: { flex: 1 },
    name: { fontSize: 18, fontFamily: fonts.displayBlack, color: colors.text },
    role: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 2 },
    switchCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.primaryRed, borderRadius: 16, padding: 14, marginBottom: 18 },
    switchIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    switchTitle: { fontSize: 14.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    switchSubtitle: { fontSize: 11.5, fontFamily: fonts.body, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
    card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 14 },
    themeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
    themeLabel: { fontSize: 14, fontFamily: fonts.bodyMedium, color: colors.text },
    themeToggle: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 999, padding: 3, gap: 2 },
    themeOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    themeOptionText: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.textSoft },
    menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    menuRowLast: { borderBottomWidth: 0 },
    menuLabel: { flex: 1, fontSize: 14.5, fontFamily: fonts.bodyMedium, color: colors.text },
    logoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 15 },
    logoutText: { fontSize: 14.5, fontFamily: fonts.bodyBold, color: colors.danger },
  });
}

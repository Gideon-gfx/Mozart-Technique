import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { API_BASE_URL } from '../api/client';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type RoleStatus = 'pending' | 'approved' | 'rejected';

interface RoleConfig {
  role: string;
  status: RoleStatus | null;
  messages: Record<RoleStatus, string>;
  // Same web application form MoreScreen's "Become a Tutor/Performer" row
  // opens - reused here so a rejected applicant can reapply straight from
  // the card instead of hunting for it in the More menu.
  applyPath: string;
}

function storageKey(userId: number, role: string) {
  return `roleStatusSeen:${userId}:${role}`;
}

// One pinned card per role application (tutor, performer, ...) the user has
// submitted - pending stays pinned for as long as it's pending (that's the
// whole point, so they don't wonder whether it went through), approved/
// rejected are dismissible and, once dismissed, don't come back for that
// same status. Storing the exact status string (not just a seen flag)
// means a later status change - e.g. rejected today, re-applies and gets
// approved later - still shows fresh, since the stored value no longer
// matches.
function RoleCard({ userId, config, colors }: { userId: number; config: RoleConfig; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [dismissed, setDismissed] = useState(true); // starts hidden until the stored value is checked, so nothing flashes

  useEffect(() => {
    if (!config.status) return;
    AsyncStorage.getItem(storageKey(userId, config.role))
      .then((seenStatus) => setDismissed(config.status === 'pending' ? false : seenStatus === config.status))
      .catch(() => setDismissed(false));
  }, [userId, config.role, config.status]);

  if (!config.status || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    AsyncStorage.setItem(storageKey(userId, config.role), config.status as string).catch(() => {});
  }

  // Pending reuses the theme's own pending-status tokens (statusPendingBg/
  // Text - already used for status pills elsewhere) rather than a
  // translucent tint like the other two, since a plain solid yellow reads
  // as "pending/caution" at a glance in both themes. Those tokens carry
  // their own correctly-contrasting text color per theme, unlike
  // colors.text (which turns white in dark mode and would all but
  // disappear against a light-yellow background).
  const tone =
    config.status === 'approved'
      ? { bg: `${colors.success}15`, border: `${colors.success}40`, icon: 'checkmark-circle' as const, iconColor: colors.success, textColor: colors.text }
      : config.status === 'rejected'
        ? { bg: `${colors.danger}12`, border: `${colors.danger}35`, icon: 'close-circle' as const, iconColor: colors.danger, textColor: colors.text }
        : { bg: colors.statusPendingBg, border: colors.statusPendingText, icon: 'time' as const, iconColor: colors.statusPendingText, textColor: colors.statusPendingText };

  const message = config.messages[config.status];

  return (
    <View style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <View style={styles.cardTopRow}>
        <Ionicons name={tone.icon} size={18} color={tone.iconColor} />
        <Text style={[styles.message, { color: tone.textColor }]}>{message}</Text>
        {config.status !== 'pending' ? (
          <Pressable onPress={dismiss} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
      {config.status === 'rejected' ? (
        <Pressable style={styles.reapplyBtn} onPress={() => Linking.openURL(`${API_BASE_URL}${config.applyPath}`)}>
          <Text style={styles.reapplyText}>Apply again</Text>
          <Ionicons name="open-outline" size={13} color={colors.onPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function RoleStatusBanner({
  userId,
  tutorStatus,
  performerStatus,
  sponsorStatus,
  sponsorOrgType,
  sponsorOrgKind,
}: {
  userId: number;
  tutorStatus: string | null;
  performerStatus: string | null;
  sponsorStatus?: string | null;
  // Individual Sponsor vs NGO/Institution - picks which of two entirely
  // different cards shows (own role key, so a stale dismissal from before
  // this distinction existed can't hide either one): "sponsor" points at
  // the Sponsor Dashboard, "organization" points at the separate
  // Organization Dashboard. Never both for the same account (it owns at
  // most one org).
  sponsorOrgType?: string | null;
  // Only meaningful when sponsorOrgType is 'ngo' - names the exact
  // dashboard ("NGO Dashboard" vs "Institution Dashboard") rather than a
  // generic "Organization Dashboard".
  sponsorOrgKind?: string | null;
}) {
  const { colors } = useTheme();
  const isOrganization = sponsorOrgType === 'ngo';
  const orgDashboardName = sponsorOrgKind === 'institution' ? 'Institution Dashboard' : 'NGO Dashboard';
  const configs: RoleConfig[] = [
    {
      role: 'tutor',
      status: tutorStatus as RoleStatus | null,
      applyPath: '/become-tutor',
      messages: {
        pending: "Your tutor application has been submitted and is awaiting admin review. We'll let you know here as soon as a decision is made.",
        approved: "You're an approved tutor! Students can now be matched to you. Check your Tutor Dashboard.",
        rejected: 'Your tutor application was not approved this time. You can apply again below.',
      },
    },
    {
      role: 'performer',
      status: performerStatus as RoleStatus | null,
      applyPath: '/become-performer',
      messages: {
        pending: "Your performer application has been submitted and is awaiting admin review. We'll let you know here as soon as it's approved.",
        approved: "You're an approved performer! Check your Performer Dashboard.",
        rejected: 'Your performer application was not approved this time. You can apply again below.',
      },
    },
    // Sponsor card shows for ANY owned org - its original, ungated
    // behavior. Organization card (below) is a SEPARATE, ADDITIONAL card
    // layered on top for an NGO/Institution specifically, not a
    // replacement - both show at once for an NGO/Institution account,
    // matching Profile's two independent dashboard rows.
    {
      role: 'sponsor',
      status: (sponsorStatus ?? null) as RoleStatus | null,
      applyPath: '/become-sponsor',
      messages: {
        pending: "Your sponsor application has been submitted and is awaiting admin review. We'll let you know here as soon as a decision is made.",
        approved: 'Your sponsor application has been approved! Complete your annual subscription to start generating student access codes. Check your Sponsor Dashboard.',
        rejected: 'Your sponsor application was not approved this time. You can apply again below.',
      },
    },
    {
      role: 'organization',
      status: (isOrganization ? (sponsorStatus ?? null) : null) as RoleStatus | null,
      applyPath: '/become-sponsor',
      messages: {
        pending: "Your organization application has been submitted and is awaiting admin review. We'll let you know here as soon as a decision is made.",
        approved: `Your organization application has been approved! Complete your annual subscription to start generating student and tutor access codes. Check your ${orgDashboardName}.`,
        rejected: 'Your organization application was not approved this time. You can apply again below.',
      },
    },
  ];
  const visible = configs.filter((c) => c.status);
  if (!visible.length) return null;
  return (
    <View style={{ gap: 8, marginBottom: 4 }}>
      {visible.map((config) => (
        <RoleCard key={config.role} userId={userId} config={config} colors={colors} />
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    message: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodySemiBold, lineHeight: 17 },
    reapplyBtn: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primaryRed,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    reapplyText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
  });
}

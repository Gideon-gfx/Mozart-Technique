import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { API_BASE_URL } from '../api/client';
import type { PublicUser } from '../api/types';
import Avatar from '../components/Avatar';
import BackButton from '../components/BackButton';
import ExternalLinkRow from '../components/ExternalLinkRow';
import GlassSurface from '../components/GlassSurface';
import NavRow from '../components/NavRow';
import { useAuth } from '../context/AuthContext';
import { useRoleMode } from '../context/RoleModeContext';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'Profile'>;

type MenuItem =
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'dashboard' }
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'edit-profile' }
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'store-profile' }
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'web'; path: string }
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'placeholder'; body: string }
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'switch-to-tutor' }
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'switch-to-performer' }
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'switch-to-support-agent' }
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'switch-to-org-tutor'; orgId: number }
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'switch-to-org-student'; orgId: number }
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'orientation' }
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'sponsor-dashboard' }
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'organization-dashboard' }
  | { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; kind: 'admin-console'; viewAs: 'primary' | 'country' };

// Same items and per-user visibility rules as the web app's account
// dropdown (public/assets/nav-auth.js) - matching its structure, not its
// behavior. Everything stays native except Manage Payment Methods, which
// is the one standing, explicitly-approved exception (card setup lives on
// the web only, by design) - every other item here opens a real native
// screen, even where that's currently just an honest "not built yet" page
// rather than a redirect out of the app.
function buildMenu(user: PublicUser): MenuItem[] {
  const items: MenuItem[] = [
    { key: 'dashboard', icon: 'speedometer', label: 'Dashboard', kind: 'dashboard' },
    { key: 'orientation', icon: 'compass', label: 'Orientation', kind: 'orientation' },
    { key: 'store-profile', icon: 'bag', label: 'Store Profile', kind: 'store-profile' },
    { key: 'edit-profile', icon: 'create', label: 'Edit Profile', kind: 'edit-profile' },
  ];
  if (!user.hasTutorProfile && user.role !== 'admin') {
    items.push({ key: 'payment-methods', icon: 'card', label: 'Manage Payment Methods', kind: 'web', path: '/payment-methods' });
  }
  // Approval-gated, not just "has a record" - tutorStatus/performerStatus-
  // style records exist the moment someone *applies*, long before a real
  // admin approves them. hasTutorProfile alone is true for a pending
  // applicant too, which would show them a dashboard they don't actually
  // have access to yet - same rule the web enforces on these pages
  // themselves, applied here at the nav level too so the app never offers
  // a destination it would then have to reject.
  const isApprovedTutor = user.hasTutorProfile && user.tutorStatus === 'approved';
  // Same "must actually be approved, not just applied" rule as tutor above -
  // a pending/rejected performer sees the RoleStatusBanner on their student
  // dashboard instead, same as a pending/rejected tutor does.
  const isApprovedPerformer = user.hasPerformerProfile && user.performerStatus === 'approved';
  // Independent of each other, not either/or: owning a sponsor organization
  // and holding a tutor-role code for one (even the same one) are two
  // different relationships to it, so both destinations can show at once.
  // Sponsor Dashboard shows for ANY owned org (its original, ungated
  // behavior - the plain codes/subscription/wallet view every org owner
  // gets). Organization Dashboard is a SEPARATE, ADDITIONAL destination
  // layered on top for an NGO/Institution specifically (its own tabs -
  // students, tutors, Classroom) - not a replacement for Sponsor Dashboard,
  // so an NGO/Institution owner sees BOTH rows at once, each opening a
  // genuinely different screen.
  if (user.hasSponsorOrg) {
    items.push({ key: 'sponsor', icon: 'heart', label: 'Sponsor Dashboard', kind: 'sponsor-dashboard' });
  }
  if (user.hasSponsorOrg && user.sponsorOrgType === 'ngo') {
    // The org's own registered/approved name, not a generic "NGO
    // Dashboard"/"Institution Dashboard" - falls back to the generic form
    // only for the rare org somehow missing both name and contactName.
    const orgLabel = user.sponsorOrgName
      ? `${user.sponsorOrgName} Dashboard`
      : user.sponsorOrgKind === 'institution' ? 'Institution Dashboard' : 'NGO Dashboard';
    items.push({ key: 'organization', icon: 'business', label: orgLabel, kind: 'organization-dashboard' });
  }
  // One real row per organization this tutor holds a tutor code for (e.g.
  // "Slum2School Tutor") - a tutor can redeem more than one organization's
  // code, and each is its own destination, not one generic "Organization
  // Tutor" entry. Its own icon (briefcase) distinct from Sponsor (heart),
  // Organization (business) and Org Student (school) - four different
  // relationships, four different icons.
  user.organizationTutorMemberships.forEach((org) => {
    items.push({ key: `org-tutor-${org.id}`, icon: 'briefcase', label: `${org.name} Tutor`, kind: 'switch-to-org-tutor', orgId: org.id });
  });
  // Same idea, for the NGO/Institution *student* relationship (my-
  // organization.html's own account) - independent of the tutor rows
  // above, since an account could hold both to different organizations.
  user.organizationStudentMemberships.forEach((org) => {
    items.push({ key: `org-student-${org.id}`, icon: 'school', label: `${org.name}'s Student`, kind: 'switch-to-org-student', orgId: org.id });
  });
  // Country Admin and Main Admin are two different rows, not one generic
  // "Admin" label - Main Admin supersedes every country restriction, so an
  // account can hold both at once (isPrimaryAdmin doesn't require
  // adminCountryCode to be unset, just an owner-allowlisted email). Both
  // open the SAME admin console mode/tabs, but each row carries its own
  // `viewAs` so the console still shows the narrower Country Admin view
  // when that's the row tapped, instead of always defaulting to the wider
  // one a real primary admin's server permissions would allow - see
  // useAdminIdentity.
  if (user.role === 'admin' && user.adminCountryCode) {
    items.push({ key: 'country-admin', icon: 'flag', label: `Country Admin (${user.adminCountryCode})`, kind: 'admin-console', viewAs: 'country' });
  }
  if (user.isPrimaryAdmin) {
    items.push({ key: 'main-admin', icon: 'shield-checkmark', label: 'Main Admin', kind: 'admin-console', viewAs: 'primary' });
  }
  if (isApprovedTutor) {
    items.push({ key: 'tutor', icon: 'easel', label: 'Tutor Profile', kind: 'switch-to-tutor' });
  }
  if (isApprovedPerformer) {
    items.push({ key: 'performer', icon: 'musical-notes', label: 'Performer Dashboard', kind: 'switch-to-performer' });
  }
  if (user.supportAgent) {
    items.push({ key: 'support', icon: 'headset', label: 'Support Agent Dashboard', kind: 'switch-to-support-agent' });
  }
  return items;
}

export default function ProfileScreen({ navigation }: Props) {
  const { user, logout, refresh } = useAuth();
  const { mode, switchToTutor, switchToStudent, switchToOrgTutor, switchToSponsor, switchToOrgStudent, switchToOrganization, switchToAdmin, switchToPerformer, switchToSupportAgent } = useRoleMode();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  // The menu below is built entirely from `user`'s role/membership fields,
  // but AuthContext only refetches on app launch or foreground - not every
  // time this specific screen opens. A role/membership change made earlier
  // in a long-running session (an admin approving something, an org code
  // redeemed elsewhere) would otherwise sit stale here until the app was
  // fully restarted. This is the one screen where "current" actually
  // matters, so it always refetches on focus rather than trusting whatever
  // AuthContext already has in memory.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (!user) return null;
  const menu = buildMenu(user);

  // Deliberately NOT the shared confirm() from ToastContext, which renders
  // via a real RN <Modal> - Profile is the app's only presentation:'modal'
  // screen that ever needed a confirm dialog, and nesting one native modal
  // presentation (the confirm) inside another (this screen itself) is what
  // made the Sign out button appear completely unresponsive on iOS: the
  // outer native-stack modal was already occupying the key window's
  // presentation slot, so the inner RN <Modal> had nothing to present over
  // and never became visible or interactive, even though confirmState was
  // set correctly. Every other confirm()/actionSheet() call site in the app
  // is on a non-modal screen, which is why this conflict never showed up
  // before. A plain in-screen overlay (no native presentation of its own)
  // sidesteps the conflict entirely.
  function finishSignOut() {
    setConfirmingSignOut(false);
    // Profile is presented as a native modal (MainStack.tsx) - on iOS this
    // is a real, separately-presented UIViewController, unlike every other
    // screen that calls logout() (all plain tab roots) and unlike Android's
    // fragment-based modal transition, which has no equivalent strict
    // presenting/presented relationship. logout() flips Root() (App.tsx)
    // from MainStack to AuthStack the instant its request resolves -
    // goBack() only *starts* the dismiss animation, it doesn't wait for it,
    // so logout() could still land - and tear out the whole presenting
    // navigator - before iOS finished animating the modal off screen.
    // Waiting for the dismiss to actually finish (transitionEnd) before
    // logging out closes that gap; the timeout is a safety net in case the
    // event is ever missed.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      logout();
    };
    const unsubscribe = navigation.addListener('transitionEnd', (event) => {
      if (event.data?.closing) {
        unsubscribe();
        finish();
      }
    });
    navigation.goBack();
    setTimeout(finish, 600);
  }

  return (
    <>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      <View style={styles.profileRow}>
        <Avatar name={user.name} photoUrl={user.photoUrl} size={56} />
        <View style={styles.profileInfo}>
          <Text style={styles.hi}>Hi, {user.name.split(' ')[0]}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>
      </View>

      <View style={styles.card}>
        {menu.map((item, i) => {
          const rowStyle = [styles.menuRow, i === menu.length - 1 && styles.menuRowLast];
          const label = (
            <>
              <Ionicons name={item.icon} size={19} color={colors.text} />
              <Text style={styles.menuLabel}>{item.label}</Text>
            </>
          );
          if (item.kind === 'web') {
            return (
              <ExternalLinkRow key={item.key} url={`${API_BASE_URL}${item.path}`} style={rowStyle}>
                {label}
              </ExternalLinkRow>
            );
          }
          return (
            <NavRow
              key={item.key}
              style={rowStyle}
              onPress={() => {
                if (item.kind === 'dashboard') {
                  // Reached from tutor or org-tutor mode (the avatar in
                  // those headers opens this same Profile screen) -
                  // "Dashboard" here means the student one, so switch back
                  // first and dismiss (same as "switch-to-tutor" below) -
                  // Tabs only ever renders whichever mode is active (see
                  // TabsRouter), and MainTabs' own first tab is already
                  // Home, so there's no separate route to target directly.
                  if (mode !== 'student') {
                    switchToStudent();
                    navigation.goBack();
                  } else {
                    navigation.navigate('Tabs', { screen: 'Home' });
                  }
                }
                else if (item.kind === 'edit-profile') navigation.navigate('EditProfile');
                else if (item.kind === 'store-profile') navigation.navigate('StoreProfile');
                else if (item.kind === 'orientation') navigation.navigate('Orientation');
                else if (item.kind === 'sponsor-dashboard') {
                  switchToSponsor();
                  navigation.goBack();
                } else if (item.kind === 'organization-dashboard') {
                  switchToOrganization();
                  navigation.goBack();
                } else if (item.kind === 'admin-console') {
                  switchToAdmin(item.viewAs);
                  navigation.goBack();
                } else if (item.kind === 'switch-to-tutor') {
                  switchToTutor();
                  navigation.goBack();
                } else if (item.kind === 'switch-to-performer') {
                  switchToPerformer();
                  navigation.goBack();
                } else if (item.kind === 'switch-to-support-agent') {
                  switchToSupportAgent();
                  navigation.goBack();
                } else if (item.kind === 'switch-to-org-tutor') {
                  switchToOrgTutor(item.orgId);
                  navigation.goBack();
                } else if (item.kind === 'switch-to-org-student') {
                  switchToOrgStudent(item.orgId);
                  navigation.goBack();
                } else navigation.navigate('Placeholder', { title: item.label, icon: item.icon, body: item.body });
              }}
            >
              {label}
            </NavRow>
          );
        })}
      </View>

      <Pressable style={styles.logoutRow} onPress={() => setConfirmingSignOut(true)}>
        <Ionicons name="log-out" size={19} color={colors.danger} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
    {confirmingSignOut ? (
      <View style={styles.confirmBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmingSignOut(false)} />
        <View style={styles.confirmCard}>
          <GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} />
          <Text style={[styles.confirmTitle, { color: colors.text }]}>Sign out</Text>
          <Text style={[styles.confirmMessage, { color: colors.textSoft }]}>Are you sure you want to sign out?</Text>
          <View style={styles.confirmRow}>
            <Pressable style={[styles.confirmBtn, { borderColor: colors.border }]} onPress={() => setConfirmingSignOut(false)}>
              <Text style={[styles.confirmBtnText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.confirmBtn, styles.confirmBtnPrimary, { backgroundColor: colors.danger }]} onPress={finishSignOut}>
              <Text style={[styles.confirmBtnText, styles.confirmBtnTextPrimary]}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </View>
    ) : null}
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 30 },
    topRow: { marginBottom: 14 },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 22,
    },
    profileInfo: { flex: 1 },
    hi: { fontSize: 18, fontFamily: fonts.displayBlack, color: colors.text },
    email: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      marginBottom: 14,
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
    // A plain in-screen overlay, not a react-native <Modal> - see the note
    // above finishSignOut() for why this screen can't use the shared
    // confirm() from ToastContext.
    confirmBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
    },
    confirmCard: {
      marginHorizontal: 24,
      borderRadius: 18,
      padding: 20,
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    confirmTitle: { fontSize: 16, fontFamily: fonts.displayBlack, marginBottom: 6 },
    confirmMessage: { fontSize: 13.5, fontFamily: fonts.body, lineHeight: 19 },
    confirmRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
    confirmBtn: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 11, alignItems: 'center' },
    confirmBtnPrimary: { borderWidth: 0 },
    confirmBtnText: { fontSize: 13.5, fontFamily: fonts.bodyBold },
    confirmBtnTextPrimary: { color: '#fff' },
  });
}

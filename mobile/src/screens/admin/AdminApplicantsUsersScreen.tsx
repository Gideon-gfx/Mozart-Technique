import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import * as adminApi from '../../api/admin';
import type { AdminFlaggedEntry, AdminOrganizationRow, AdminPerformerRow, AdminReportRow, AdminUserRow } from '../../api/admin';
import { ApiError, resolveMediaUrl } from '../../api/client';
import AdminHeader from '../../components/AdminHeader';
import CollapsibleSidebar from '../../components/CollapsibleSidebar';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAdminIdentity } from '../../hooks/useAdminIdentity';
import type { AdminTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<AdminTabParamList, 'ApplicantsUsers'>;
type Section = 'users' | 'sponsors' | 'ngos' | 'performers' | 'flagged' | 'reports';

const SECTIONS: { key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'sponsors', label: 'Sponsors', icon: 'heart-outline' },
  { key: 'ngos', label: 'NGO & Institutions', icon: 'business-outline' },
  { key: 'performers', label: 'Performers', icon: 'musical-notes-outline' },
  { key: 'flagged', label: 'Flagged', icon: 'warning-outline' },
  { key: 'reports', label: 'Reports', icon: 'document-text-outline' },
];

// Every "review someone's application" or "moderate someone" flow, folded
// into one tab with a sidebar - mirrors admin.html's Applicants/Users,
// Sponsors, NGO & Institutions and Performers tabs, plus the Flagged
// Accounts and User Reports cards from its Activity & Flags tab (those two
// are moderation, same shape as the rest of this tab, not read-only
// activity logs like the other two cards there - see AdminActivityScreen
// under More for those).
export default function AdminApplicantsUsersScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [section, setSection] = useState<Section>('users');

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <AdminHeader
        title="Applicants & Users"
        onBack={() => navigation.navigate('Analytics')}
        onNotifications={() => navigation.getParent()?.navigate('Notifications')}
        onProfile={() => navigation.getParent()?.navigate('Profile')}
      />
      <CollapsibleSidebar sections={SECTIONS} activeKey={section} onSelect={(key) => setSection(key as Section)}>
        <View style={styles.content}>
          {section === 'users' ? (
            <UsersSection navigation={navigation} colors={colors} />
          ) : section === 'sponsors' ? (
            <OrganizationsSection sponsorType="individual" title="Sponsors" colors={colors} />
          ) : section === 'ngos' ? (
            <OrganizationsSection sponsorType="ngo" title="NGO & Institutions" colors={colors} />
          ) : section === 'performers' ? (
            <PerformersSection colors={colors} />
          ) : section === 'flagged' ? (
            <FlaggedSection colors={colors} />
          ) : (
            <ReportsSection colors={colors} />
          )}
        </View>
      </CollapsibleSidebar>
    </View>
  );
}

function SectionScroll({ children, colors }: { children: React.ReactNode; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <ScrollView contentContainerStyle={styles.sectionContent} showsVerticalScrollIndicator={false}>{children}</ScrollView>;
}

const ROLE_OPTIONS_BASE: { value: adminApi.AdminAssignableRole; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'support_agent', label: 'Support Agent' },
];
const ROLE_OPTIONS_PRIMARY: { value: adminApi.AdminAssignableRole; label: string }[] = [
  ...ROLE_OPTIONS_BASE,
  { value: 'country_admin', label: 'Country Admin' },
  { value: 'admin', label: 'Main Admin' },
  { value: 'demo', label: 'Demo' },
];

function UsersSection({ navigation, colors }: { navigation: Props['navigation']; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user: me } = useAuth();
  const { isPrimary } = useAdminIdentity();
  const { toast, actionSheet } = useToast();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback((search?: string) => {
    return adminApi
      .fetchAdminUsers(search)
      .then((res) => {
        setUsers(res.users);
        setIsPrimaryAdmin(res.isPrimaryAdmin);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load users.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function changeRole(row: AdminUserRow) {
    const options = isPrimary && isPrimaryAdmin ? ROLE_OPTIONS_PRIMARY : ROLE_OPTIONS_BASE;
    actionSheet({
      title: `Role for ${row.name}`,
      actions: options.map((opt) => ({
        label: opt.label,
        onPress: async () => {
          setSavingId(row.id);
          try {
            await adminApi.setUserRole(row.id, opt.value);
            toast(`${row.name} is now ${opt.label}.`, 'success');
            load(query);
          } catch (err) {
            toast(err instanceof ApiError ? err.message : 'Could not update that role.', 'error');
          } finally {
            setSavingId(null);
          }
        },
      })),
    });
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={15} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            load(v);
          }}
          placeholder="Search name or email"
          placeholderTextColor={colors.textFaint}
        />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <SectionScroll colors={colors}>
          {users.map((u, i) => (
            <Pressable key={u.id} style={[styles.rowCard, i > 0 && { marginTop: 8 }]} onPress={() => changeRole(u)} disabled={savingId === u.id}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{u.name}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>{u.email} · {u.countryCode || 'Unknown'}</Text>
              </View>
              <View style={styles.roleBadgeCol}>
                <View style={styles.roleDropdown}>
                  <View style={[styles.badge, u.role === 'admin' || u.role === 'country_admin' ? styles.badgeActive : styles.badgeNeutral]}>
                    <Text style={[styles.badgeText, u.role === 'admin' || u.role === 'country_admin' ? styles.badgeTextActive : styles.badgeTextNeutral]}>
                      {u.adminCountryCode ? `Country admin (${u.adminCountryCode})` : u.role}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={14} color={colors.textFaint} />
                </View>
                {savingId === u.id ? <ActivityIndicator size="small" color={colors.primaryRed} style={{ marginTop: 4 }} /> : null}
              </View>
            </Pressable>
          ))}
        </SectionScroll>
      )}
    </View>
  );
}

function OrganizationsSection({ sponsorType, title, colors }: { sponsorType: 'individual' | 'ngo'; title: string; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast, confirm, actionSheet } = useToast();
  const { isPrimary, countryName } = useAdminIdentity();
  const [orgs, setOrgs] = useState<AdminOrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [amountDrafts, setAmountDrafts] = useState<Record<number, string>>({});
  // /api/admin/organizations isn't server-scoped by country the way
  // tutors/users/performers are (see server.js) - Main Admin gets a real,
  // editable filter to narrow it down; a Country Admin gets no filter UI
  // at all (same "no all-countries option" rule as everywhere else) - just
  // silently locked to their own country's name, exactly like Analytics/
  // Payouts/Activity are locked server-side.
  const [countryQuery, setCountryQuery] = useState('');

  const load = useCallback(() => {
    return adminApi
      .fetchAdminOrganizations()
      .then((res) => setOrgs(res.organizations.filter((o) => o.sponsorType === sponsorType)))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load organizations.'));
  }, [sponsorType]);

  const activeCountryFilter = isPrimary ? countryQuery : countryName || '';
  const visibleOrgs = orgs.filter((o) => !activeCountryFilter.trim() || (o.locality?.country || '').toLowerCase().includes(activeCountryFilter.trim().toLowerCase()));

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function setStatus(org: AdminOrganizationRow, status: 'approved' | 'rejected') {
    setBusyId(org.id);
    try {
      await adminApi.setOrganizationStatus(org.id, status);
      toast(`${org.name || org.contactName} ${status}.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update that application.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  function activate(org: AdminOrganizationRow) {
    actionSheet({
      title: 'Activate subscription',
      actions: [
        { label: 'Monthly', onPress: () => runActivate(org, 1) },
        { label: 'Yearly', onPress: () => runActivate(org, 12) },
      ],
    });
  }

  async function runActivate(org: AdminOrganizationRow, months: 1 | 12) {
    setBusyId(org.id);
    try {
      await adminApi.activateOrganizationSubscription(org.id, months);
      toast('Subscription activated.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not activate subscription.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function saveAmount(org: AdminOrganizationRow) {
    const raw = amountDrafts[org.id];
    const amount = Number(raw != null ? raw : org.monthlyAmount || 0);
    if (Number.isNaN(amount)) return toast('Enter a valid amount.', 'error');
    setBusyId(org.id);
    try {
      await adminApi.setOrganizationMonthlyAmount(org.id, amount);
      toast('Amount saved.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save that amount.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function markCodeSent(org: AdminOrganizationRow) {
    setBusyId(org.id);
    try {
      await adminApi.markOrgCodeSent(org.id);
      toast('Organization code marked as sent.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update that code.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(org: AdminOrganizationRow) {
    const ok = await confirm({ title: 'Delete application?', message: `${org.name || org.contactName} will be permanently removed.`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    setBusyId(org.id);
    try {
      await adminApi.deleteOrganization(org.id);
      toast('Deleted.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete that organization.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionHeading}>{title}</Text>
      {isPrimary ? (
        <View style={styles.searchRow}>
          <Ionicons name="flag-outline" size={14} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            value={countryQuery}
            onChangeText={setCountryQuery}
            placeholder="Filter by country name"
            placeholderTextColor={colors.textFaint}
          />
        </View>
      ) : null}
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : visibleOrgs.length === 0 ? (
        <Text style={styles.emptyText}>No {title.toLowerCase()} match.</Text>
      ) : (
        <SectionScroll colors={colors}>
          {visibleOrgs.map((org, i) => {
            const location = org.fullAddress || [org.locality?.city, org.locality?.country].filter(Boolean).join(', ') || 'Unknown location';
            const studentCode = (org.studentCodes || []).find((c) => c.role === 'student' || c.isOrganizationalCode);
            const tutorCode = (org.tutorCodes || []).find((c) => c.role === 'tutor');
            const redeemedCount = (org.studentCodes || []).filter((c) => c.redeemedAt).length;
            const totalCodes = (org.studentCodes || []).length;
            return (
              <View key={org.id} style={[styles.rowCard, styles.rowCardColumn, i > 0 && { marginTop: 10 }]}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{org.name || org.contactName}</Text>
                  <View style={[styles.badge, org.status === 'approved' ? styles.badgeActive : org.status === 'rejected' ? styles.badgeDanger : styles.badgePending]}>
                    <Text style={[styles.badgeText, org.status === 'approved' ? styles.badgeTextActive : org.status === 'rejected' ? styles.badgeTextDanger : styles.badgeTextPending]}>{org.status}</Text>
                  </View>
                </View>
                {sponsorType === 'ngo' ? (
                  <Text style={styles.rowMeta}>{org.organizationType === 'institution' ? 'Educational Institution' : 'NGO'}</Text>
                ) : null}
                <Text style={styles.rowMeta}>{org.contactName} ({org.email}){org.registrationNumber ? ` · Reg. ${org.registrationNumber}` : ''}</Text>
                {org.phone ? <Text style={styles.rowMeta}>{org.phone}</Text> : null}
                <Text style={styles.rowMeta}>{location}</Text>

                {sponsorType === 'ngo' ? (
                  <>
                    <Text style={styles.rowMeta}>
                      {org.numStudents ? `${org.numStudents} students` : 'Students: -'} · {org.numTutors ? `${org.numTutors} tutors` : 'Tutors: -'}
                    </Text>
                    <Text style={styles.rowMeta}>{org.description || 'No description provided.'}</Text>
                    {org.certificateUrl ? (
                      <Pressable onPress={() => Linking.openURL(resolveMediaUrl(org.certificateUrl)!)}>
                        <Text style={styles.linkText}>View uploaded document</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.rowMeta}>No document uploaded</Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.rowMeta}>
                    {org.numStudents ? `${org.numStudents} students` : 'Students: -'} · {org.numTutors ? `${org.numTutors} tutors` : 'Tutors: -'} · {redeemedCount}/{totalCodes} codes redeemed
                  </Text>
                )}

                <Text style={styles.rowMeta}>
                  Subscription: {org.subscriptionStatus === 'active' ? `Active${org.subscriptionEndAt ? ` until ${new Date(org.subscriptionEndAt).toLocaleDateString()}` : ''}` : 'Inactive'}
                </Text>

                {sponsorType === 'ngo' && org.status === 'approved' ? (
                  <View style={styles.codeBox}>
                    <Text style={styles.codeBoxLabel}>Organization code</Text>
                    <View style={styles.codeBoxRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowMeta}>Student code</Text>
                        <Text style={styles.codeText}>{studentCode ? studentCode.code : 'Not generated'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowMeta}>Tutor code</Text>
                        <Text style={styles.codeText}>{tutorCode ? tutorCode.code : 'Not generated'}</Text>
                      </View>
                    </View>
                  </View>
                ) : null}

                {sponsorType === 'ngo' && org.status === 'approved' ? (
                  <View style={styles.amountRow}>
                    <TextInput
                      style={styles.amountInput}
                      value={amountDrafts[org.id] != null ? amountDrafts[org.id] : String(org.monthlyAmount || 0)}
                      onChangeText={(v) => setAmountDrafts((prev) => ({ ...prev, [org.id]: v.replace(/[^0-9]/g, '') }))}
                      keyboardType="number-pad"
                      placeholder="Monthly amount (USD)"
                      placeholderTextColor={colors.textFaint}
                    />
                    <Pressable style={styles.actionBtn} onPress={() => saveAmount(org)} disabled={busyId === org.id}>
                      {busyId === org.id ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Text style={styles.actionBtnText}>Save Amount</Text>}
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.actionsRow}>
                  {org.status !== 'approved' ? (
                    <Pressable style={styles.actionBtn} onPress={() => setStatus(org, 'approved')} disabled={busyId === org.id}>
                      <Text style={styles.actionBtnText}>Approve</Text>
                    </Pressable>
                  ) : null}
                  {org.status !== 'rejected' ? (
                    <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => setStatus(org, 'rejected')} disabled={busyId === org.id}>
                      <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Reject</Text>
                    </Pressable>
                  ) : null}
                  {org.status === 'approved' && org.subscriptionStatus !== 'active' ? (
                    <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => activate(org)} disabled={busyId === org.id}>
                      <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Activate</Text>
                    </Pressable>
                  ) : null}
                  {sponsorType === 'ngo' && org.status === 'approved' && studentCode && !studentCode.sentToOrganization ? (
                    <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => markCodeSent(org)} disabled={busyId === org.id}>
                      <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Mark code sent</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={styles.deleteIconBtn} onPress={() => remove(org)} disabled={busyId === org.id}>
                    {busyId === org.id ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="trash-outline" size={16} color={colors.danger} />}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </SectionScroll>
      )}
    </View>
  );
}

function PerformersSection({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [performers, setPerformers] = useState<AdminPerformerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    return adminApi
      .fetchAdminPerformers()
      .then((res) => setPerformers(res.performers))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load performers.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function setStatus(p: AdminPerformerRow, status: 'approved' | 'rejected') {
    setBusyId(p.id);
    try {
      await adminApi.setPerformerStatus(p.id, status);
      toast(`${p.name} ${status}.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update that performer.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSuspend(p: AdminPerformerRow) {
    setBusyId(p.id);
    try {
      await adminApi.setPerformerSuspended(p.id, !p.suspended);
      toast(p.suspended ? 'Unsuspended.' : 'Suspended.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update that performer.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionHeading}>Performers</Text>
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : performers.length === 0 ? (
        <Text style={styles.emptyText}>No performer applications yet.</Text>
      ) : (
        <SectionScroll colors={colors}>
          {performers.map((p, i) => (
            <View key={p.id} style={[styles.rowCard, styles.rowCardColumn, i > 0 && { marginTop: 10 }]}>
              <View style={styles.cardTopRow}>
                <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
                <View style={[styles.badge, p.status === 'approved' ? styles.badgeActive : p.status === 'rejected' ? styles.badgeDanger : styles.badgePending]}>
                  <Text style={[styles.badgeText, p.status === 'approved' ? styles.badgeTextActive : p.status === 'rejected' ? styles.badgeTextDanger : styles.badgeTextPending]}>{p.status}</Text>
                </View>
              </View>
              <Text style={styles.rowMeta}>{(p.categories || []).join(', ') || 'General'} · {p.city || 'Unknown'}</Text>
              <View style={styles.actionsRow}>
                {p.status !== 'approved' ? (
                  <Pressable style={styles.actionBtn} onPress={() => setStatus(p, 'approved')} disabled={busyId === p.id}>
                    <Text style={styles.actionBtnText}>Approve</Text>
                  </Pressable>
                ) : null}
                {p.status !== 'rejected' ? (
                  <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => setStatus(p, 'rejected')} disabled={busyId === p.id}>
                    <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Reject</Text>
                  </Pressable>
                ) : null}
                {p.status === 'approved' ? (
                  <Pressable style={[styles.actionBtn, p.suspended ? styles.actionBtn : styles.actionBtnSecondary]} onPress={() => toggleSuspend(p)} disabled={busyId === p.id}>
                    <Text style={[styles.actionBtnText, !p.suspended && styles.actionBtnTextSecondary]}>{p.suspended ? 'Unsuspend' : 'Suspend'}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </SectionScroll>
      )}
    </View>
  );
}

function FlaggedSection({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast, confirm } = useToast();
  const [tutorsList, setTutorsList] = useState<AdminFlaggedEntry[]>([]);
  const [studentsList, setStudentsList] = useState<AdminFlaggedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    return adminApi
      .fetchAdminFlagged()
      .then((res) => {
        setTutorsList(res.tutors);
        setStudentsList(res.students);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load flagged accounts.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function expel(entry: AdminFlaggedEntry) {
    const ok = await confirm({ title: 'Expel tutor?', message: `${entry.name} will be removed from all active lessons.`, confirmLabel: 'Expel', destructive: true });
    if (!ok) return;
    setBusyId(entry.id);
    try {
      await adminApi.expelTutor(entry.id);
      toast('Tutor expelled.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not expel that tutor.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const combined = [...tutorsList.map((t) => ({ ...t, role: 'tutor' as const })), ...studentsList.map((s) => ({ ...s, role: 'student' as const }))];

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionHeading}>Flagged Accounts</Text>
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : combined.length === 0 ? (
        <Text style={styles.emptyText}>No flagged accounts.</Text>
      ) : (
        <SectionScroll colors={colors}>
          {combined.map((entry, i) => (
            <View key={`${entry.role}-${entry.id}`} style={[styles.rowCard, i > 0 && { marginTop: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{entry.name}</Text>
                <Text style={styles.rowMeta}>{entry.role} · flagged {new Date(entry.flaggedAt).toLocaleDateString()}</Text>
              </View>
              {entry.role === 'tutor' ? (
                <Pressable style={styles.deleteIconBtn} onPress={() => expel(entry)} disabled={busyId === entry.id}>
                  {busyId === entry.id ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="close-circle-outline" size={18} color={colors.danger} />}
                </Pressable>
              ) : null}
            </View>
          ))}
        </SectionScroll>
      )}
    </View>
  );
}

function ReportsSection({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [reports, setReports] = useState<AdminReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    return adminApi
      .fetchAdminReports()
      .then((res) => setReports(res.reports))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load reports.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function resolve(r: AdminReportRow) {
    setBusyId(r.id);
    try {
      await adminApi.resolveReport(r.id);
      toast('Report resolved.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not resolve that report.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionHeading}>User Reports</Text>
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : reports.length === 0 ? (
        <Text style={styles.emptyText}>No reports filed.</Text>
      ) : (
        <SectionScroll colors={colors}>
          {reports.map((r, i) => (
            <View key={r.id} style={[styles.rowCard, styles.rowCardColumn, i > 0 && { marginTop: 10 }]}>
              <Text style={styles.rowTitle}>{r.reportedUserName || 'Unknown'} reported by {r.reporterName || 'Unknown'}</Text>
              <Text style={styles.rowMeta}>{r.reason}</Text>
              <Text style={styles.rowMeta}>{new Date(r.createdAt).toLocaleDateString()} · {r.status}</Text>
              {r.status !== 'resolved' ? (
                <Pressable style={[styles.actionBtn, { alignSelf: 'flex-start', marginTop: 8 }]} onPress={() => resolve(r)} disabled={busyId === r.id}>
                  {busyId === r.id ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Text style={styles.actionBtnText}>Mark resolved</Text>}
                </Pressable>
              ) : null}
            </View>
          ))}
        </SectionScroll>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12 },
    title: { fontSize: 20, fontFamily: fonts.displayBlack, color: colors.text },
    shell: { flex: 1, flexDirection: 'row' },
    sidebar: { flexGrow: 0, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border },
    sidebarOpen: { width: 160 },
    sidebarClosed: { width: 60 },
    sidebarToggle: { alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    sidebarContent: { paddingVertical: 10, paddingHorizontal: 8, gap: 6 },
    sidebarItem: { alignItems: 'center', gap: 6, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 6 },
    sidebarItemOpen: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 12 },
    sidebarItemActive: { backgroundColor: colors.primaryRed },
    sidebarItemText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center', lineHeight: 15, flexShrink: 1 },
    sidebarItemTextActive: { color: colors.onPrimary },
    content: { flex: 1, padding: 16 },
    sectionContent: { paddingBottom: 30 },
    sectionHeading: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 12 },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.text },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center', marginTop: 20 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 8 },
    rowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
    },
    rowCardColumn: { flexDirection: 'column', alignItems: 'stretch' },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
    rowTitle: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text, flexShrink: 1 },
    rowMeta: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    roleBadgeCol: { alignItems: 'flex-end' },
    roleDropdown: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    badgeActive: { backgroundColor: colors.statusActiveBg },
    badgePending: { backgroundColor: colors.statusPendingBg },
    badgeDanger: { backgroundColor: `${colors.danger}18` },
    badgeNeutral: { backgroundColor: colors.background },
    badgeText: { fontSize: 10, fontFamily: fonts.bodyBold, textTransform: 'capitalize' },
    badgeTextActive: { color: colors.statusActiveText },
    badgeTextPending: { color: colors.statusPendingText },
    badgeTextDanger: { color: colors.danger },
    badgeTextNeutral: { color: colors.textFaint },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    actionBtn: { backgroundColor: colors.primaryRed, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    actionBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    linkText: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.primaryRed, marginTop: 2, textDecorationLine: 'underline' },
    codeBox: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: 12, padding: 10, marginTop: 8, backgroundColor: colors.background },
    codeBoxLabel: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 },
    codeBoxRow: { flexDirection: 'row', gap: 12 },
    codeText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text, marginTop: 2 },
    amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    amountInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, fontFamily: fonts.body, color: colors.text },
    actionBtnSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    actionBtnTextSecondary: { color: colors.text },
    deleteIconBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: `${colors.danger}12`, alignItems: 'center', justifyContent: 'center' },
  });
}

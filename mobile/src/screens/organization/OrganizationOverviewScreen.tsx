import { FlatList, ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { openBrowser } from '../../utils/openBrowser';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../../api/client';
import * as organizationsApi from '../../api/organizations';
import type { LessonBill, MySponsorOrg, OrgEvent, OrgRosterMember, SponsorCodeEntry } from '../../api/organizations';
import Avatar from '../../components/Avatar';
import GlassSurface from '../../components/GlassSurface';
import NotificationBell from '../../components/NotificationBell';
import PaymentResultModal from '../../components/PaymentResultModal';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { OrganizationTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<OrganizationTabParamList, 'Overview'>;

interface Activity {
  text: string;
  date: string;
}

// The Organization Dashboard's own home tab - mirrors ngo-dashboard.html's
// Overview tab content exactly (stats grid, Recent Activities, Subscription
// Status), with the org's own logo+name as the top nav instead of a page
// title, and this mode's own quick actions (Library, Search Mozart
// Techniques, Meetings, Feedbacks - the web sidebar's own remaining
// destinations, surfaced here since there's no persistent sidebar on
// mobile). Deliberately its own screen, not the Sponsor Dashboard reused -
// an Individual Sponsor sponsors a single student, while an Organization
// has both students and tutors of its own (see the Tutors stat below,
// which Sponsor has no equivalent for).
export default function OrganizationOverviewScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { toast } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<MySponsorOrg | null>(null);
  const [roster, setRoster] = useState<{ students: OrgRosterMember[]; tutors: OrgRosterMember[] }>({ students: [], tutors: [] });
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [bills, setBills] = useState<LessonBill[]>([]);
  const [billsOpen, setBillsOpen] = useState(false);
  const [payingKey, setPayingKey] = useState<string | null>(null);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);
  const [allCodes, setAllCodes] = useState<SponsorCodeEntry[]>([]);
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [meetingsOpen, setMeetingsOpen] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ status: 'success' | 'error'; title: string; message: string } | null>(null);

  const load = useCallback(() => {
    return Promise.all([
      organizationsApi.fetchMySponsorOrg(),
      organizationsApi.fetchOrgMembers().catch(() => ({ students: [] as OrgRosterMember[], tutors: [] as OrgRosterMember[] })),
      organizationsApi.fetchLessonBills().catch(() => ({ bills: [] as LessonBill[] })),
    ])
      .then(([data, memberData, billsData]) => {
        setOrg(data.organization);
        setSubscriptionActive(data.subscriptionActive);
        setRoster(memberData);
        setBills(billsData.bills);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your organization.'));
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    refreshCodes();
    setRefreshing(false);
  }

  async function payBill(bill: LessonBill) {
    const key = `${bill.assignmentId}-${bill.sessionId}`;
    setPayingKey(key);
    try {
      const { url } = await organizationsApi.payLessonBill(bill.assignmentId, bill.sessionId);
      setBillsOpen(false);
      await openBrowser(url);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not start that payment.', 'error');
    } finally {
      setPayingKey(null);
    }
  }

  async function subscribe(billingPeriod: 'monthly' | 'yearly') {
    setSubscribing(true);
    try {
      const { url } = await organizationsApi.startSubscriptionCheckout(billingPeriod);
      setSubscriptionOpen(false);
      await openBrowser(url);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not start checkout.', 'error');
    } finally {
      setSubscribing(false);
    }
  }

  async function topUpWallet(amountUsd: number) {
    setToppingUp(true);
    try {
      const { url, sessionId } = await organizationsApi.topUpWallet(amountUsd);
      setSubscriptionOpen(false);
      toast('Opening secure checkout…');
      await openBrowser(url);
      // The checkout happened in a separate browser the user just came
      // back from - give an explicit result card here rather than a toast
      // that's easy to miss right as focus returns to the app.
      try {
        const result = await organizationsApi.verifyWalletTopup(sessionId);
        setPaymentResult({
          status: 'success',
          title: 'Payment successful',
          message: `$${amountUsd.toFixed(2)} was added to your wallet. New balance: $${result.walletBalanceUsd.toFixed(2)}.`,
        });
      } catch (verifyErr) {
        if (verifyErr instanceof ApiError && /not been paid/i.test(verifyErr.message)) {
          setPaymentResult({
            status: 'error',
            title: 'Payment not completed',
            message: 'The checkout was closed before the payment finished, so your wallet was not charged.',
          });
        } else {
          setPaymentResult({
            status: 'error',
            title: 'Payment failed',
            message: verifyErr instanceof ApiError ? verifyErr.message : 'Could not confirm that payment.',
          });
        }
      }
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not start checkout.', 'error');
    } finally {
      setToppingUp(false);
    }
  }

  // Access Codes has its own screen now (generate/invite/manage) - this
  // quiet background load just keeps allCodes populated for Recent
  // Activities, which surfaces code-redemption events among its entries.
  function refreshCodes() {
    organizationsApi
      .fetchSponsorCodes()
      .then((data) => setAllCodes([...data.students, ...data.tutors]))
      .catch(() => {});
  }

  const orgName = org?.name || org?.contactName || 'Organization';
  const logo = resolveMediaUrl(org?.logoUrl ?? null);

  // Same activity computation as ngo-dashboard.html's setOrgData(): members
  // joining plus codes being redeemed/created, most recent first.
  const allActivities: Activity[] = useMemo(() => {
    const memberEvents: Activity[] = [
      ...roster.students.map((m) => ({ text: `${m.name} joined the organization`, date: '' })),
      ...roster.tutors.map((m) => ({ text: `${m.name} joined the organization`, date: '' })),
    ];
    const codeEvents: Activity[] = allCodes.map((code) => ({
      text: `${code.role === 'tutor' ? 'Tutor code' : 'Student code'} ${code.redeemedAt ? `redeemed by ${code.redeemedName || code.studentName || 'a member'}` : 'created'}`,
      date: code.redeemedAt || code.createdAt,
    }));
    return [...memberEvents, ...codeEvents].filter((a) => a.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [roster, allCodes]);
  const activities = allActivities.slice(0, 5);
  const [activitiesOpen, setActivitiesOpen] = useState(false);

  useEffect(() => {
    // Recent Activities needs code timestamps too - loaded quietly once so
    // the card isn't empty until someone visits Access Codes.
    refreshCodes();
  }, []);

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View style={styles.header}>
        <GlassSurface clear pointerEvents="none" style={[StyleSheet.absoluteFill, styles.headerGlass]} />
        <View style={styles.headerLeft}>
          <Avatar name={orgName} photoUrl={logo} size={38} viewable={false} />
          <Text style={styles.navTitle} numberOfLines={1}>{orgName}</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.iconButton} onPress={() => navigation.getParent()?.navigate('SponsorNotifications')} hitSlop={10}>
            <NotificationBell size={20} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => navigation.getParent()?.navigate('Profile')} hitSlop={10}>
            <Avatar name={user?.name || '?'} photoUrl={user?.photoUrl} size={34} viewable={false} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error || !org ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || 'No organization application found.'}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryRed} />}
        >
          <Text style={styles.pageTitle}>Organization Overview</Text>
          <Text style={styles.pageSubtitle}>Live snapshot of your organization, classrooms and subscription.</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Tutors</Text>
              <Text style={styles.statValue}>{roster.tutors.length}</Text>
            </View>
            <Pressable style={styles.statCard} onPress={() => setPaymentHistoryOpen(true)}>
              <View style={styles.statTopRow}>
                <Text style={styles.statLabel}>Payment</Text>
                <View style={[styles.badge, subscriptionActive ? styles.badgeActive : styles.badgePending]}>
                  <Text style={[styles.badgeText, subscriptionActive ? styles.badgeTextActive : styles.badgeTextPending]}>{subscriptionActive ? 'Active' : 'Pending'}</Text>
                </View>
              </View>
              <Text style={styles.money}>{org.localSymbol}{org.monthlyAmountLocal.toFixed(2)} {org.localCurrency}</Text>
              <Text style={styles.statHint}>Monthly subscription</Text>
            </Pressable>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Students</Text>
              <Text style={styles.statValue}>{roster.students.length}</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statTopRow}>
                <Text style={styles.statLabel}>Profile</Text>
                <View style={[styles.badge, styles.badgeActive]}>
                  <Text style={[styles.badgeText, styles.badgeTextActive]}>Updated</Text>
                </View>
              </View>
              <Text style={styles.statHint}>Organization details and settings</Text>
              <Pressable style={styles.profileBtnPrimary} onPress={() => navigation.navigate('More', { screen: 'Settings' })}>
                <Ionicons name="create-outline" size={14} color={colors.onPrimary} />
                <Text style={styles.profileBtnPrimaryText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.profileBtnSecondary} onPress={() => navigation.getParent()?.navigate('Orientation')}>
                <Ionicons name="compass-outline" size={14} color={colors.text} />
                <Text style={styles.profileBtnSecondaryText}>Check Orientation</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.statusGrid}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Subscription Status</Text>
              <View style={styles.subRow}>
                <Text style={styles.subLabel}>Status:</Text>
                <View style={[styles.badge, subscriptionActive ? styles.badgeActive : styles.badgePending]}>
                  <Text style={[styles.badgeText, subscriptionActive ? styles.badgeTextActive : styles.badgeTextPending]}>{subscriptionActive ? 'Active' : 'Inactive'}</Text>
                </View>
              </View>
              <View style={styles.subRow}>
                <Text style={styles.subLabel}>Monthly Amount:</Text>
                <Text style={styles.subValue}>{org.localSymbol}{org.monthlyAmountLocal.toFixed(2)}</Text>
              </View>
              <View style={styles.subRow}>
                <Text style={styles.subLabel}>Expiration Date:</Text>
                <Text style={styles.subValue}>{org.subscriptionEndAt ? new Date(org.subscriptionEndAt).toLocaleDateString() : 'Not active yet'}</Text>
              </View>
              <Text style={styles.activateLabel}>Activate subscription:</Text>
              <View style={styles.payRow}>
                <Pressable style={styles.payBtn} onPress={() => subscribe('monthly')} disabled={subscribing}>
                  {subscribing ? <ActivityIndicator size="small" color={colors.onPrimary} /> : (
                    <>
                      <Ionicons name="wallet-outline" size={14} color={colors.onPrimary} />
                      <Text style={styles.payBtnText}>Pay Monthly</Text>
                    </>
                  )}
                </Pressable>
                <Pressable style={styles.payBtn} onPress={() => subscribe('yearly')} disabled={subscribing}>
                  <Ionicons name="calendar-outline" size={14} color={colors.onPrimary} />
                  <Text style={styles.payBtnText}>Pay Yearly</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={styles.actionsGrid}>
            <Pressable style={styles.actionCard} onPress={() => navigation.getParent()?.navigate('OrgLibrary')}>
              <View style={styles.actionIcon}>
                <Ionicons name="book-outline" size={19} color={colors.primaryRed} />
              </View>
              <Text style={styles.actionTitle}>Library</Text>
              <Text style={styles.actionSubtitle}>{orgName}'s own resources</Text>
            </Pressable>
            <Pressable style={styles.actionCard} onPress={() => navigation.getParent()?.navigate('Library', undefined)}>
              <View style={styles.actionIcon}>
                <Ionicons name="search-outline" size={19} color={colors.primaryRed} />
              </View>
              <Text style={styles.actionTitle}>Search Mozart Techniques</Text>
              <Text style={styles.actionSubtitle}>The shared technique library</Text>
            </Pressable>
            <Pressable style={styles.actionCard} onPress={() => setMeetingsOpen(true)}>
              <View style={styles.actionIcon}>
                <Ionicons name="videocam-outline" size={19} color={colors.primaryRed} />
              </View>
              <Text style={styles.actionTitle}>Meetings</Text>
              <Text style={styles.actionSubtitle}>Create & join</Text>
            </Pressable>
            <Pressable style={styles.actionCard} onPress={() => navigation.getParent()?.navigate('AccessCodes')}>
              <View style={styles.actionIcon}>
                <Ionicons name="key-outline" size={19} color={colors.primaryRed} />
              </View>
              <Text style={styles.actionTitle}>Access Codes</Text>
              <Text style={styles.actionSubtitle}>Generate & manage</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Recent Activities</Text>
          <Pressable style={styles.activitiesCard} onPress={() => setActivitiesOpen(true)}>
            {activities.length === 0 ? (
              <View style={styles.activityRow}>
                <Text style={styles.activityText}>No student activity yet</Text>
                <Text style={styles.activityDate}>Awaiting first code redemption</Text>
              </View>
            ) : (
              activities.map((a, i) => (
                <View key={i} style={styles.activityRow}>
                  <Text style={styles.activityText} numberOfLines={1}>{a.text}</Text>
                  <Text style={styles.activityDate}>{new Date(a.date).toLocaleDateString()}</Text>
                </View>
              ))
            )}
            {allActivities.length > 0 ? (
              <View style={styles.activitiesViewAllRow}>
                <Text style={styles.activitiesViewAllText}>View all activity</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primaryRed} />
              </View>
            ) : null}
          </Pressable>
        </ScrollView>
      )}

      <Modal visible={activitiesOpen} animationType="slide" onRequestClose={() => setActivitiesOpen(false)}>
        <View style={styles.activitiesPage}>
          <View style={styles.activitiesPageHeader}>
            <GlassSurface clear pointerEvents="none" style={[StyleSheet.absoluteFill, styles.activitiesPageHeaderGlass]} />
            <Pressable onPress={() => setActivitiesOpen(false)} hitSlop={10}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </Pressable>
            <Text style={styles.activitiesPageTitle}>All Activity</Text>
            <View style={{ width: 22 }} />
          </View>
          <FlatList
            data={allActivities}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.activitiesPageContent}
            ListEmptyComponent={<Text style={styles.emptyTextCentered}>No student activity yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.activityRow}>
                <Text style={styles.activityText}>{item.text}</Text>
                <Text style={styles.activityDate}>{new Date(item.date).toLocaleDateString()}</Text>
              </View>
            )}
          />
        </View>
      </Modal>

      <BillsSheet
        visible={billsOpen}
        onClose={() => setBillsOpen(false)}
        bills={bills}
        payingKey={payingKey}
        onPay={payBill}
        colors={colors}
      />
      <SubscriptionSheet
        visible={subscriptionOpen}
        onClose={() => setSubscriptionOpen(false)}
        org={org}
        subscribing={subscribing}
        onSubscribe={subscribe}
        toppingUp={toppingUp}
        onTopUp={topUpWallet}
        onViewCodes={() => { setSubscriptionOpen(false); navigation.getParent()?.navigate('AccessCodes'); }}
        colors={colors}
      />
      <PaymentHistorySheet
        visible={paymentHistoryOpen}
        onClose={() => setPaymentHistoryOpen(false)}
        history={org?.paymentHistory || []}
        colors={colors}
      />
      <MeetingsModal
        visible={meetingsOpen}
        onClose={() => setMeetingsOpen(false)}
        onJoinMeeting={(url) => navigation.getParent()?.navigate('MeetingWebView', { url })}
        colors={colors}
      />
      {paymentResult && (
        <PaymentResultModal
          visible
          status={paymentResult.status}
          title={paymentResult.title}
          message={paymentResult.message}
          onClose={() => setPaymentResult(null)}
          colors={colors}
        />
      )}
    </View>
  );
}

function BillsSheet({
  visible,
  onClose,
  bills,
  payingKey,
  onPay,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  bills: LessonBill[];
  payingKey: string | null;
  onPay: (bill: LessonBill) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const total = bills.reduce((sum, b) => sum + b.totalUsd, 0);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Billing</Text>
          {bills.length > 0 ? <Text style={styles.invoiceTotal}>${total.toFixed(2)} total due</Text> : null}
          {bills.length === 0 ? (
            <Text style={styles.billsEmptyText}>No lesson bills due right now - every covered lesson has been paid.</Text>
          ) : (
            <FlatList
              style={{ maxHeight: 400 }}
              data={bills}
              keyExtractor={(b) => `${b.assignmentId}-${b.sessionId}`}
              renderItem={({ item }) => {
                const key = `${item.assignmentId}-${item.sessionId}`;
                return (
                  <View style={styles.billRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.billStudent}>{item.studentName} completed {item.category} class</Text>
                      <Text style={styles.billMeta}>{item.durationMinutes} min with {item.tutorName}</Text>
                      <Text style={styles.billDate}>{new Date(item.loggedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text style={styles.billAmount}>${item.totalUsd.toFixed(2)}</Text>
                      <Pressable style={styles.billPayBtn} onPress={() => onPay(item)} disabled={payingKey === key}>
                        {payingKey === key ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Text style={styles.billPayBtnText}>Pay</Text>}
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SubscriptionSheet({
  visible,
  onClose,
  org,
  subscribing,
  onSubscribe,
  toppingUp,
  onTopUp,
  onViewCodes,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  org: MySponsorOrg | null;
  subscribing: boolean;
  onSubscribe: (period: 'monthly' | 'yearly') => void;
  toppingUp: boolean;
  onTopUp: (amountUsd: number) => void;
  onViewCodes: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [customAmount, setCustomAmount] = useState('');
  const [confirmAmount, setConfirmAmount] = useState<number | null>(null);
  const amountReady = Boolean(org && org.monthlyAmountLocal > 0);
  const TOPUP_AMOUNTS = [25, 50, 100, 250];

  useEffect(() => {
    if (visible) {
      setCustomAmount('');
      setConfirmAmount(null);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Organization wallet</Text>
          <Text style={styles.walletBalance}>${org?.walletBalanceUsd.toFixed(2) ?? '0.00'}</Text>
          <Text style={styles.walletHint}>Lesson bills for your students are paid from this balance automatically as they happen.</Text>

          <Text style={styles.customLabel}>Load money</Text>
          <View style={styles.titleOptionsWrap}>
            {TOPUP_AMOUNTS.map((amount) => (
              <Pressable key={amount} style={styles.titleChip} onPress={() => setCustomAmount(String(amount))} disabled={toppingUp}>
                <Text style={styles.titleChipText}>${amount}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.customRow}>
            <TextInput
              style={styles.customInput}
              value={customAmount}
              onChangeText={setCustomAmount}
              placeholder="Custom amount"
              placeholderTextColor={colors.textFaint}
              keyboardType="decimal-pad"
            />
            <Pressable
              style={styles.customSaveBtn}
              onPress={() => setConfirmAmount(Number(customAmount))}
              disabled={toppingUp || !Number(customAmount)}
            >
              {toppingUp ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Text style={styles.customSaveBtnText}>Load</Text>}
            </Pressable>
          </View>

          {!amountReady ? (
            <Text style={styles.billsEmptyText}>Your subscription amount hasn&apos;t been set by an admin yet - check back soon.</Text>
          ) : (
            <>
              <Pressable style={styles.planRow} onPress={() => onSubscribe('monthly')} disabled={subscribing}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planTitle}>Monthly</Text>
                  <Text style={styles.planMeta}>{org?.localSymbol}{org?.monthlyAmountLocal.toFixed(2)} / month</Text>
                </View>
                {subscribing ? <ActivityIndicator size="small" color={colors.primaryRed} /> : <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
              </Pressable>
              <Pressable style={styles.planRow} onPress={() => onSubscribe('yearly')} disabled={subscribing}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planTitle}>Yearly</Text>
                  <Text style={styles.planMeta}>{org?.localSymbol}{(((org?.monthlyAmountLocal || 0) * 12) * 0.99).toFixed(2)} / year · save 1%</Text>
                </View>
                {subscribing ? <ActivityIndicator size="small" color={colors.primaryRed} /> : <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
              </Pressable>
            </>
          )}
          <Pressable style={styles.viewCodesRow} onPress={onViewCodes}>
            <Text style={styles.viewCodesText}>View all access codes</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        </Pressable>
      </Pressable>
      <Modal visible={confirmAmount != null} transparent animationType="fade" onRequestClose={() => setConfirmAmount(null)}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Load ${confirmAmount?.toFixed(2)}?</Text>
            <Text style={styles.confirmMessage}>You&apos;ll be taken to a secure checkout to complete this payment. Your wallet balance updates once it&apos;s confirmed.</Text>
            <View style={styles.confirmRow}>
              <Pressable style={styles.confirmBtn} onPress={() => setConfirmAmount(null)}>
                <Text style={styles.confirmBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnPrimary]}
                onPress={() => {
                  const amount = confirmAmount;
                  setConfirmAmount(null);
                  if (amount) onTopUp(amount);
                }}
              >
                <Text style={[styles.confirmBtnText, styles.confirmBtnTextPrimary]}>Proceed</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

// Mirrors ngo-dashboard.html's own payment-history-trigger -> payment
// history table (date/type/amount), separate from the wallet's Load-money
// sheet - the platform subscription fee and the per-lesson billing balance
// are two different things (see MySponsorOrg's own walletBalanceUsd
// comment).
function PaymentHistorySheet({
  visible,
  onClose,
  history,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  history: { date: string; type: 'monthly' | 'yearly'; amount: number }[];
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Payment History</Text>
          {history.length === 0 ? (
            <Text style={styles.billsEmptyText}>No payments recorded yet.</Text>
          ) : (
            <FlatList
              style={{ maxHeight: 420 }}
              data={history}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentDate}>{new Date(item.date).toLocaleDateString()}</Text>
                  <Text style={styles.paymentType}>{item.type === 'yearly' ? 'Yearly' : 'Monthly'}</Text>
                  <Text style={styles.paymentAmount}>${Number(item.amount || 0).toLocaleString()} USD</Text>
                </View>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Its own page (a full-screen Modal, not a bottom sheet) - mirrors
// ngo-dashboard.html's separate top-level "Meeting" tab (Create meeting /
// Join meeting), distinct from Classroom's own read-mostly Events page even
// though both draw on the same /api/organizations/events data.
function MeetingsModal({ visible, onClose, onJoinMeeting, colors }: { visible: boolean; onClose: () => void; onJoinMeeting: (url: string) => void; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [meetLink, setMeetLink] = useState('');
  const [when, setWhen] = useState(() => { const d = new Date(Date.now() + 60 * 60 * 1000); d.setMinutes(0, 0, 0); return d; });

  const load = useCallback(() => {
    setLoading(true);
    organizationsApi
      .fetchOrgEvents()
      .then((data) => setEvents(data.events))
      .catch(() => toast('Could not load meetings.', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  async function createMeeting() {
    if (!title.trim()) {
      toast('Enter a meeting title.', 'error');
      return;
    }
    setCreating(true);
    try {
      await organizationsApi.createOrgEvent({ title: title.trim(), startISO: when.toISOString(), durationMinutes: 60, meetLink: meetLink.trim() || undefined });
      setTitle('');
      setMeetLink('');
      toast('Meeting scheduled.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not schedule that meeting.', 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.activitiesPage}>
        <View style={styles.activitiesPageHeader}>
          <GlassSurface clear pointerEvents="none" style={[StyleSheet.absoluteFill, styles.activitiesPageHeaderGlass]} />
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.activitiesPageTitle}>Meetings</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={styles.activitiesPageContent}>
          <Text style={styles.cardTitle}>Create meeting</Text>
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput style={styles.customInput} value={title} onChangeText={setTitle} placeholder="Meeting title" placeholderTextColor={colors.textFaint} />
          <View style={{ height: 8 }} />
          <View style={styles.dateStepRow}>
            <Pressable style={styles.dateStepBtn} onPress={() => setWhen(new Date(when.getTime() - 24 * 60 * 60000))}>
              <Text style={styles.dateStepBtnText}>− day</Text>
            </Pressable>
            <Text style={styles.dateStepValue}>{when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
            <Pressable style={styles.dateStepBtn} onPress={() => setWhen(new Date(when.getTime() + 24 * 60 * 60000))}>
              <Text style={styles.dateStepBtnText}>+ day</Text>
            </Pressable>
          </View>
          <View style={styles.dateStepRow}>
            <Pressable style={styles.dateStepBtn} onPress={() => setWhen(new Date(when.getTime() - 30 * 60000))}>
              <Text style={styles.dateStepBtnText}>− 30m</Text>
            </Pressable>
            <Text style={styles.dateStepValue}>{when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
            <Pressable style={styles.dateStepBtn} onPress={() => setWhen(new Date(when.getTime() + 30 * 60000))}>
              <Text style={styles.dateStepBtnText}>+ 30m</Text>
            </Pressable>
          </View>
          <TextInput style={styles.customInput} value={meetLink} onChangeText={setMeetLink} placeholder="Google Meet link (optional)" placeholderTextColor={colors.textFaint} autoCapitalize="none" />
          <Pressable style={[styles.payBtn, { marginTop: 12 }]} onPress={createMeeting} disabled={creating}>
            {creating ? <ActivityIndicator size="small" color={colors.onPrimary} /> : (
              <>
                <Ionicons name="calendar-outline" size={14} color={colors.onPrimary} />
                <Text style={styles.payBtnText}>Schedule meeting</Text>
              </>
            )}
          </Pressable>

          <Text style={[styles.cardTitle, { marginTop: 26 }]}>Upcoming meetings</Text>
          {loading ? (
            <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 12 }} />
          ) : events.length === 0 ? (
            <Text style={styles.billsEmptyText}>No meetings scheduled.</Text>
          ) : (
            events.map((event) => (
              <View key={event.id} style={styles.activityRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listItemName}>{event.title}</Text>
                  <Text style={styles.activityDate}>{new Date(event.scheduledAt).toLocaleString()}</Text>
                </View>
                {event.meetLink ? (
                  <Pressable style={styles.joinMeetingBtn} onPress={() => onJoinMeeting(event.meetLink!)}>
                    <Text style={styles.joinMeetingBtnText}>Join</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 14,
      backgroundColor: 'transparent',
    },
    headerGlass: { borderRadius: 0 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    iconButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    navTitle: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text, flexShrink: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
    pageTitle: { fontSize: 21, fontFamily: fonts.displayBlack, color: colors.text },
    pageSubtitle: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 4, marginBottom: 18 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
    statCard: {
      width: '47%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
    },
    statTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    statLabel: { fontSize: 10.5, fontFamily: fonts.bodyBold, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.4 },
    statValue: { fontSize: 30, fontFamily: fonts.displayBlack, color: colors.primaryRed, marginTop: 8 },
    statHint: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 4 },
    money: { fontSize: 18, fontFamily: fonts.displayBlack, color: colors.primaryRed },
    badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
    badgeActive: { backgroundColor: colors.statusActiveBg },
    badgePending: { backgroundColor: colors.statusPendingBg },
    badgeText: { fontSize: 10, fontFamily: fonts.bodyBold },
    badgeTextActive: { color: colors.statusActiveText },
    badgeTextPending: { color: colors.statusPendingText },
    profileBtnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.primaryRed,
      borderRadius: 10,
      paddingVertical: 8,
      marginTop: 6,
    },
    profileBtnPrimaryText: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    profileBtnSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 8,
      marginTop: 6,
    },
    profileBtnSecondaryText: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.text },
    statusGrid: { gap: 12, marginBottom: 8 },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 16,
    },
    cardTitle: { fontSize: 15, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 12 },
    activityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: `${colors.primaryRed}0c`, borderRadius: 12, padding: 10, marginBottom: 8 },
    activityText: { flex: 1, fontSize: 12, fontFamily: fonts.body, color: colors.text },
    activityDate: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.text },
    activitiesCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 8 },
    activitiesViewAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 10 },
    activitiesViewAllText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.primaryRed },
    activitiesPage: { flex: 1, backgroundColor: colors.background },
    activitiesPageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 16,
      backgroundColor: 'transparent',
    },
    activitiesPageHeaderGlass: { borderRadius: 0 },
    activitiesPageTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text },
    activitiesPageContent: { padding: 20 },
    emptyTextCentered: { fontSize: 13, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', paddingTop: 40 },
    subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    subLabel: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    subValue: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text },
    activateLabel: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 6, marginBottom: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    payRow: { flexDirection: 'row', gap: 10 },
    payBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primaryRed, borderRadius: 12, paddingVertical: 11 },
    payBtnText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    sectionTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 20, marginBottom: 12 },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    actionCard: {
      width: '47%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
    },
    actionIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: `${colors.primaryRed}12`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    actionTitle: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    actionSubtitle: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    titleOptionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    titleChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
    titleChipText: { fontSize: 13, fontFamily: fonts.bodyMedium, color: colors.text },
    customLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginBottom: 8 },
    customRow: { flexDirection: 'row', gap: 8 },
    customInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
    },
    customSaveBtn: { backgroundColor: colors.primaryRed, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
    customSaveBtnText: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    confirmBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 24 },
    confirmCard: { width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
    confirmTitle: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, textAlign: 'center' },
    confirmMessage: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', marginTop: 8, lineHeight: 18 },
    confirmRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
    confirmBtn: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' },
    confirmBtnPrimary: { backgroundColor: colors.primaryRed, borderWidth: 0 },
    confirmBtnText: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    confirmBtnTextPrimary: { color: colors.onPrimary },
    billsEmptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', paddingVertical: 20 },
    billRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    billStudent: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    billMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    billDate: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 3 },
    billAmount: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.danger },
    billPayBtn: { backgroundColor: colors.primaryRed, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 52, alignItems: 'center' },
    billPayBtnText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    invoiceTotal: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.danger, textAlign: 'center', marginBottom: 10 },
    walletBalance: { fontSize: 34, fontFamily: fonts.displayBlack, color: colors.success, textAlign: 'center', marginBottom: 6 },
    walletHint: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', lineHeight: 17, marginBottom: 18 },
    planRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 14,
      marginTop: 10,
    },
    planTitle: { fontSize: 14.5, fontFamily: fonts.bodyBold, color: colors.text },
    planMeta: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    viewCodesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 16, marginTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
    viewCodesText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint },
    codeListRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    codeText: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    codeMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    codeDeleteBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: `${colors.danger}12`, alignItems: 'center', justifyContent: 'center' },
    generateRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    generateBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.primaryRed,
      borderRadius: 12,
      paddingVertical: 11,
    },
    generateBtnText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    paymentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    paymentDate: { flex: 1, fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    paymentType: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text, textAlign: 'center' },
    paymentAmount: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'right' },
    listItemName: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    joinMeetingBtn: { backgroundColor: colors.primaryRed, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    joinMeetingBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    dateStepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background, borderRadius: 12, padding: 10, marginBottom: 8 },
    dateStepBtn: { paddingHorizontal: 10, paddingVertical: 6 },
    dateStepBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    dateStepValue: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    fieldLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 4, marginBottom: 6 },
  });
}

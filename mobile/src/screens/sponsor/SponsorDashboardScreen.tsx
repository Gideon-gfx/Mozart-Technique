import { FlatList, ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { openBrowser } from '../../utils/openBrowser';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, API_BASE_URL, resolveMediaUrl } from '../../api/client';
import * as organizationsApi from '../../api/organizations';
import type { LessonBill, MySponsorOrg, SponsorCodeEntry } from '../../api/organizations';
import Avatar from '../../components/Avatar';
import GlassSurface from '../../components/GlassSurface';
import NotificationBell from '../../components/NotificationBell';
import CountryFlag from '../../components/CountryFlag';
import ExternalLinkRow from '../../components/ExternalLinkRow';
import LiveClock from '../../components/LiveClock';
import PaymentResultModal from '../../components/PaymentResultModal';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { SponsorTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<SponsorTabParamList, 'Sponsor'>;

// Same copy as become-sponsor.html's own statusText object.
const STATUS_TEXT: Record<string, string> = {
  pending: 'Your application is awaiting admin review.',
  approved: 'Your application has been approved.',
  rejected: 'Your application was not approved this time. Please reapply with updated information.',
};

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// There's no gender field anywhere on the account to derive Mr./Mrs. from,
// so the salutation is self-declared instead of inferred - covers titles
// beyond a binary Mr./Mrs. too (Dr., Chief, etc.).
const TITLE_OPTIONS = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Chief', 'Rev.'];

// The Sponsor tab's own dashboard - mirrors become-sponsor.html's "already
// applied" panel, for the account that owns the organization (Individual
// Sponsor or NGO/Institution). Tab-root styled like every other mode's home
// screen (no back arrow - this is a full mode switch, reached via
// RoleModeContext's switchToSponsor, not a pushed screen).
export default function SponsorDashboardScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { toast } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<MySponsorOrg | null>(null);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [titlePickerOpen, setTitlePickerOpen] = useState(false);
  const [bills, setBills] = useState<LessonBill[]>([]);
  const [billsOpen, setBillsOpen] = useState(false);
  const [payingKey, setPayingKey] = useState<string | null>(null);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  const [allCodes, setAllCodes] = useState<SponsorCodeEntry[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<{ status: 'success' | 'error'; title: string; message: string } | null>(null);

  const load = useCallback(() => {
    return Promise.all([
      organizationsApi.fetchMySponsorOrg(),
      organizationsApi.fetchLessonBills().catch(() => ({ bills: [] as LessonBill[] })),
    ])
      .then(([data, billsData]) => {
        setOrg(data.organization);
        setSubscriptionActive(data.subscriptionActive);
        setBills(billsData.bills);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your sponsorship.'));
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function generateCode() {
    setGenerating(true);
    try {
      const result = await organizationsApi.generateSponsorCode();
      toast(`New code: ${result.entry.code}`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not generate a code.', 'error');
    } finally {
      setGenerating(false);
    }
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
      // The wallet sheet closes right above, and nothing else on this
      // screen shows a loading state once it does - without this, someone
      // tapping a top-up amount saw the sheet vanish and then nothing at
      // all until the checkout browser actually finished opening, which
      // reads as the app having silently hung rather than as it working.
      toast('Opening secure checkout…');
      await openBrowser(url);
      // The success_url redirect that normally credits the wallet doesn't
      // always reach this server (e.g. over a local/LAN dev connection) -
      // verify directly with Stripe once the browser closes so a real
      // payment never goes uncredited just because that redirect missed.
      // Either way, the checkout happened in a separate browser the user
      // just came back from, so give an explicit result here rather than a
      // toast that's easy to miss right as focus returns to the app.
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

  function openCodes() {
    setCodesOpen(true);
    setCodesLoading(true);
    organizationsApi
      .fetchSponsorCodes()
      .then((data) => setAllCodes(data.students))
      .catch(() => toast('Could not load your codes.', 'error'))
      .finally(() => setCodesLoading(false));
  }

  async function removeCode(code: string) {
    setDeletingCode(code);
    try {
      await organizationsApi.deleteSponsorCode(code);
      setAllCodes((prev) => prev.filter((c) => c.code !== code));
      toast('Code deleted.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete that code.', 'error');
    } finally {
      setDeletingCode(null);
    }
  }

  async function saveTitle(sponsorTitle: string) {
    setTitlePickerOpen(false);
    if (!org || org.status !== 'approved') {
      toast('Your organization must be approved before you can set a title.', 'error');
      return;
    }
    try {
      const result = await organizationsApi.setSponsorTitle(sponsorTitle);
      setOrg(result.organization);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save that title.', 'error');
    }
  }

  const greeting = greetingForHour(new Date().getHours());
  const fullName = org ? [org.sponsorTitle, org.contactName].filter(Boolean).join(' ') : user?.name || '';

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View style={styles.header}>
        <GlassSurface clear pointerEvents="none" style={[StyleSheet.absoluteFill, styles.headerGlass]} />
        <View style={styles.headerLeft}>
          {org?.name ? <Avatar name={org.name} photoUrl={resolveMediaUrl(org.logoUrl)} size={32} viewable={false} /> : null}
          <View>
            <Text style={styles.navTitle} numberOfLines={1}>{org?.name || 'Sponsor'}</Text>
            {/* Always plain "Sponsor" here regardless of sponsorType/
                organizationType - that distinction belongs on the separate
                Organization Dashboard (NGO/Institution's own mode, with its
                own tabs), not on this generic screen every org owner gets. */}
            {org ? <Text style={styles.navSubtitle}>Sponsor</Text> : null}
          </View>
          <CountryFlag />
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
          <Text style={styles.errorText}>{error || 'No sponsorship application found.'}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryRed} />}
        >
          <View style={styles.greetingRow}>
            <View style={{ flex: 1 }}>
              <Pressable style={styles.nameTouchable} onPress={() => setTitlePickerOpen(true)} hitSlop={6}>
                <Text style={styles.greeting} numberOfLines={1}>{greeting}, {fullName || 'Sponsor'}!</Text>
                <Ionicons name="pencil" size={12} color={colors.textFaint} />
              </Pressable>
              {subscriptionActive ? (
                <View style={styles.goldBadge}>
                  <Ionicons name="ribbon" size={12} color="#8A6200" />
                  <Text style={styles.goldBadgeText}>
                    Active{org.subscriptionEndAt ? ` · ${new Date(org.subscriptionEndAt).toLocaleDateString()}` : ''}
                  </Text>
                </View>
              ) : null}
            </View>
            <LiveClock colors={colors} />
          </View>

          {org.status === 'approved' ? (
            <View style={styles.billingRow}>
              <Pressable style={styles.billingCard} onPress={() => setBillsOpen(true)}>
                <View style={[styles.billingIcon, { backgroundColor: `${colors.danger}14` }]}>
                  <Ionicons name="receipt" size={20} color={colors.danger} />
                </View>
                <Text style={styles.billingLabel}>Billing</Text>
                <Text style={[styles.billingValue, { color: colors.danger }]} numberOfLines={1}>
                  ${bills.reduce((sum, b) => sum + b.totalUsd, 0).toFixed(2)}
                </Text>
                <Text style={styles.billingHint} numberOfLines={1}>
                  {bills.length ? `${bills.length} lesson${bills.length === 1 ? '' : 's'} due` : 'All caught up'}
                </Text>
              </Pressable>
              <Pressable style={styles.billingCard} onPress={() => setSubscriptionOpen(true)}>
                <View style={[styles.billingIcon, { backgroundColor: `${colors.success}14` }]}>
                  <Ionicons name="wallet" size={20} color={colors.success} />
                </View>
                <Text style={styles.billingLabel}>Subscription</Text>
                <Text style={[styles.billingValue, { color: colors.success }]} numberOfLines={1}>${org.walletBalanceUsd.toFixed(2)}</Text>
                <Text style={styles.billingHint} numberOfLines={1}>Tap to load money</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.statusText}>{STATUS_TEXT[org.status]}</Text>

          {org.status === 'rejected' ? (
            <ExternalLinkRow url={`${API_BASE_URL}/become-sponsor`} style={styles.reapplyBtn}>
              <Text style={styles.reapplyBtnText}>Reapply</Text>
            </ExternalLinkRow>
          ) : null}

          {org.status === 'approved' && !subscriptionActive ? (
            <View style={styles.noticeCardWarn}>
              <Ionicons name="information-circle" size={16} color={colors.statusPendingText} />
              <Text style={styles.noticeTextWarn}>
                Your application is approved. Reach out to the Mozart Techniques team to arrange your annual subscription payment - an admin activates it on your account once payment is confirmed, and you&apos;ll be able to generate student access codes right away.
              </Text>
            </View>
          ) : null}

          {subscriptionActive ? (
            <>
              <Text style={styles.sectionTitle}>Quick actions</Text>
              <View style={styles.actionsGrid}>
                <Pressable style={styles.actionCard} onPress={generateCode} disabled={generating}>
                  <View style={styles.actionIcon}>
                    {generating ? <ActivityIndicator size="small" color={colors.primaryRed} /> : <Ionicons name="key" size={19} color={colors.primaryRed} />}
                  </View>
                  <Text style={styles.actionTitle}>Generate Code</Text>
                  <Text style={styles.actionSubtitle}>New student access code</Text>
                </Pressable>
                <Pressable style={styles.actionCard} onPress={openCodes}>
                  <View style={styles.actionIcon}>
                    <Ionicons name="list" size={19} color={colors.primaryRed} />
                  </View>
                  <Text style={styles.actionTitle}>View All Codes</Text>
                  <Text style={styles.actionSubtitle}>Status & delete</Text>
                </Pressable>
                <Pressable style={styles.actionCard} onPress={() => navigation.getParent()?.navigate('AssignTutor')}>
                  <View style={styles.actionIcon}>
                    <Ionicons name="people" size={19} color={colors.primaryRed} />
                  </View>
                  <Text style={styles.actionTitle}>Assign a Tutor</Text>
                  <Text style={styles.actionSubtitle}>Match a student</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>
      )}

      <TitlePickerSheet
        visible={titlePickerOpen}
        onClose={() => setTitlePickerOpen(false)}
        current={org?.sponsorTitle || ''}
        onSave={saveTitle}
        colors={colors}
      />
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
        colors={colors}
      />
      <CodesSheet
        visible={codesOpen}
        onClose={() => setCodesOpen(false)}
        codes={allCodes}
        loading={codesLoading}
        deletingCode={deletingCode}
        onDelete={removeCode}
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
            <Text style={styles.billsEmptyText}>No lesson bills due right now - every sponsored lesson has been paid.</Text>
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

const TOPUP_AMOUNTS = [25, 50, 100, 250];

// The "bank" a sponsor loads money into - a covered lesson draws from this
// balance automatically the instant it's logged (see server.js's auto-debit
// in POST /api/assignments/:id/sessions), no manual per-lesson checkout
// needed while it lasts. The admin-facing platform subscription (the flat
// fee that earns the golden "Active" badge) is a separate, secondary
// action further down - most sponsors will only ever touch the wallet here.
function SubscriptionSheet({
  visible,
  onClose,
  org,
  subscribing,
  onSubscribe,
  toppingUp,
  onTopUp,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  org: MySponsorOrg | null;
  subscribing: boolean;
  onSubscribe: (period: 'monthly' | 'yearly') => void;
  toppingUp: boolean;
  onTopUp: (amountUsd: number) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [customAmount, setCustomAmount] = useState('');
  const [renewOpen, setRenewOpen] = useState(false);
  // Set the instant "Load" is tapped, not the instant a preset chip is -
  // tapping a chip only fills the field below now, same as typing a custom
  // amount; either way, nothing actually charges until this confirm card's
  // own "Proceed" is tapped.
  const [confirmAmount, setConfirmAmount] = useState<number | null>(null);
  const amountReady = Boolean(org && org.monthlyAmountLocal > 0);

  useEffect(() => {
    if (visible) {
      setCustomAmount('');
      setRenewOpen(false);
      setConfirmAmount(null);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Your wallet</Text>
          <Text style={styles.walletBalance}>${org?.walletBalanceUsd.toFixed(2) ?? '0.00'}</Text>
          <Text style={styles.walletHint}>Lesson bills for your sponsored students are paid from this balance automatically as they happen.</Text>

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

          <Pressable style={styles.renewToggle} onPress={() => setRenewOpen((v) => !v)}>
            <Text style={styles.renewToggleText}>Renew platform subscription</Text>
            <Ionicons name={renewOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} />
          </Pressable>
          {renewOpen ? (
            !amountReady ? (
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
            )
          ) : null}
        </Pressable>
      </Pressable>
      <Modal visible={confirmAmount != null} transparent animationType="fade" onRequestClose={() => setConfirmAmount(null)}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Load ${confirmAmount?.toFixed(2)}?</Text>
            <Text style={styles.confirmMessage}>You&apos;ll be taken to secure checkout to complete this payment. Your wallet balance updates once it&apos;s confirmed.</Text>
            <View style={styles.confirmRow}>
              <Pressable style={styles.confirmBtn} onPress={() => setConfirmAmount(null)}>
                <Text style={styles.confirmBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnPrimary]}
                onPress={() => { const amount = confirmAmount; setConfirmAmount(null); if (amount) onTopUp(amount); }}
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

function CodesSheet({
  visible,
  onClose,
  codes,
  loading,
  deletingCode,
  onDelete,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  codes: SponsorCodeEntry[];
  loading: boolean;
  deletingCode: string | null;
  onDelete: (code: string) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>All codes</Text>
          {loading ? (
            <ActivityIndicator color={colors.primaryRed} style={{ paddingVertical: 20 }} />
          ) : codes.length === 0 ? (
            <Text style={styles.billsEmptyText}>No codes generated yet.</Text>
          ) : (
            <FlatList
              style={{ maxHeight: 400 }}
              data={[...codes].reverse()}
              keyExtractor={(c) => c.code}
              renderItem={({ item }) => (
                <View style={styles.codeListRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.codeText}>{item.code}</Text>
                    <Text style={styles.codeMeta}>
                      {item.redeemedAt ? item.redeemedName || item.studentName || 'Redeemed' : 'Unused'} · {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={[styles.codeStatusPill, item.redeemedAt ? styles.codeStatusRedeemed : styles.codeStatusUnused]}>
                    <Text style={[styles.codeStatusText, item.redeemedAt ? styles.codeStatusTextRedeemed : styles.codeStatusTextUnused]}>
                      {item.redeemedAt ? 'Redeemed' : 'Unused'}
                    </Text>
                  </View>
                  <Pressable style={styles.codeDeleteBtn} onPress={() => onDelete(item.code)} disabled={deletingCode === item.code} hitSlop={6}>
                    {deletingCode === item.code ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="trash" size={16} color={colors.danger} />}
                  </Pressable>
                </View>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TitlePickerSheet({
  visible,
  onClose,
  current,
  onSave,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  current: string;
  onSave: (title: string) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [custom, setCustom] = useState(current);

  useEffect(() => {
    if (visible) setCustom(current);
  }, [visible, current]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Choose your title</Text>
          <View style={styles.titleOptionsWrap}>
            {TITLE_OPTIONS.map((option) => (
              <Pressable
                key={option}
                style={[styles.titleChip, current === option && styles.titleChipActive]}
                onPress={() => onSave(option)}
              >
                <Text style={[styles.titleChipText, current === option && styles.titleChipTextActive]}>{option}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.customLabel}>Or enter your own</Text>
          <View style={styles.customRow}>
            <TextInput
              style={styles.customInput}
              value={custom}
              onChangeText={setCustom}
              placeholder="e.g. Alhaji, Barrister..."
              placeholderTextColor={colors.textFaint}
            />
            <Pressable style={styles.customSaveBtn} onPress={() => onSave(custom.trim())}>
              <Text style={styles.customSaveBtnText}>Save</Text>
            </Pressable>
          </View>
          {current ? (
            <Pressable style={styles.clearBtn} onPress={() => onSave('')}>
              <Text style={styles.clearBtnText}>Remove title</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
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
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    iconButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    navTitle: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text },
    navSubtitle: { fontSize: 10.5, fontFamily: fonts.bodySemiBold, color: colors.primaryRed, marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.4 },
    nameTouchable: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    goldBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      alignSelf: 'flex-start',
      backgroundColor: '#F5D889',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginTop: 8,
    },
    goldBadgeText: { fontSize: 11, fontFamily: fonts.bodyBold, color: '#8A6200' },
    billingRow: { flexDirection: 'row', gap: 12, marginTop: 18, marginBottom: 20 },
    billingCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      padding: 16,
    },
    billingIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: `${colors.primaryRed}12`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    billingLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.4 },
    billingValue: { fontSize: 18, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 4 },
    billingHint: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 3 },
    greetingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    greeting: { fontSize: 22, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 4, flexShrink: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
    statusText: { fontSize: 14, fontFamily: fonts.body, color: colors.textSoft, lineHeight: 20, marginBottom: 16 },
    reapplyBtn: { alignSelf: 'flex-start', backgroundColor: colors.primaryRed, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, marginBottom: 16 },
    reapplyBtnText: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    noticeCardWarn: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.statusPendingBg,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
    },
    noticeTextWarn: { flex: 1, fontSize: 12.5, fontFamily: fonts.body, color: colors.statusPendingText, lineHeight: 18 },
    sectionTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 12 },
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
    titleChipActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    titleChipText: { fontSize: 13, fontFamily: fonts.bodyMedium, color: colors.text },
    titleChipTextActive: { color: colors.onPrimary },
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
    clearBtn: { alignItems: 'center', paddingTop: 16 },
    clearBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.danger },
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
    confirmBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 24 },
    confirmCard: { width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
    confirmTitle: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, textAlign: 'center' },
    confirmMessage: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', marginTop: 8, lineHeight: 18 },
    confirmRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
    confirmBtn: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' },
    confirmBtnPrimary: { backgroundColor: colors.primaryRed, borderWidth: 0 },
    confirmBtnText: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    confirmBtnTextPrimary: { color: colors.onPrimary },
    renewToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 14,
      marginTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    renewToggleText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint },
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
    codeStatusPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    codeStatusRedeemed: { backgroundColor: colors.statusActiveBg },
    codeStatusUnused: { backgroundColor: colors.background },
    codeStatusText: { fontSize: 10.5, fontFamily: fonts.bodyBold },
    codeStatusTextRedeemed: { color: colors.statusActiveText },
    codeStatusTextUnused: { color: colors.textFaint },
    codeDeleteBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: `${colors.danger}12`, alignItems: 'center', justifyContent: 'center' },
  });
}

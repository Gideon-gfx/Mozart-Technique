import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { openBrowser } from '../../utils/openBrowser';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../../api/client';
import * as performersApi from '../../api/performers';
import type { MarketplaceOffer, MyPerformerProfile } from '../../api/performers';
import PerformerHeader from '../../components/PerformerHeader';
import PrimaryButton from '../../components/PrimaryButton';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { PerformerTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<PerformerTabParamList, 'Requests'>;

const STATUS_META: Record<MarketplaceOffer['status'], { label: string; bg: (c: ThemeColors) => string; text: (c: ThemeColors) => string }> = {
  invited: { label: 'New invite', bg: (c) => c.statusPendingBg, text: (c) => c.statusPendingText },
  accepted: { label: 'Accepted - awaiting selection', bg: (c) => `${c.success}18`, text: (c) => c.success },
  countered: { label: 'Countered - awaiting response', bg: (c) => `${c.primaryRed}14`, text: (c) => c.primaryRed },
  declined: { label: 'Declined', bg: (c) => c.background, text: (c) => c.textFaint },
  expired: { label: 'Expired', bg: (c) => c.background, text: (c) => c.textFaint },
  selected: { label: 'Selected!', bg: (c) => c.statusActiveBg, text: (c) => c.statusActiveText },
  not_selected: { label: 'Not selected', bg: (c) => c.background, text: (c) => c.textFaint },
};

// Mirrors performer.html's Requests tab: the 5-state activation gate
// (pending/rejected/suspended never reach this mode at all - Profile only
// shows the "Performer" row once performerStatus === 'approved', same
// pattern as isApprovedTutor - so the only gate left to handle here is
// "approved but hasn't paid the one-time activation fee yet"), then the
// real marketplace offers inbox with accept/counter/decline.
export default function PerformerRequestsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<MyPerformerProfile | null>(null);
  const [offers, setOffers] = useState<MarketplaceOffer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [counterFor, setCounterFor] = useState<MarketplaceOffer | null>(null);

  const load = useCallback(async () => {
    try {
      const profileRes = await performersApi.fetchMyPerformerProfile();
      setProfile(profileRes.profile);
      if (profileRes.profile?.activationPaid && !profileRes.profile.suspended) {
        const offersRes = await performersApi.fetchMyOffers();
        setOffers(offersRes.offers);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your requests.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  // Gates this tab behind the mandatory Performer Orientation modal the
  // first time it's reachable - re-checked on every focus, not just once on
  // mount. Requests is a direct tab screen (not nested in its own stack the
  // way Store is), so one getParent() hop reaches MainStack, where
  // PerformerOrientation is registered.
  useFocusEffect(useCallback(() => {
    if (user?.needsPerformerOrientation) {
      navigation.getParent()?.navigate('PerformerOrientation');
    }
  }, [user?.needsPerformerOrientation, navigation]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function activate() {
    setActivating(true);
    try {
      const { url } = await performersApi.startPerformerActivationCheckout();
      await openBrowser(url);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not start checkout.', 'error');
    } finally {
      setActivating(false);
    }
  }

  async function accept(offer: MarketplaceOffer) {
    setBusyId(offer.id);
    try {
      await performersApi.acceptOffer(offer.id);
      toast('Invite accepted.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not accept that invite.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function decline(offer: MarketplaceOffer) {
    setBusyId(offer.id);
    try {
      await performersApi.declineOffer(offer.id);
      toast('Invite declined.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not decline that invite.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function submitCounter(amountUsd: number, note: string) {
    if (!counterFor) return;
    setBusyId(counterFor.id);
    try {
      await performersApi.counterOffer(counterFor.id, amountUsd, note || undefined);
      toast('Counter-offer sent.', 'success');
      setCounterFor(null);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send that counter-offer.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function openEventAttachment(url: string) {
    const destination = resolveMediaUrl(url);
    if (!destination) return;
    try {
      await Linking.openURL(destination);
    } catch {
      toast('That event attachment could not be opened.', 'error');
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
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !profile?.activationPaid || profile.suspended ? (
        <View style={styles.content}>
          {profile?.suspended ? (
            <View style={styles.gateCard}>
              <Ionicons name="alert-circle" size={22} color={colors.danger} />
              <Text style={styles.gateTitle}>Your account is suspended</Text>
              <Text style={styles.gateBody}>{profile.suspendedReason || 'Contact support for more information.'}</Text>
            </View>
          ) : (
            <View style={styles.gateCard}>
              <Ionicons name="ribbon-outline" size={22} color={colors.primaryRed} />
              <Text style={styles.gateTitle}>One more step</Text>
              <Text style={styles.gateBody}>A one-time $1.50 activation fee unlocks your Requests inbox and lets clients invite you to events.</Text>
              <PrimaryButton title="Pay activation fee" onPress={activate} loading={activating} style={{ marginTop: 14, alignSelf: 'stretch' }} />
            </View>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryRed} />}
        >
          <View style={styles.requestsHero}>
            <View style={styles.requestsHeroIcon}><Ionicons name="briefcase-outline" size={23} color={colors.primaryRed} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.requestsHeroTitle}>Your booking requests</Text>
              <Text style={styles.requestsHeroBody}>Review nearby event invitations, negotiate your fee, and track selections here.</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCard}><Text style={styles.statNumber}>{offers.filter((offer) => offer.status === 'invited').length}</Text><Text style={styles.statLabel}>New</Text></View>
            <View style={styles.statCard}><Text style={styles.statNumber}>{offers.filter((offer) => offer.status === 'accepted' || offer.status === 'countered').length}</Text><Text style={styles.statLabel}>In progress</Text></View>
            <View style={styles.statCard}><Text style={styles.statNumber}>{offers.filter((offer) => offer.status === 'selected').length}</Text><Text style={styles.statLabel}>Booked</Text></View>
          </View>
          {offers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="sparkles-outline" size={26} color={colors.primaryRed} />
              <Text style={styles.emptyTitle}>Your inbox is ready</Text>
              <Text style={styles.emptyText}>Clients will invite you when your categories and location match their event. Keep your profile, media, and prices up to date so they can choose confidently.</Text>
              <View style={styles.stepsRow}>
                <View style={styles.step}><Text style={styles.stepNumber}>1</Text><Text style={styles.stepText}>Receive</Text></View>
                <Ionicons name="arrow-forward" size={14} color={colors.textFaint} />
                <View style={styles.step}><Text style={styles.stepNumber}>2</Text><Text style={styles.stepText}>Respond</Text></View>
                <Ionicons name="arrow-forward" size={14} color={colors.textFaint} />
                <View style={styles.step}><Text style={styles.stepNumber}>3</Text><Text style={styles.stepText}>Get booked</Text></View>
              </View>
            </View>
          ) : (
            offers.map((offer, i) => {
              const meta = STATUS_META[offer.status];
              const req = offer.request;
              return (
                <View key={offer.id} style={[styles.card, i > 0 && { marginTop: 10 }]}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{req?.eventType || 'Event'} · {req?.performerCategory || ''}</Text>
                    <View style={[styles.badge, { backgroundColor: meta.bg(colors) }]}>
                      <Text style={[styles.badgeText, { color: meta.text(colors) }]}>{meta.label}</Text>
                    </View>
                  </View>
                  {req ? <Text style={styles.cardMeta}>{req.eventDate ? new Date(req.eventDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'} · {req.eventDurationHours || 'TBD'}h</Text> : null}
                  {req?.eventLocation ? <Text style={styles.cardMeta}>{req.eventLocation}{offer.distanceKm != null ? ` · ${offer.distanceKm}km away` : ''}</Text> : null}
                  {req?.notes ? <Text style={styles.requestDescription}>{req.notes}</Text> : <Text style={styles.cardMeta}>No additional event description provided.</Text>}
                  {req?.eventMedia?.length ? (
                    <View style={styles.attachmentsRow}>
                      {req.eventMedia.map((item, index) => (
                        <Pressable key={`${item.url}-${index}`} style={styles.attachmentButton} onPress={() => openEventAttachment(item.url)}>
                          <Ionicons name={item.type === 'image' ? 'image-outline' : item.type === 'video' ? 'videocam-outline' : 'link-outline'} size={14} color={colors.primaryRed} />
                          <Text style={styles.attachmentText} numberOfLines={1}>{item.name || 'Event attachment'}</Text>
                          <Ionicons name="open-outline" size={13} color={colors.textFaint} />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <Text style={styles.amount}>${offer.proposedAmountUsd.toFixed(2)}</Text>
                  {offer.counterAmountUsd != null ? (
                    <Text style={styles.cardMeta}>Your counter: ${offer.counterAmountUsd.toFixed(2)}{offer.counterNote ? ` - "${offer.counterNote}"` : ''}</Text>
                  ) : null}
                  {offer.status === 'invited' ? (
                    <View style={styles.actionsRow}>
                      <Pressable style={styles.acceptBtn} onPress={() => accept(offer)} disabled={busyId === offer.id}>
                        {busyId === offer.id ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Text style={styles.acceptBtnText}>Accept</Text>}
                      </Pressable>
                      <Pressable style={styles.counterBtn} onPress={() => setCounterFor(offer)} disabled={busyId === offer.id}>
                        <Text style={styles.counterBtnText}>Counter</Text>
                      </Pressable>
                      <Pressable style={styles.declineBtn} onPress={() => decline(offer)} disabled={busyId === offer.id}>
                        <Text style={styles.declineBtnText}>Decline</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <CounterOfferModal visible={!!counterFor} onClose={() => setCounterFor(null)} onSubmit={submitCounter} colors={colors} />
    </View>
  );
}

function CounterOfferModal({
  visible,
  onClose,
  onSubmit,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (amountUsd: number, note: string) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Counter offer</Text>
          <Text style={styles.fieldLabel}>Your amount (USD)</Text>
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.textFaint} keyboardType="decimal-pad" />
          <Text style={styles.fieldLabel}>Note (optional)</Text>
          <TextInput style={[styles.input, styles.textarea]} value={note} onChangeText={setNote} placeholder="Explain your counter..." placeholderTextColor={colors.textFaint} multiline />
          <View style={styles.modalActions}>
            <Pressable style={styles.declineBtn} onPress={onClose}>
              <Text style={styles.declineBtnText}>Cancel</Text>
            </Pressable>
            <PrimaryButton
              title="Send counter"
              onPress={() => {
                if (!Number(amount) || Number(amount) <= 0) return;
                onSubmit(Number(amount), note.trim());
                setAmount('');
                setNote('');
              }}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    content: { padding: 20, paddingBottom: 40 },
    requestsHero: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: `${colors.primaryRed}0d`, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: `${colors.primaryRed}24` },
    requestsHeroIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    requestsHeroTitle: { fontSize: 15, fontFamily: fonts.displayBlack, color: colors.text },
    requestsHeroBody: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textSoft, marginTop: 3, lineHeight: 16 },
    statsRow: { flexDirection: 'row', gap: 9, marginTop: 12, marginBottom: 4 },
    statCard: { flex: 1, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingVertical: 11, alignItems: 'center' },
    statNumber: { fontSize: 18, fontFamily: fonts.displayBlack, color: colors.primaryRed },
    statLabel: { fontSize: 10.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 2 },
    emptyCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 22, marginTop: 18 },
    emptyTitle: { fontSize: 15, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 10 },
    emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', marginTop: 7, lineHeight: 19 },
    stepsRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18 },
    step: { alignItems: 'center', gap: 4 },
    stepNumber: { width: 23, height: 23, borderRadius: 12, overflow: 'hidden', textAlign: 'center', lineHeight: 23, backgroundColor: `${colors.primaryRed}14`, fontSize: 11, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    stepText: { fontSize: 10.5, fontFamily: fonts.bodySemiBold, color: colors.textSoft },
    gateCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 20, alignItems: 'center', marginTop: 20 },
    gateTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 10 },
    gateBody: { fontSize: 13, fontFamily: fonts.body, color: colors.textSoft, textAlign: 'center', marginTop: 6, lineHeight: 19 },
    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
    cardTitle: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text, flexShrink: 1 },
    cardMeta: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 3 },
    requestDescription: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textSoft, marginTop: 8, lineHeight: 18 },
    attachmentsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
    attachmentButton: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 7 },
    attachmentText: { maxWidth: 150, fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textSoft },
    amount: { fontSize: 18, fontFamily: fonts.displayBlack, color: colors.primaryRed, marginTop: 8 },
    badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    badgeText: { fontSize: 10, fontFamily: fonts.bodyBold },
    actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    acceptBtn: { flex: 1, backgroundColor: colors.success, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    acceptBtnText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: '#fff' },
    counterBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    counterBtnText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text },
    declineBtn: { flex: 1, backgroundColor: `${colors.danger}12`, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    declineBtnText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.danger },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    modalCard: { width: '100%', backgroundColor: colors.surface, borderRadius: 18, padding: 18 },
    modalTitle: { fontSize: 15.5, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 4 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    fieldLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 10, marginBottom: 6 },
    input: {
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
    textarea: { minHeight: 60, textAlignVertical: 'top' },
  });
}

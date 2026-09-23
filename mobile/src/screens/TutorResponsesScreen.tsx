import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import * as tutorsApi from '../api/tutors';
import type { MyTutorRequest, TutorOffer } from '../api/tutors';
import Avatar from '../components/Avatar';
import BackButton from '../components/BackButton';
import PrimaryButton from '../components/PrimaryButton';
import { useToast } from '../context/ToastContext';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'TutorResponses'>;

const OFFER_META: Record<TutorOffer['status'], { label: string; tone: 'pending' | 'good' | 'warn' | 'muted' }> = {
  invited: { label: 'Awaiting response', tone: 'pending' },
  accepted: { label: 'Accepted', tone: 'good' },
  countered: { label: 'Counter offer', tone: 'warn' },
  declined: { label: 'Declined', tone: 'muted' },
  expired: { label: 'Expired', tone: 'muted' },
  selected: { label: 'Selected', tone: 'good' },
  not_selected: { label: 'Not selected', tone: 'muted' },
};

// InDrive-style negotiate flow, student side: mirrors find-tutor.html's
// "Tutor Responses" panel - real /api/tutor-requests/mine data, real
// /api/tutor-requests/:id/select action. Every matching tutor responds
// independently (accept at the suggested rate, counter with their own, or
// decline); the student reviews every response here and picks one.
export default function TutorResponsesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { toast, confirm } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [requests, setRequests] = useState<MyTutorRequest[]>([]);
  const [symbol, setSymbol] = useState('$');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    tutorsApi
      .fetchMyTutorRequests()
      .then((data) => { setRequests(data.requests); setSymbol(data.symbol); setError(null); })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your requests.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function pickOffer(requestId: number, offer: TutorOffer) {
    const ok = await confirm({
      title: `Pick ${offer.tutorName}?`,
      message: `This confirms ${offer.tutorName} as your tutor for this request. Other tutors will be notified they weren't selected.`,
      confirmLabel: 'Confirm',
    });
    if (!ok) return;
    setSelecting(offer.id);
    try {
      await tutorsApi.selectTutorOffer(requestId, offer.id);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not select that tutor. Try again in a moment.', 'error');
    } finally {
      setSelecting(null);
    }
  }

  async function deleteRequest(requestId: number) {
    const ok = await confirm({
      title: 'Delete this request?',
      message: 'This withdraws it and notifies any tutors who already responded. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(requestId);
    try {
      await tutorsApi.deleteTutorRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete that request. Try again in a moment.', 'error');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Tutor responses</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="chatbubbles-outline" size={26} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>No open requests</Text>
          <Text style={styles.emptyBody}>Use "Not sure who to pick?" on Find a Tutor to broadcast a request to matching tutors.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {requests.map((request) => {
            const respondedCount = request.offers.filter((o) => o.status !== 'invited' && o.status !== 'expired').length;
            return (
              <View key={request.id} style={styles.requestBlock}>
                <View style={styles.requestHeader}>
                  <View>
                    <Text style={styles.requestTitle}>{request.category}</Text>
                    <Text style={styles.requestSub}>{request.lessonType} · {new Date(request.createdAt).toLocaleDateString()}</Text>
                  </View>
                  <View style={styles.requestHeaderActions}>
                    <View style={styles.respondedPill}>
                      <Text style={styles.respondedPillText}>{respondedCount} responded</Text>
                    </View>
                    {request.status === 'pending' ? (
                      <Pressable
                        style={styles.deleteRequestBtn}
                        onPress={() => deleteRequest(request.id)}
                        disabled={deleting === request.id}
                        accessibilityRole="button"
                        accessibilityLabel="Delete this request"
                        hitSlop={8}
                      >
                        {deleting === request.id ? (
                          <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                          <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {request.offers.length === 0 ? (
                  <Text style={styles.noOffersText}>No tutors matched yet - check back soon.</Text>
                ) : (
                  request.offers.map((offer) => {
                    const meta = OFFER_META[offer.status];
                    const canSelect = request.status === 'pending' && (offer.status === 'accepted' || offer.status === 'countered');
                    return (
                      <View key={offer.id} style={styles.offerCard}>
                        <View style={styles.offerTopRow}>
                          <Avatar name={offer.tutorName} photoUrl={offer.tutorPhotoUrl} size={44} />
                          <View style={styles.offerInfo}>
                            <Text style={styles.offerName}>{offer.tutorName}</Text>
                            {offer.avgRating ? <Text style={styles.offerRating}>★ {offer.avgRating.toFixed(1)}</Text> : null}
                          </View>
                          <View style={[styles.statusBadge, styles[`statusBadge_${meta.tone}` as const]]}>
                            <Text style={[styles.statusBadgeText, styles[`statusBadgeText_${meta.tone}` as const]]}>{meta.label}</Text>
                          </View>
                        </View>
                        {offer.amountLocal != null ? (
                          <Text style={styles.offerAmount}>
                            {offer.status === 'countered' ? 'Counter-offered' : 'Rate'}: {symbol}{offer.amountLocal}/hr
                          </Text>
                        ) : null}
                        {offer.counterNote ? <Text style={styles.offerNote}>&ldquo;{offer.counterNote}&rdquo;</Text> : null}
                        {canSelect ? (
                          <PrimaryButton
                            title={selecting === offer.id ? 'Selecting…' : 'Select this tutor'}
                            onPress={() => pickOffer(request.id, offer)}
                            loading={selecting === offer.id}
                            style={styles.selectBtn}
                          />
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
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
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 8 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    emptyTitle: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text, marginTop: 4 },
    emptyBody: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center' },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    requestBlock: { marginBottom: 26 },
    requestHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    requestTitle: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text },
    requestSub: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2, textTransform: 'capitalize' },
    requestHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    respondedPill: { backgroundColor: `${colors.primaryRed}17`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    respondedPillText: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    deleteRequestBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.danger}17` },
    noOffersText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    offerCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
    },
    offerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    offerInfo: { flex: 1 },
    offerName: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    offerRating: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: '#EAB308', marginTop: 2 },
    statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    statusBadgeText: { fontSize: 10.5, fontFamily: fonts.bodyBold },
    statusBadge_pending: { backgroundColor: colors.border },
    statusBadgeText_pending: { color: colors.textSoft },
    statusBadge_good: { backgroundColor: colors.statusActiveBg },
    statusBadgeText_good: { color: colors.statusActiveText },
    statusBadge_warn: { backgroundColor: colors.statusPendingBg },
    statusBadgeText_warn: { color: colors.statusPendingText },
    statusBadge_muted: { backgroundColor: colors.border },
    statusBadgeText_muted: { color: colors.textFaint },
    offerAmount: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text, marginTop: 10 },
    offerNote: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 4, fontStyle: 'italic' },
    selectBtn: { marginTop: 12 },
  });
}

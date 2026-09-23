import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import * as adminApi from '../../api/admin';
import type { AdminPayoutRow } from '../../api/admin';
import { ApiError } from '../../api/client';
import AdminRegionFilter from '../../components/AdminRegionFilter';
import BackButton from '../../components/BackButton';
import { useToast } from '../../context/ToastContext';
import { useAdminIdentity } from '../../hooks/useAdminIdentity';
import type { AdminMoreStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<AdminMoreStackParamList, 'AdminPayouts'>;

export default function AdminPayoutsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const { isPrimary, countryName } = useAdminIdentity();
  const [regions, setRegions] = useState<string | undefined>(undefined);
  const [payouts, setPayouts] = useState<AdminPayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // A real Country Admin's region param is ignored server-side anyway (see
  // resolveRegionFilter) - a Main Admin previewing that view has no such
  // lock, so previewing has to explicitly ask for its own country's slice.
  const effectiveRegions = isPrimary ? regions : countryName || undefined;

  const load = useCallback((r?: string) => {
    return adminApi
      .fetchAdminPayouts(r)
      .then((res) => {
        setPayouts(res.payouts);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load payouts.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(effectiveRegions).finally(() => setLoading(false));
    }, [load, effectiveRegions]),
  );

  async function process(p: AdminPayoutRow) {
    setBusyId(p.id);
    try {
      await adminApi.processPayout(p.id);
      toast('Marked processed.', 'success');
      load(effectiveRegions);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not process that payout.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Tutor Payouts</Text>
        <View style={{ width: 42 }} />
      </View>
      <AdminRegionFilter onChange={setRegions} />
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : payouts.length === 0 ? (
        <Text style={styles.emptyText}>No payout requests.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {payouts.map((p, i) => (
            <View key={p.id} style={[styles.card, i > 0 && { marginTop: 10 }]}>
              <View style={styles.cardTopRow}>
                <Text style={styles.rowTitle}>{p.tutorName}</Text>
                <Text style={styles.amount}>${p.amountUsd.toFixed(2)}</Text>
              </View>
              {p.payoutDetails ? <Text style={styles.rowMeta}>{p.payoutDetails}</Text> : null}
              <Text style={styles.rowMeta}>Requested {new Date(p.requestedAt).toLocaleDateString()} · {p.status}</Text>
              {p.status === 'requested' ? (
                <Pressable style={styles.actionBtn} onPress={() => process(p)} disabled={busyId === p.id}>
                  {busyId === p.id ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Text style={styles.actionBtnText}>Mark processed</Text>}
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, gap: 10 },
    title: { flex: 1, fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center' },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center', marginTop: 20 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', marginTop: 20 },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rowTitle: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    amount: { fontSize: 15, fontFamily: fonts.displayBlack, color: colors.primaryRed },
    rowMeta: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 4 },
    actionBtn: { alignSelf: 'flex-start', backgroundColor: colors.primaryRed, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginTop: 10 },
    actionBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
  });
}

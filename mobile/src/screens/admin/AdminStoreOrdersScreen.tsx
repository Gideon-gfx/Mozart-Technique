import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import * as adminApi from '../../api/admin';
import type { AdminStoreOrder } from '../../api/admin';
import { ApiError } from '../../api/client';
import BackButton from '../../components/BackButton';
import { useToast } from '../../context/ToastContext';
import type { AdminMoreStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<AdminMoreStackParamList, 'AdminStoreOrders'>;

const NEXT_STATUS: Record<string, string> = { paid: 'processing', processing: 'shipped', shipped: 'delivered' };

export default function AdminStoreOrdersScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast, actionSheet } = useToast();
  const [orders, setOrders] = useState<AdminStoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    return adminApi
      .fetchAdminOrders()
      .then((res) => {
        setOrders(res.orders);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load orders.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function updateStatus(order: AdminStoreOrder, status: string) {
    setBusyId(order.id);
    try {
      await adminApi.setOrderStatus(order.id, status);
      toast(`Order marked ${status}.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update that order.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  function changeStatus(order: AdminStoreOrder) {
    actionSheet({
      title: `Order ${order.orderNumber}`,
      actions: ['processing', 'shipped', 'delivered', 'cancelled'].map((status) => ({
        label: status,
        destructive: status === 'cancelled',
        onPress: () => updateStatus(order, status),
      })),
    });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Store Orders</Text>
        <View style={{ width: 42 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : orders.length === 0 ? (
        <Text style={styles.emptyText}>No orders yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {orders.map((o, i) => (
            <Pressable key={o.id} style={[styles.card, i > 0 && { marginTop: 10 }]} onPress={() => changeStatus(o)} disabled={busyId === o.id}>
              <View style={styles.cardTopRow}>
                <Text style={styles.rowTitle}>#{o.orderNumber}</Text>
                <Text style={styles.amount}>${o.totalUsd.toFixed(2)}</Text>
              </View>
              <Text style={styles.rowMeta}>{o.addressSnapshot?.fullName || `User #${o.userId}`} · {o.items.length} item{o.items.length === 1 ? '' : 's'}</Text>
              <View style={styles.bottomRow}>
                <Text style={styles.rowMeta}>{new Date(o.createdAt).toLocaleDateString()}</Text>
                <View style={styles.statusBadge}>
                  {busyId === o.id ? <ActivityIndicator size="small" color={colors.text} /> : <Text style={styles.statusBadgeText}>{o.status}{NEXT_STATUS[o.status] ? ' · tap to update' : ''}</Text>}
                </View>
              </View>
            </Pressable>
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
    bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    statusBadge: { backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    statusBadgeText: { fontSize: 10.5, fontFamily: fonts.bodyBold, color: colors.text, textTransform: 'capitalize' },
  });
}

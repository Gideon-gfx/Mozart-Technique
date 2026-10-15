import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import * as adminApi from '../../api/admin';
import type { AdminMarketplaceRequestRow } from '../../api/admin';
import { ApiError } from '../../api/client';
import BackButton from '../../components/BackButton';
import type { AdminMoreStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<AdminMoreStackParamList, 'AdminMarketplace'>;

// Everything storefront-shaped lives here: performer/event request
// oversight (this screen's own list - matching admin.html's Marketplace
// tab, view-only since matching happens between requester and performer
// directly) plus the two catalog screens, Store Products and Store Orders,
// reached as a level below it instead of sitting as their own More rows.
export default function AdminMarketplaceScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [requests, setRequests] = useState<AdminMarketplaceRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      adminApi
        .fetchAdminMarketplaceRequests()
        .then((res) => setRequests(res.requests))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load marketplace requests.'))
        .finally(() => setLoading(false));
    }, []),
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Marketplace</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.linkRow}>
          <Pressable style={styles.linkCard} onPress={() => navigation.navigate('AdminStoreProducts')}>
            <Ionicons name="cube" size={18} color={colors.primaryRed} />
            <Text style={styles.linkLabel}>Store Products</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
          <Pressable style={styles.linkCard} onPress={() => navigation.navigate('AdminStoreOrders')}>
            <Ionicons name="receipt" size={18} color={colors.primaryRed} />
            <Text style={styles.linkLabel}>Store Orders</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        </View>

        <Text style={styles.sectionHeading}>Marketplace Requests</Text>
        <Text style={styles.emptyText}>Oversight only - performer/event matching happens between requester and performer directly.</Text>
        {loading ? (
          <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : requests.length === 0 ? (
          <Text style={styles.emptyText}>No requests yet.</Text>
        ) : (
          requests.map((r, i) => (
            <View key={r.id} style={[styles.rowCard, i > 0 && { marginTop: 10 }]}>
              <Text style={styles.rowTitle}>{r.requesterName} · {r.eventType}</Text>
              <Text style={styles.rowMeta}>{r.category} · {r.city || 'Unknown'} · {r.status}</Text>
              {r.offerCounts ? (
                <Text style={styles.rowMeta}>{r.offerCounts.accepted} accepted · {r.offerCounts.countered} countered · {r.offerCounts.declined} declined</Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, gap: 10 },
    title: { flex: 1, fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center' },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    linkRow: { gap: 10, marginBottom: 22 },
    linkCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13 },
    linkLabel: { flex: 1, fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    sectionHeading: { fontSize: 15, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 6 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center', marginTop: 20 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginBottom: 10 },
    rowCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 },
    rowTitle: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    rowMeta: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
  });
}

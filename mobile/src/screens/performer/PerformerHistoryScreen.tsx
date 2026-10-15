import { ScrollView } from '../../components/LiquidScroll';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../api/client';
import * as performersApi from '../../api/performers';
import type { MarketplaceOffer } from '../../api/performers';
import BackButton from '../../components/BackButton';
import type { PerformerMoreStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<PerformerMoreStackParamList, 'PerformerHistory'>;

// Mirrors performer.html's History tab exactly - there's no separate
// history endpoint, it's the same /api/marketplace/offers/mine list
// filtered client-side to the ones you were actually selected for.
export default function PerformerHistoryScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<MarketplaceOffer[]>([]);

  const load = useCallback(() => {
    return performersApi
      .fetchMyOffers()
      .then((res) => setOffers(res.offers.filter((o) => o.status === 'selected')))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your history.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>History</Text>
        <View style={{ width: 42 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : offers.length === 0 ? (
        <Text style={styles.emptyText}>No completed gigs yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.timeline}>
            {offers.map((offer) => (
              <View key={offer.id} style={styles.event}>
                <Text style={styles.eventTitle}>{offer.request?.eventType || 'Event'} · {offer.request?.performerCategory || ''}</Text>
                <Text style={styles.eventMeta}>
                  {offer.request?.eventDate ? new Date(offer.request.eventDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                  {offer.request?.eventLocation ? ` · ${offer.request.eventLocation}` : ''}
                </Text>
                <Text style={styles.eventAmount}>${offer.proposedAmountUsd.toFixed(2)}</Text>
              </View>
            ))}
          </View>
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
    timeline: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 16, gap: 18 },
    event: { position: 'relative' },
    eventTitle: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    eventMeta: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    eventAmount: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.primaryRed, marginTop: 4 },
  });
}

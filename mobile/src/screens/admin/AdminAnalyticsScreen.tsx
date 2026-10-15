import { ScrollView } from '../../components/LiquidScroll';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import * as adminApi from '../../api/admin';
import type { AdminAnalytics } from '../../api/admin';
import { ApiError } from '../../api/client';
import AdminHeader from '../../components/AdminHeader';
import AdminRegionFilter from '../../components/AdminRegionFilter';
import RevenueLineChart from '../../components/RevenueLineChart';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useRoleMode } from '../../context/RoleModeContext';
import { useAdminIdentity } from '../../hooks/useAdminIdentity';
import type { AdminTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<AdminTabParamList, 'Analytics'>;

// The admin console's home tab - admin.html's own Analytics panel (stat
// tiles, a real 30-day revenue chart, top subjects, tutor leaderboard).
// Same body for both admin types; the only difference is scope - a Main
// Admin's numbers are platform-wide and region-filterable (AdminRegionFilter),
// a Country Admin's are silently locked server-side to their own country
// (see server.js's resolveRegionFilter) with no filter control shown at all.
export default function AdminAnalyticsScreen({ navigation }: Props) {
  const { switchToStudent } = useRoleMode();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isPrimary, countryName } = useAdminIdentity();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [regions, setRegions] = useState<string | undefined>(undefined);
  // A real Country Admin's region param is ignored server-side anyway (see
  // resolveRegionFilter) - it always locks to their own country. A Main
  // Admin previewing the Country Admin view (useAdminIdentity's
  // adminViewAs) has no such server-side lock, since the server still sees
  // their real, wider permissions - so previewing has to ask for its own
  // country's slice explicitly, the same request AdminRegionFilter would
  // send if they typed it in themselves.
  const effectiveRegions = isPrimary ? regions : countryName || undefined;

  const load = useCallback((r?: string) => {
    return adminApi
      .fetchAdminAnalytics(r)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load analytics.'));
  }, []);

  useEffect(() => {
    setLoading(true);
    load(effectiveRegions).finally(() => setLoading(false));
  }, [load, effectiveRegions]);

  async function onRefresh() {
    setRefreshing(true);
    await load(effectiveRegions);
    setRefreshing(false);
  }

  const maxSubject = Math.max(1, ...(data?.topSubjects || []).map((s) => s.revenueUsd));

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <AdminHeader
        identity
        onBack={() => switchToStudent()}
        onNotifications={() => navigation.getParent()?.navigate('Notifications')}
        onProfile={() => navigation.getParent()?.navigate('Profile')}
      />

      {isPrimary ? <AdminRegionFilter onChange={setRegions} /> : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error || !data ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || 'No data.'}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryRed} />}>
          <View style={styles.statsGrid}>
            <StatTile label="Lesson volume" value={`$${data.stats.totalRevenueUsd.toLocaleString()}`} colors={colors} />
            <StatTile label="Platform revenue (10%)" value={`$${data.stats.platformRevenueUsd.toLocaleString()}`} colors={colors} />
            <StatTile label="Revenue (30d)" value={`$${data.stats.revenue30dUsd.toLocaleString()}`} colors={colors} />
            <StatTile label="Pending escrow" value={`$${data.stats.pendingEscrowUsd.toLocaleString()}`} colors={colors} />
            <StatTile label="Total users" value={String(data.stats.totalUsers)} colors={colors} />
            <StatTile label="Active tutors" value={String(data.stats.activeTutors)} colors={colors} />
            <StatTile label="Lessons logged" value={String(data.stats.lessonsLogged)} colors={colors} />
          </View>

          <Text style={styles.sectionTitle}>Revenue - last 30 days</Text>
          <View style={styles.card}>
            <RevenueLineChart data={data.revenueByDay} />
            <Text style={styles.barHint}>Total: ${data.revenueByDay.reduce((s, d) => s + d.amountUsd, 0).toLocaleString()}</Text>
          </View>

          <Text style={styles.sectionTitle}>Top subjects by revenue</Text>
          <View style={styles.card}>
            {data.topSubjects.length === 0 ? (
              <Text style={styles.emptyText}>No revenue recorded yet.</Text>
            ) : (
              data.topSubjects.map((s, i) => (
                <View key={s.category} style={[styles.subjectRow, i > 0 && styles.divider]}>
                  <Text style={styles.subjectName} numberOfLines={1}>{s.category}</Text>
                  <View style={styles.subjectBarTrack}>
                    <View style={[styles.subjectBarFill, { width: `${Math.max(6, (s.revenueUsd / maxSubject) * 100)}%` }]} />
                  </View>
                  <Text style={styles.subjectValue}>${s.revenueUsd.toLocaleString()}</Text>
                </View>
              ))
            )}
          </View>

          <Text style={styles.sectionTitle}>Tutor leaderboard</Text>
          <View style={styles.card}>
            {data.tutorLeaderboard.length === 0 ? (
              <Text style={styles.emptyText}>No rated tutors yet.</Text>
            ) : (
              data.tutorLeaderboard.map((t, i) => (
                <View key={t.id} style={[styles.leaderRow, i > 0 && styles.divider]}>
                  <Text style={styles.leaderRank}>#{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.leaderName}>{t.name}</Text>
                    <Text style={styles.leaderMeta}>{t.lessonsCompletedCount} lessons · ${t.totalEarnedUsd.toLocaleString()} earned</Text>
                  </View>
                  <View style={styles.ratingPill}>
                    <Ionicons name="star" size={11} color="#8A6200" />
                    <Text style={styles.ratingPillText}>{t.avgRating.toFixed(1)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function StatTile({ label, value, colors }: { label: string; value: string; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
    statTile: { width: '31%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 },
    statLabel: { fontSize: 9.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint, textTransform: 'uppercase' },
    statValue: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.primaryRed, marginTop: 6 },
    sectionTitle: { fontSize: 15, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 20, marginBottom: 10 },
    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16 },
    barHint: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 6, textAlign: 'center' },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    divider: { borderTopWidth: 1, borderTopColor: colors.border },
    subjectName: { width: 90, fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
    subjectBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.background, overflow: 'hidden' },
    subjectBarFill: { height: '100%', backgroundColor: colors.primaryRed, borderRadius: 4 },
    subjectValue: { width: 70, fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'right' },
    leaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    leaderRank: { width: 26, fontSize: 13, fontFamily: fonts.displayBlack, color: colors.textFaint },
    leaderName: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    leaderMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F5D889', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    ratingPillText: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: '#8A6200' },
  });
}

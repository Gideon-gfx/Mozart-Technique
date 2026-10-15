import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import Avatar from './Avatar';
import GlassSurface from './GlassSurface';
import NotificationBell from './NotificationBell';
import * as geoApi from '../api/geo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAdminIdentity } from '../hooks/useAdminIdentity';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

// Shared by every admin console screen (all 5 tab roots plus the pushed
// More-stack screens use their own BackButton instead, since those already
// have a real "back" target) - back arrow, title, a fixed country flag for
// a Country Admin (never for Main Admin, who isn't scoped to one country),
// a notifications bell, and the account avatar opening the real Profile
// menu - NOT the More tab, which is a different destination reached a
// different way (the bottom tab bar itself).
//
// The Analytics tab (the console's home) uses `identity` mode instead of a
// screen-label title: it greets the admin by first name, with their role
// and a flag beside it - a country flag for a Country Admin, a globe for a
// Main Admin, who isn't scoped to one country. Every other screen keeps a
// plain title/subtitle describing that screen.
export default function AdminHeader({
  title,
  subtitle,
  onBack,
  onNotifications,
  onProfile,
  identity,
}: {
  title?: string;
  subtitle?: string;
  onBack: () => void;
  onNotifications: () => void;
  onProfile: () => void;
  identity?: boolean;
}) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isPrimary, countryCode } = useAdminIdentity();
  const { toast } = useToast();
  const [refreshingLocation, setRefreshingLocation] = useState(false);
  const [locationCountryCode, setLocationCountryCode] = useState(countryCode);
  const flagUrl = !isPrimary && locationCountryCode ? `https://flagcdn.com/w80/${locationCountryCode.toLowerCase()}.png` : null;

  useEffect(() => {
    setLocationCountryCode(countryCode);
  }, [countryCode]);

  const displayTitle = identity ? user?.name?.split(' ')[0] || user?.name || 'Admin' : title;
  const roleLabel = identity ? (isPrimary ? 'Main Admin' : 'Country Admin') : subtitle;

  async function refreshLocation() {
    if (refreshingLocation) return;
    setRefreshingLocation(true);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
      const { status } = permission;
      if (status !== 'granted') {
        toast('Allow location access to reload your location.', 'error');
        return;
      }
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        toast('Turn on Location Services, then try again.', 'error');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const updated = await geoApi.setLocation(position.coords.latitude, position.coords.longitude);
      setLocationCountryCode(updated.countryCode);
      toast(`Location reloaded: ${updated.name}.`, 'success');
    } catch {
      toast('Could not reload location. Try again in a moment.', 'error');
    } finally {
      setRefreshingLocation(false);
    }
  }

  function CountryAdminFlag({ small = false }: { small?: boolean }) {
    if (!flagUrl) return null;
    return (
      <Pressable
        onPress={refreshLocation}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Reload location"
        accessibilityHint="Reloads your device location and updates this flag"
      >
        {refreshingLocation ? (
          <ActivityIndicator size="small" color={colors.textFaint} style={small ? styles.flagSmall : styles.flag} />
        ) : (
          <Image source={{ uri: flagUrl }} style={small ? styles.flagSmall : styles.flag} />
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.header}>
      <GlassSurface clear pointerEvents="none" style={[StyleSheet.absoluteFill, styles.headerGlass]} />
      <Pressable style={styles.iconButton} onPress={onBack} hitSlop={10}>
        <Ionicons name="arrow-back" size={20} color={colors.text} />
      </Pressable>
      <View style={styles.titleWrap}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{displayTitle}</Text>
          {!identity ? <CountryAdminFlag /> : null}
        </View>
        {roleLabel ? (
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle} numberOfLines={1}>{roleLabel}</Text>
            {identity ? (
              isPrimary ? (
                <Ionicons name="earth" size={13} color={colors.textFaint} />
              ) : <CountryAdminFlag small />
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.headerRight}>
        <Pressable style={styles.iconButton} onPress={onNotifications} hitSlop={10}>
          <NotificationBell size={20} color={colors.text} />
        </Pressable>
        <Pressable onPress={onProfile} hitSlop={10}>
          <Avatar name={user?.name || '?'} photoUrl={user?.photoUrl} size={32} viewable={false} />
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingTop: 60,
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: 'transparent',
    },
    headerGlass: { borderRadius: 0 },
    iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    titleWrap: { flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, flexShrink: 1 },
    flag: { width: 20, height: 14, borderRadius: 3 },
    flagSmall: { width: 15, height: 11, borderRadius: 2 },
    subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
    subtitle: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  });
}

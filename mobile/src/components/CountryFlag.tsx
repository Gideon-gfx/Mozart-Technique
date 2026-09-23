import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text } from 'react-native';

import * as geoApi from '../api/geo';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';
import { useToast } from '../context/ToastContext';

// Mirrors public/assets/geo-location.js's flag badge - a real flag image
// (flagcdn.com, same source the web app uses), tap to re-request device
// location and refresh the country it's pinned to. Tutor search is
// country-scoped server-side, so this is what actually changes which
// tutors show up, not just a cosmetic badge.
export default function CountryFlag() {
  const { colors } = useTheme();
  const { toast } = useToast();
  const [geo, setGeo] = useState<geoApi.GeoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [flagFailed, setFlagFailed] = useState(false);

  useEffect(() => {
    geoApi.fetchGeo().then(setGeo).catch(() => {});
  }, []);

  async function onPress() {
    if (loading) return;
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast('Location needed: allow location access to show tutors in your country.', 'error');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const data = await geoApi.setLocation(position.coords.latitude, position.coords.longitude);
      setGeo(data);
      setFlagFailed(false);
    } catch {
      toast('Could not update location. Try again in a moment.', 'error');
    } finally {
      setLoading(false);
    }
  }

  if (!geo) return null;

  return (
    <Pressable
      style={[styles.badge, { borderColor: colors.border, backgroundColor: colors.background }]}
      onPress={onPress}
      hitSlop={8}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.textFaint} />
      ) : flagFailed ? (
        <Text style={styles.flagFallback}>🌐</Text>
      ) : (
        <Image
          source={{ uri: `https://flagcdn.com/w40/${geo.countryCode.toLowerCase()}.png` }}
          style={styles.flag}
          onError={() => setFlagFailed(true)}
        />
      )}
      <Text style={[styles.code, { color: colors.textSoft }]}>{geo.countryCode}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  flag: { width: 18, height: 12, borderRadius: 2 },
  flagFallback: { fontSize: 12, lineHeight: 14 },
  code: { fontSize: 11, fontFamily: fonts.bodyBold },
});

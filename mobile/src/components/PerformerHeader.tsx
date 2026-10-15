import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MyPerformerProfile } from '../api/performers';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';
import Avatar from './Avatar';
import CountryFlag from './CountryFlag';
import GlassSurface from './GlassSurface';
import NotificationBell from './NotificationBell';

// Shared by every Performer-mode tab root - stage name + country flag +
// "title" (their primary category, e.g. DJ/Dance/Piano) in the top-left,
// same identity-first treatment Sponsor/Organization headers already use
// instead of a generic screen label.
export default function PerformerHeader({
  profile,
  fallbackName,
  fallbackPhoto,
  onNotifications,
  onProfile,
}: {
  profile: MyPerformerProfile | null;
  fallbackName?: string;
  fallbackPhoto?: string | null;
  onNotifications: () => void;
  onProfile: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const title = profile?.name || fallbackName || 'Performer';
  const subtitle = profile?.categories?.[0] || (profile?.performerType === 'group' ? 'Group act' : null);

  return (
    <View style={styles.header}>
      <GlassSurface clear pointerEvents="none" style={[StyleSheet.absoluteFill, styles.headerGlass]} />
      <View style={styles.left}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <CountryFlag />
      </View>
      <View style={styles.right}>
        <Pressable style={styles.iconBtn} onPress={onNotifications} hitSlop={10}>
          <NotificationBell size={20} color={colors.text} />
        </Pressable>
        <Pressable onPress={onProfile} hitSlop={10}>
          <Avatar name={title} photoUrl={profile?.photoUrl || fallbackPhoto} size={34} viewable={false} />
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 14,
      backgroundColor: 'transparent',
    },
    headerGlass: { borderRadius: 0 },
    left: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    title: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text },
    subtitle: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.primaryRed, marginTop: 1, textTransform: 'capitalize' },
    right: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  });
}

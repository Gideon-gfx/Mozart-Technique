import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useMotion } from '../context/MotionContext';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

const PANEL_WIDTH_FRACTION = 0.75;

export interface SidebarSection {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// A narrow icon rail stays docked (part of the normal layout, doesn't push
// anything since it's already slim) - opening it doesn't widen that rail
// and push the content over, it overlays a wider (75% width) panel ON TOP
// of everything, with a backdrop behind it that closes the sidebar when
// tapped anywhere on the body. Shared by every screen that uses this
// section-switcher pattern (Organization Classroom, Admin Applicants &
// Users, Admin Tutor Matching, Admin Educator Tools) so the behavior stays
// identical across all of them.
export default function CollapsibleSidebar({
  sections,
  activeKey,
  onSelect,
  children,
}: {
  sections: SidebarSection[];
  activeKey: string;
  onSelect: (key: string) => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const { width: screenWidth } = useWindowDimensions();
  const panelWidth = screenWidth * PANEL_WIDTH_FRACTION;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  // Stays true through the close animation - the old version's hard
  // `{open ? ... : null}` unmounted the panel the instant `open` flipped,
  // which is what made close look like an instant pop instead of a slide;
  // this keeps it mounted until the animation actually finishes.
  const [mounted, setMounted] = useState(false);
  const translateX = useRef(new Animated.Value(-panelWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (reduceMotion) {
        translateX.setValue(0);
        backdropOpacity.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0, stiffness: 260, damping: 28, mass: 1, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      if (reduceMotion) {
        setMounted(false);
        return;
      }
      Animated.parallel([
        Animated.timing(translateX, { toValue: -panelWidth, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false); });
    }
    // panelWidth/translateX/backdropOpacity deliberately excluded - they're
    // stable Animated.Value refs and a derived width, not state this
    // effect should re-run for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reduceMotion]);

  function selectAndClose(key: string) {
    onSelect(key);
    setOpen(false);
  }

  return (
    <View style={styles.shell}>
      <View style={styles.railAndContent}>
        <View style={styles.rail}>
          <Pressable style={styles.railToggle} onPress={() => setOpen(true)} hitSlop={8}>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
          <ScrollView contentContainerStyle={styles.railContent} showsVerticalScrollIndicator={false}>
            {sections.map((s) => {
              const active = activeKey === s.key;
              return (
                <Pressable key={s.key} style={[styles.railItem, active && styles.railItemActive]} onPress={() => onSelect(s.key)}>
                  <Ionicons name={s.icon} size={20} color={active ? colors.onPrimary : colors.text} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <View style={styles.content}>{children}</View>
      </View>

      {mounted ? (
        <>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          </Animated.View>
          <Animated.View style={[styles.overlayPanel, { width: panelWidth, transform: [{ translateX }] }]}>
            <Pressable style={styles.overlayToggle} onPress={() => setOpen(false)} hitSlop={8}>
              <Ionicons name="chevron-back" size={16} color={colors.textFaint} />
            </Pressable>
            <ScrollView contentContainerStyle={styles.overlayContent} showsVerticalScrollIndicator={false}>
              {sections.map((s) => {
                const active = activeKey === s.key;
                return (
                  <Pressable key={s.key} style={[styles.overlayItem, active && styles.railItemActive]} onPress={() => selectAndClose(s.key)}>
                    <Ionicons name={s.icon} size={20} color={active ? colors.onPrimary : colors.text} />
                    <Text style={[styles.overlayItemText, active && styles.overlayItemTextActive]} numberOfLines={2}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    shell: { flex: 1 },
    railAndContent: { flex: 1, flexDirection: 'row' },
    rail: { width: 56, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border },
    railToggle: { alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    railContent: { paddingVertical: 10, paddingHorizontal: 6, gap: 6 },
    railItem: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 12 },
    railItemActive: { backgroundColor: colors.primaryRed },
    content: { flex: 1 },
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 10 },
    overlayPanel: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      zIndex: 11,
      elevation: 11,
    },
    overlayToggle: { alignItems: 'flex-end', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    overlayContent: { paddingVertical: 10, paddingHorizontal: 10, gap: 6 },
    overlayItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14 },
    overlayItemText: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text, flexShrink: 1 },
    overlayItemTextActive: { color: colors.onPrimary },
  });
}

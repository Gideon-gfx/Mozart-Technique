import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Modal, PanResponder, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaUrl } from '../api/client';
import { useNotificationsBadge } from '../context/NotificationsContext';
import { useMotion } from '../context/MotionContext';
import { useTheme } from '../theme/useTheme';
import { fonts } from '../theme/fonts';
import GlassSurface from './GlassSurface';
import LiquidPressable from './LiquidPressable';

// '/product?slug=xyz' (server.js's href for a 'new_product' notification,
// same URL the web app links to) -> 'xyz', for navigating there natively.
function slugFromHref(href: string | null) {
  if (!href) return null;
  const match = href.match(/[?&]slug=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function NotificationBubbles({
  onOpenInbox,
  onOpenType,
  onOpenProduct,
}: {
  onOpenInbox: () => void;
  onOpenType?: (type: string) => void;
  onOpenProduct?: (slug: string) => void;
}) {
  const { bubbles, dismissBubble } = useNotificationsBadge();
  const item = bubbles[0];
  if (!item) return null;
  if (item.type === 'new_product' && item.imageUrl) {
    const slug = slugFromHref(item.href);
    return (
      <ProductBubble
        key={item.id}
        name={item.message}
        imageUrl={item.imageUrl}
        onDismiss={() => dismissBubble(item.id)}
        onPress={slug && onOpenProduct ? () => { dismissBubble(item.id); onOpenProduct(slug); } : undefined}
      />
    );
  }
  return (
    <Bubble
      key={item.id}
      message={item.message}
      count={bubbles.length}
      onDismiss={() => dismissBubble(item.id)}
      onOpenInbox={() => (onOpenType ? onOpenType(item.type) : onOpenInbox())}
    />
  );
}

// A new store product, announced the moment it lands (poll-driven, same
// bubbles queue as every other notification) - a real full-size card (not
// the small text toast Bubble below uses), since the point is to actually
// show the product off, not just mention it happened.
function ProductBubble({ name, imageUrl, onDismiss, onPress }: { name: string; imageUrl: string; onDismiss: () => void; onPress?: () => void }) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const { width, height } = useWindowDimensions();
  const scale = useRef(new Animated.Value(reduceMotion ? 1 : 0.85)).current;
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { scale.setValue(1); opacity.setValue(1); return; }
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, stiffness: 220, damping: 22, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [reduceMotion, scale, opacity]);
  const cardWidth = Math.min(width * 0.86, 420);
  return (
    <Animated.View style={[styles.productOverlay, { opacity }]} pointerEvents="box-none">
      <LiquidPressable style={StyleSheet.absoluteFill} accessibilityLabel="Dismiss" onPress={onDismiss} />
      <Animated.View style={[styles.productCard, { width: cardWidth, transform: [{ scale }] }]}>
        <GlassSurface style={StyleSheet.absoluteFill} />
        <LiquidPressable onPress={onPress} disabled={!onPress}>
          <Image source={{ uri: resolveMediaUrl(imageUrl) || undefined }} style={[styles.productImage, { width: cardWidth, height: Math.min(height * 0.4, cardWidth) }]} />
          <View style={styles.productTextArea}>
            <Text style={{ color: colors.textSoft, fontFamily: fonts.bodySemiBold, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>New in the store</Text>
            <Text style={{ color: colors.text, fontFamily: fonts.displayBlack, fontSize: 21, marginTop: 4 }} numberOfLines={3}>{name}</Text>
            {onPress ? <Text style={{ color: colors.primaryRed, fontFamily: fonts.bodyBold, fontSize: 13, marginTop: 10 }}>View in store →</Text> : null}
          </View>
        </LiquidPressable>
        <LiquidPressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} hitSlop={12} style={styles.productClose}>
          <GlassSurface style={StyleSheet.absoluteFill} />
          <Ionicons name="close" color={colors.text} size={20} />
        </LiquidPressable>
      </Animated.View>
    </Animated.View>
  );
}

function Bubble({ message, count, onDismiss, onOpenInbox }: { message: string; count: number; onDismiss: () => void; onOpenInbox: () => void }) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  // Negative - slides down into place from off the top edge, the mirror of
  // the old bottom-anchored version's slide-up-from-below entrance.
  const y = useRef(new Animated.Value(reduceMotion ? 0 : -120)).current;
  useEffect(() => {
    if (reduceMotion) y.setValue(0);
    else Animated.spring(y, { toValue: 0, stiffness: 220, damping: 24, useNativeDriver: true }).start();
  }, [reduceMotion, y]);
  const gesture = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => y.setValue(Math.max(-70, Math.min(g.dy, 120))),
    onPanResponderRelease: (_, g) => {
      if (g.dy < -40) { onDismiss(); return; }
      if (g.dy > 35) setExpanded(true);
      if (reduceMotion) y.setValue(0);
      else Animated.spring(y, { toValue: 0, stiffness: 300, damping: 28, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => y.setValue(0),
  }), [onDismiss, y, reduceMotion]);
  const textStyle = { color: colors.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 };
  return <>
    <Animated.View {...gesture.panHandlers} style={[styles.bubble, { top: Math.max(insets.top, 10) + 12, transform: [{ translateY: y }] }]}>
      <GlassSurface style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="notifications-outline" color={colors.primaryRed} size={20} />
          <Text style={[textStyle, { flex: 1, fontFamily: fonts.bodyBold }]}>Mozart{count > 1 ? ` · ${count} new` : ''}</Text>
          <LiquidPressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={onDismiss} hitSlop={12}><Ionicons name="close" color={colors.text} size={20} /></LiquidPressable>
        </View>
        <LiquidPressable accessibilityRole="button" accessibilityLabel="Read full notification" onPress={() => setExpanded(true)}>
          <Text style={[textStyle, { marginTop: 8 }]} numberOfLines={2}>{message}</Text>
          <Text style={{ color: colors.textSoft, fontSize: 11, marginTop: 8 }}>Pull down or tap to read</Text>
        </LiquidPressable>
      </GlassSurface>
    </Animated.View>
    <Modal visible={expanded} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setExpanded(false)}>
      <View style={styles.modal}>
        <LiquidPressable style={StyleSheet.absoluteFill} accessibilityLabel="Close notification details" onPress={() => setExpanded(false)} />
        <GlassSurface style={[styles.details, { marginBottom: Math.max(insets.bottom, 16), maxHeight: height * 0.7 }]}>
          <View style={[styles.row, { marginBottom: 16 }]}><Text style={[textStyle, { flex: 1, fontFamily: fonts.bodyBold }]}>Notification</Text><LiquidPressable onPress={() => setExpanded(false)} accessibilityLabel="Close details" hitSlop={12}><Ionicons name="close" color={colors.text} size={22} /></LiquidPressable></View>
          <ScrollView><Text selectable style={textStyle}>{message}</Text></ScrollView>
          <LiquidPressable style={[styles.open, { backgroundColor: colors.primaryRed }]} onPress={() => { setExpanded(false); onDismiss(); onOpenInbox(); }}><Text style={{ color: colors.onPrimary, fontFamily: fonts.bodyBold }}>Open notifications</Text></LiquidPressable>
        </GlassSurface>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  bubble: { position: 'absolute', left: 16, right: 16, zIndex: 1000, elevation: 20 },
  card: { padding: 18, borderRadius: 26 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' },
  details: { marginHorizontal: 12, padding: 24, borderRadius: 30 },
  open: { padding: 16, alignItems: 'center', borderRadius: 22, marginTop: 20 },
  productOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1000, elevation: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  productCard: { borderRadius: 30, overflow: 'hidden' },
  productImage: { backgroundColor: 'rgba(128,128,128,0.15)' },
  productTextArea: { padding: 20 },
  productClose: {
    position: 'absolute', top: 14, right: 14,
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
});

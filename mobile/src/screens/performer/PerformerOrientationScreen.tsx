import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '../../api/client';
import * as performersApi from '../../api/performers';
import PrimaryButton from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PERFORMER_ORIENTATION_SCREENS, PERFORMER_ORIENTATION_VERSION } from '../../data/performerOrientationContent';
import type { MainStackParamList } from '../../navigation/types';
import { fonts } from '../../theme/fonts';

type Props = NativeStackScreenProps<MainStackParamList, 'PerformerOrientation'>;

// Mozart Techniques' own brand colors, same fixed palette as
// TutorOrientationScreen.tsx (mirrors it deliberately - see that file's own
// note on why these stay fixed rather than following useTheme()).
const TOKENS = {
  dark: '#1a0505',
  darkDeep: '#0f0303',
  cardDark: '#2a0d0d',
  accent: '#c41822',
  accentGradient: ['#c41822', '#ff3342'] as const,
  ink: '#17130F',
  muted: '#5B5449',
  bgLight: '#FBF7F0',
  white: '#FFFFFF',
  cardLine: '#E7DFD3',
};

const TOTAL = PERFORMER_ORIENTATION_SCREENS.length;

export default function PerformerOrientationScreen({ navigation, route }: Props) {
  const reviewMode = route.params?.reviewMode ?? false;
  const { refresh: refreshSession } = useAuth();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const isLast = index === TOTAL - 1;
  const current = PERFORMER_ORIENTATION_SCREENS[index];
  const dark = current.background === 'dark';
  const bg = dark ? (current.id % 2 === 0 ? TOKENS.darkDeep : TOKENS.dark) : TOKENS.bgLight;
  const textColor = dark ? TOKENS.white : TOKENS.ink;
  const mutedColor = dark ? 'rgba(255,255,255,0.7)' : TOKENS.muted;

  function goToIndex(nextIndex: number) {
    scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
    setIndex(nextIndex);
  }

  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    if (nextIndex !== index) setIndex(nextIndex);
  }

  // The whole point of the first-time gate is that it can't be backed out
  // of - block Android's hardware back button too, not just the header
  // gesture (already off via MainStack's gestureEnabled:false). Review mode
  // (reopened from Performer Settings) has nothing to gate, so back works normally.
  useEffect(() => {
    if (reviewMode) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [reviewMode]);

  async function finish() {
    if (reviewMode) {
      navigation.goBack();
      return;
    }
    setSubmitting(true);
    try {
      await performersApi.acknowledgePerformerOrientation(PERFORMER_ORIENTATION_VERSION);
      // Re-checks the session so user.needsPerformerOrientation flips to
      // false immediately - without this, going back to the dashboard
      // would trigger the gate again on the very next focus.
      await refreshSession().catch(() => {});
      navigation.goBack();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save your acknowledgment. Try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (isLast) finish();
    else goToIndex(index + 1);
  }

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      <View style={[styles.topRow, { paddingTop: insets.top + 12 }]}>
        {index > 0 ? (
          <Pressable onPress={() => goToIndex(index - 1)} hitSlop={10} style={styles.topBtn}>
            <Ionicons name="chevron-back" size={20} color={textColor} />
          </Pressable>
        ) : <View style={styles.topBtn} />}
        <Text style={[styles.progressText, { color: mutedColor }]}>{index + 1} / {TOTAL}</Text>
        {reviewMode ? (
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topBtn}>
            <Ionicons name="close" size={20} color={textColor} />
          </Pressable>
        ) : <View style={styles.topBtn} />}
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((index + 1) / TOTAL) * 100}%`, backgroundColor: TOKENS.accent }]} />
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={styles.carousel}
      >
        {PERFORMER_ORIENTATION_SCREENS.map((screen) => {
          const screenDark = screen.background === 'dark';
          const screenBg = screenDark ? (screen.id % 2 === 0 ? TOKENS.darkDeep : TOKENS.dark) : TOKENS.bgLight;
          const screenText = screenDark ? TOKENS.white : TOKENS.ink;
          const screenMuted = screenDark ? 'rgba(255,255,255,0.7)' : TOKENS.muted;
          const screenCard = screenDark ? TOKENS.cardDark : TOKENS.white;
          return (
            <ScrollView
              key={screen.id}
              style={[styles.slide, { width, backgroundColor: screenBg }]}
              contentContainerStyle={[styles.slideContent, { paddingBottom: 140 + insets.bottom }]}
              showsVerticalScrollIndicator={false}
            >
              <LinearGradient colors={TOKENS.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
                <Ionicons name={screen.icon} size={26} color={TOKENS.white} />
              </LinearGradient>
              {screen.kicker ? <Text style={[styles.kicker, { color: TOKENS.accent }]}>{screen.kicker}</Text> : null}
              <Text style={[styles.title, { color: screenText }]}>{screen.title}</Text>
              {screen.body.map((paragraph, i) => (
                <Text key={i} style={[styles.body, { color: screenMuted }]}>{paragraph}</Text>
              ))}
              {screen.list ? (
                <View style={[styles.listCard, { backgroundColor: screenCard, borderColor: screenDark ? 'rgba(255,255,255,0.12)' : TOKENS.cardLine }]}>
                  {screen.list.map((item, i) => (
                    <View key={i} style={[styles.listRow, i === screen.list!.length - 1 && { borderBottomWidth: 0 }, { borderBottomColor: screenDark ? 'rgba(255,255,255,0.1)' : TOKENS.cardLine }]}>
                      <Ionicons name="checkmark-circle" size={16} color={TOKENS.accent} />
                      <Text style={[styles.listText, { color: screenText }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {screen.footnote ? <Text style={[styles.footnote, { color: screenMuted }]}>{screen.footnote}</Text> : null}
            </ScrollView>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + 4, backgroundColor: bg }]}>
        <PrimaryButton
          title={isLast ? 'I Understand & Agree' : 'Continue'}
          onPress={next}
          loading={submitting}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  topBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  progressText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, letterSpacing: 0.4 },
  progressTrack: { height: 3, marginHorizontal: 16, borderRadius: 2, backgroundColor: 'rgba(120,120,140,0.2)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  carousel: { flex: 1 },
  slide: { flex: 1 },
  slideContent: { paddingHorizontal: 28, paddingTop: 28 },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  kicker: { fontSize: 12, fontFamily: fonts.bodyBold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  title: { fontSize: 25, fontFamily: fonts.displayBlack, lineHeight: 32, marginBottom: 14 },
  body: { fontSize: 14.5, fontFamily: fonts.body, lineHeight: 22, marginBottom: 12 },
  listCard: { borderRadius: 16, borderWidth: 1, marginTop: 8, paddingHorizontal: 16 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: 1 },
  listText: { flex: 1, fontSize: 13.5, fontFamily: fonts.bodyMedium, lineHeight: 19 },
  footnote: { fontSize: 12, fontFamily: fonts.body, fontStyle: 'italic', lineHeight: 17, marginTop: 18 },
  footer: { paddingHorizontal: 24, paddingTop: 14 },
});

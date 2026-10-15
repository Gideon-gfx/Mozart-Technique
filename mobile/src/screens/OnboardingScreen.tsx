import { useEvent } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScrollView } from '../components/LiquidScroll';
import { API_BASE_URL } from '../api/client';
import BackButton from '../components/BackButton';
import PrimaryButton from '../components/PrimaryButton';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

// Deliberately not wired to navigation directly - this same carousel is
// shown two ways: AuthStack's copy (before sign-in, "Get started" leads to
// GetStarted) and App.tsx Root's post-login gate for every account that
// hasn't seen it yet (Continue/Skip just dismisses the gate). `onFinish` is
// what "Skip" and the final slide's "Get started" both actually do -
// left to each caller to interpret.
type Props = { onFinish: () => void; finishLabel?: string };
type VideoAsset = string;

// Server-hosted, not require()'d - these are 28-52MB each, and Metro's dev
// asset server sends a bundled require() asset as one non-seekable HTTP
// response with no Range support, which is exactly what was timing out
// ExoPlayer's reader on Android ("SocketTimeoutException: Read timed out").
// express.static (serving public/assets) supports Range requests out of
// the box, the same way every other video in this app is already served
// (tutor library clips, chat attachments, performer clips) - none of those
// are bundled assets either.
function onboardingVideo(filename: string): VideoAsset {
  return `${API_BASE_URL}/assets/onboarding-videos/${filename}`;
}

const SLIDES: { title: string; body: string; videos: VideoAsset[] }[] = [
  {
    title: 'Build your technique.',
    body: 'Learn with structured lessons, expert tutors, focused practice tools and a library built around musical technique.',
    videos: [onboardingVideo('video-call-1.mp4'), onboardingVideo('video-call-2.mp4')],
  },
  {
    title: 'Learn your way.',
    body: 'Book online or in-person lessons, message your tutor, join live classes, and keep your learning journey organized.',
    videos: [onboardingVideo('live-class1.mp4'), onboardingVideo('live-class2.mp4')],
  },
  {
    title: 'Your progress, your story.',
    body: 'Track practice, celebrate milestones and stay connected with the people shaping your musical journey.',
    videos: [onboardingVideo('messages.mp4')],
  },
];

// Renders one player's output - `visible` only controls opacity, the
// player itself is created by the caller and kept alive regardless, so a
// hidden slot can keep buffering in the background.
function VideoClip({ player, visible, slideNumber }: { player: ReturnType<typeof useVideoPlayer>; visible: boolean; slideNumber: number }) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  // Same diagnostic LibraryScreen's video player already needed once
  // before: without this, a player that fails to load (bad codec, asset
  // resolution error, etc.) shows nothing at all - just a silent blank
  // view, indistinguishable from "still loading" or "not playing".
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    if (status === 'error') {
      console.error(`[onboarding-video] slide ${slideNumber} failed`, {
        message: error?.message ?? 'Unknown native video error',
      });
    } else {
      console.info(`[onboarding-video] slide ${slideNumber} player status`, status);
    }
  }, [error, slideNumber, status]);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 900,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [opacity, visible]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      {/* `cover` already fills the frame with no letterboxing, but the
          source clips read as a wide/distant shot - this scale crops in
          tighter for a closer framing. It's a transform on an absolutely-
          positioned element, so it's paint-only: it can't push or resize
          the body text (or anything else) below it, which sits in a
          completely separate part of the tree. Raise/lower `1.22` to
          zoom in/out further. */}
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.22 }] }]}
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => console.info(`[onboarding-video] slide ${slideNumber} first frame rendered`)}
        pointerEvents="none"
      />
      {visible && status === 'error' ? (
        <View style={styles.statusOverlay} pointerEvents="none">
          <Text style={styles.statusErrorText}>{error?.message || 'This video could not be played.'}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

function OnboardingPlayer({ sources, isPlaying, slideNumber }: { sources: VideoAsset[]; isPlaying: boolean; slideNumber: number }) {
  const sourceUri = sources[0] ?? null;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const player = useVideoPlayer(null, (p) => {
    p.muted = true;
    p.loop = true;
  });
  const status = useEvent(player, 'statusChange', { status: player.status }).status;

  useEffect(() => {
    if (status === 'readyToPlay') {
      if (isPlaying) player.play();
      else player.pause();
    }
  }, [isPlaying, player, status]);

  useEffect(() => {
    let active = true;
    if (!sourceUri) return () => { active = false; };
    player.pause();
    console.info(`[onboarding-video] slide ${slideNumber} loading source`, sourceUri);
    void player.replaceAsync({ uri: sourceUri, useCaching: false }).then(() => {
      if (!active) return;
      console.info(`[onboarding-video] slide ${slideNumber} source ready`, sourceUri);
      if (isPlayingRef.current) player.play();
    }).catch((error: unknown) => {
      if (active) console.error(`[onboarding-video] slide ${slideNumber} source load failed`, error);
    });
    return () => { active = false; };
  }, [player, slideNumber, sourceUri]);

  return <VideoClip player={player} visible slideNumber={slideNumber} />;
}

function OnboardingVideo({ isPaused, setIsPaused }: { isPaused: boolean; setIsPaused: React.Dispatch<React.SetStateAction<boolean>> }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isPaused ? 'Resume onboarding video' : 'Pause onboarding video'}
      onPress={() => setIsPaused((paused) => !paused)}
      style={StyleSheet.absoluteFill}
    >
      <LinearGradient
        colors={['rgba(4, 5, 8, 0.02)', 'rgba(4, 5, 8, 0.76)']}
        locations={[0.42, 1]}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
    </Pressable>
  );
}

export default function OnboardingScreen({ onFinish, finishLabel = 'Get started' }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const themedStyles = useMemo(() => createStyles(colors), [colors]);
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const isLast = index === SLIDES.length - 1;

  function goToIndex(nextIndex: number) {
    scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
    setIndex(nextIndex);
    setIsPaused(false);
  }

  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    if (nextIndex !== index) {
      setIndex(nextIndex);
      setIsPaused(false);
    }
  }

  function next() {
    if (isLast) onFinish();
    else goToIndex(index + 1);
  }

  return (
    <View style={themedStyles.screen}>
      <OnboardingPlayer
        sources={SLIDES[index].videos}
        isPlaying={!isPaused}
        slideNumber={index + 1}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={['rgba(174, 18, 31, 0.38)', 'rgba(174, 18, 31, 0)']}
          locations={[0, 1]}
          style={styles.topRedGlow}
        />
        <LinearGradient
          colors={['rgba(174, 18, 31, 0)', 'rgba(174, 18, 31, 0.42)']}
          locations={[0, 1]}
          style={styles.bottomRedGlow}
        />
      </View>
      <View style={[themedStyles.topRow, { marginTop: insets.top + 8 }]}>
        {index > 0 ? <BackButton onPress={() => goToIndex(index - 1)} /> : <View style={themedStyles.backSpacer} />}
        <Pressable onPress={onFinish} hitSlop={10}>
          <Text style={themedStyles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={themedStyles.carousel}
        contentContainerStyle={themedStyles.carouselContent}
      >
        {SLIDES.map((slide, slideIndex) => (
          <View key={slide.title} style={[themedStyles.slide, { width }]}>
            <OnboardingVideo isPaused={isPaused} setIsPaused={setIsPaused} />
            <View pointerEvents="none" style={[themedStyles.copy, { paddingBottom: 130 + insets.bottom }]}>
              <Text style={themedStyles.title}>{slide.title}</Text>
              <Text style={themedStyles.body}>{slide.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[themedStyles.footer, { paddingBottom: Math.max(insets.bottom, 20) + 4 }]}>
        <View style={themedStyles.dots}>
          {SLIDES.map((slide, dotIndex) => (
            <View key={slide.title} style={[themedStyles.dot, dotIndex === index && themedStyles.dotOn]} />
          ))}
        </View>
        <PrimaryButton title={isLast ? finishLabel : 'Continue'} onPress={next} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topRedGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: '28%' },
  bottomRedGlow: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '34%' },
  statusOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  statusErrorText: { color: '#fff', fontSize: 13, textAlign: 'center' },
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#08090d' },
    topRow: {
      zIndex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 22,
    },
    backSpacer: { width: 42, height: 42 },
    skipText: {
      color: '#FFFFFF',
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      textShadowColor: 'rgba(0, 0, 0, 0.5)',
      textShadowRadius: 8,
    },
    // flex:1 (not position:absolute) is deliberate - a horizontally-paging
    // ScrollView's content doesn't reliably stretch to fill an absolutely-
    // positioned parent's height, which is what was cropping the video.
    // The negative marginTop alone is what lets it bleed up behind the
    // top row; the footer below is still the thing that floats over it.
    carousel: { flex: 1, marginTop: -50 },
    carouselContent: { backgroundColor: 'transparent' },
    slide: { flex: 1, overflow: 'hidden', justifyContent: 'flex-end' },
    copy: { paddingHorizontal: 22, paddingBottom: 28 },
    title: {
      fontSize: 27,
      fontFamily: fonts.displayBlack,
      letterSpacing: -0.8,
      color: '#FFFFFF',
      marginBottom: 9,
      textShadowColor: 'rgba(0, 0, 0, 0.48)',
      textShadowRadius: 12,
    },
    body: {
      fontSize: 14.5,
      lineHeight: 21,
      fontFamily: fonts.body,
      color: '#F5F5F7',
      textShadowColor: 'rgba(0, 0, 0, 0.55)',
      textShadowRadius: 8,
    },
    // Floating over the video (like the app's bottom tab bar) instead of a
    // solid docked bar - the carousel behind it is full-bleed all the way
    // to the screen edge now that this is out of flex flow, and this glass
    // surface is what keeps the Continue button legible over it.
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 2,
      paddingHorizontal: 22,
      paddingTop: 12,
      overflow: 'hidden',
    },
    dots: { flexDirection: 'row', gap: 6, marginBottom: 16, justifyContent: 'center' },
    dot: { width: 22, height: 5, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.32)' },
    dotOn: { backgroundColor: colors.primaryRed },
  });
}

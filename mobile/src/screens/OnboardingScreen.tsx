import { useEvent, useEventListener } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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

const SLIDES: { title: string; body: string; greeting: string; videos: VideoAsset[] }[] = [
  {
    title: 'Build your technique.',
    body: 'Learn with structured lessons, expert tutors, focused practice tools and a library built around musical technique.',
    greeting: 'Hello',
    videos: [onboardingVideo('video-call-1.mp4'), onboardingVideo('video-call-2.mp4')],
  },
  {
    title: 'Learn your way.',
    body: 'Book online or in-person lessons, message your tutor, join live classes, and keep your learning journey organized.',
    greeting: 'Welcome to',
    videos: [onboardingVideo('live-class1.mp4'), onboardingVideo('live-class2.mp4')],
  },
  {
    title: 'Your progress, your story.',
    body: 'Track practice, celebrate milestones and stay connected with the people shaping your musical journey.',
    greeting: 'Mozart Techniques',
    videos: [onboardingVideo('messages.mp4')],
  },
];

function HandwrittenGreeting({ text, active }: { text: string; active: boolean }) {
  const [written, setWritten] = useState('');
  const inkOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      setWritten('');
      inkOpacity.setValue(0);
      return undefined;
    }

    let character = 0;
    let timer: ReturnType<typeof setTimeout>;
    Animated.timing(inkOpacity, {
      toValue: 1,
      duration: text.length * 78,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    const write = () => {
      character += 1;
      setWritten(text.slice(0, character));
      if (character < text.length) {
        timer = setTimeout(write, 78);
      } else {
        timer = setTimeout(() => {
          setWritten('');
          character = 0;
          inkOpacity.setValue(0);
          Animated.timing(inkOpacity, {
            toValue: 1,
            duration: text.length * 78,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
          timer = setTimeout(write, 480);
        }, 2100);
      }
    };

    timer = setTimeout(write, 360);
    return () => clearTimeout(timer);
  }, [active, inkOpacity, text]);

  return (
    <View pointerEvents="none" style={styles.greeting}>
      <Animated.Text numberOfLines={1} adjustsFontSizeToFit style={[styles.greetingText, { opacity: inkOpacity }]}>
        {written}
      </Animated.Text>
    </View>
  );
}

// Renders one player's output - `visible` only controls opacity, the
// player itself is created by the caller and kept alive regardless, so a
// hidden slot can keep buffering in the background.
function VideoClip({ player, visible }: { player: ReturnType<typeof useVideoPlayer>; visible: boolean }) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  // Same diagnostic LibraryScreen's video player already needed once
  // before: without this, a player that fails to load (bad codec, asset
  // resolution error, etc.) shows nothing at all - just a silent blank
  // view, indistinguishable from "still loading" or "not playing".
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });

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
        surfaceType="textureView"
        pointerEvents="none"
      />
      {visible && status === 'loading' ? (
        <View style={styles.statusOverlay} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
      {visible && status === 'error' ? (
        <View style={styles.statusOverlay} pointerEvents="none">
          <Text style={styles.statusErrorText}>{error?.message || 'This video could not be played.'}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

// Mounted while a slide is active OR merely adjacent to the active one
// (see `isNear` below), so its players already exist and are buffering
// *before* you swipe or tap to it - `isPlaying` is the only thing that
// actually starts playback, and by the time a slide becomes truly active
// its player has typically had a head start, so play() has real data to
// start from immediately instead of only just having been created.
// Mounting ahead of time like this (rather than exactly when a transition
// begins) is also what keeps the transition itself from competing with
// player-creation for the same frame. Every slide currently has at most 2
// clips, so two fixed player slots (rather than a general N-ahead prefetch
// queue) cover it: both sources start buffering as soon as this mounts (a
// player begins loading the moment it has a source, independent of
// play()/pause()), and advancing between them is just flipping which slot
// is visible/playing - no new fetch, no reload gap. Revisit this if a
// slide ever needs a 3rd clip.
function ActiveSlideVideo({ sources, isPlaying }: { sources: VideoAsset[]; isPlaying: boolean }) {
  const hasSecond = sources.length > 1;
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const playerASource = useMemo(() => ({ uri: sources[0], useCaching: true }), [sources]);
  const playerBSource = useMemo(() => (hasSecond ? { uri: sources[1], useCaching: true } : null), [hasSecond, sources]);

  const playerA = useVideoPlayer(playerASource, (p) => { p.muted = true; });
  const playerB = useVideoPlayer(playerBSource, (p) => { p.muted = true; });

  useEffect(() => {
    playerA.loop = !hasSecond;
    playerB.loop = false;
  }, [hasSecond, playerA, playerB]);

  const activePlayer = activeSlot === 0 ? playerA : playerB;
  const inactivePlayer = activeSlot === 0 ? playerB : playerA;

  useEffect(() => {
    if (isPlaying) activePlayer.play();
    else activePlayer.pause();
    inactivePlayer.pause();
  }, [isPlaying, activePlayer, inactivePlayer]);

  useEventListener(activePlayer, 'playToEnd', () => {
    if (!hasSecond || !isPlaying) return;
    const nextPlayer = activeSlot === 0 ? playerB : playerA;
    nextPlayer.currentTime = 0;
    setActiveSlot((slot) => (slot === 0 ? 1 : 0));
  });

  return (
    <>
      <VideoClip player={playerA} visible={activeSlot === 0} />
      {hasSecond ? <VideoClip player={playerB} visible={activeSlot === 1} /> : null}
    </>
  );
}

function OnboardingVideo({ sources, isActive, isNear }: { sources: VideoAsset[]; isActive: boolean; isNear: boolean }) {
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isActive) setIsPaused(false);
  }, [isActive]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isPaused ? 'Resume onboarding video' : 'Pause onboarding video'}
      onPress={() => setIsPaused((paused) => !paused)}
      style={StyleSheet.absoluteFill}
    >
      {isNear ? <ActiveSlideVideo sources={sources} isPlaying={isActive && !isPaused} /> : null}
      <LinearGradient
        colors={['rgba(174, 18, 31, 0.38)', 'rgba(174, 18, 31, 0)']}
        locations={[0, 1]}
        pointerEvents="none"
        style={styles.topRedGlow}
      />
      <LinearGradient
        colors={['rgba(174, 18, 31, 0)', 'rgba(174, 18, 31, 0.42)']}
        locations={[0, 1]}
        pointerEvents="none"
        style={styles.bottomRedGlow}
      />
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
  const scrollRef = useRef<ScrollView>(null);
  const isLast = index === SLIDES.length - 1;

  function goToIndex(nextIndex: number) {
    scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
    setIndex(nextIndex);
  }

  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    if (nextIndex !== index) setIndex(nextIndex);
  }

  function next() {
    if (isLast) onFinish();
    else goToIndex(index + 1);
  }

  return (
    <View style={themedStyles.screen}>
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
            <OnboardingVideo sources={slide.videos} isActive={index === slideIndex} isNear={index === slideIndex} />
            <HandwrittenGreeting text={slide.greeting} active={index === slideIndex} />
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
  greeting: {
    position: 'absolute',
    top: '40%',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  greetingText: {
    color: '#FFF9FF',
    width: '100%',
    fontSize: 58,
    lineHeight: 68,
    fontFamily: Platform.select({ ios: 'Snell Roundhand', android: 'cursive', default: fonts.display }),
    textAlign: 'center',
    textShadowColor: 'rgba(255, 97, 128, 0.72)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 16,
  },
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
    carouselContent: { backgroundColor: '#08090d' },
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

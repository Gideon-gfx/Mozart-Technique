import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';
import type { ThemeColors } from '../theme/colors';
import GlassSurface from './GlassSurface';
import { useTourTargets, type TourRect } from '../context/TourTargetsContext';

export interface TourStep {
  // Either a key registered elsewhere via useTourTarget (for anything on
  // the current screen), or a precomputed rect (for the bottom tab bar,
  // which lives in a separate navigator this screen can't attach a ref
  // into - its icons sit at fixed, evenly-spaced positions we can compute
  // directly instead).
  targetKey?: string;
  targetRect?: TourRect;
  kicker?: string;
  body: string;
  // Called once, right when this step becomes active, before this tries
  // to resolve its target - lets a step push the user onto a different
  // screen first (Find a Tutor, Library, ...) so it can then point at
  // something that only exists there. The tour overlay is app-global (see
  // TourRunnerContext), so it survives the navigation and keeps running on
  // top of whatever screen this lands on.
  navigate?: () => void;
}

interface Props {
  steps: TourStep[];
  onFinish: () => void;
}

const CARD_MARGIN = 18;
const ARROW_SIZE = 14;

// A first-run, click-through walkthrough for one screen: dims everything,
// draws a highlight ring around one real UI element at a time, and shows a
// glass card describing it - Next/Previous only, nothing else on screen is
// tappable while this is up. Mounted only while its tour hasn't been seen
// yet (the caller checks user.seenTours); unmounts itself via onFinish once
// the last step's "Done" is tapped.
export default function CoachmarkTour({ steps, onFinish }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { measure } = useTourTargets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TourRect | null>(null);
  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  useEffect(() => {
    let cancelled = false;
    setRect(null);
    step.navigate?.();

    async function resolve() {
      if (step.targetRect) { setRect(step.targetRect); return; }
      if (!step.targetKey) return;
      // More retries with a longer delay than a same-screen step would
      // need - when `navigate` above just pushed a whole new screen, its
      // target won't exist in the registry until that screen has mounted
      // and finished its own first layout pass (plus, often, an initial
      // data fetch), which takes noticeably longer than a same-screen
      // element merely settling.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const found = await measure(step.targetKey);
        if (cancelled) return;
        if (found) { setRect(found); return; }
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    resolve();
    return () => { cancelled = true; };
  }, [step, measure]);

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  function next() {
    if (isLast) onFinish();
    else setIndex((i) => i + 1);
  }
  function previous() {
    if (!isFirst) setIndex((i) => i - 1);
  }

  // Card sits below the target if there's more room below than above,
  // clamped so it never runs off either edge horizontally.
  const cardBelow = !rect || rect.y < screenHeight / 2;
  const cardTop = rect
    ? (cardBelow ? Math.min(rect.y + rect.height + 16 + ARROW_SIZE, screenHeight - 220) : undefined)
    : undefined;
  const cardBottom = rect && !cardBelow ? Math.max(screenHeight - rect.y + 16 + ARROW_SIZE, insets.bottom + 90 + ARROW_SIZE) : undefined;
  // Points at the target's horizontal center, clamped so the arrow itself
  // never renders outside the screen's edges.
  const arrowLeft = rect
    ? Math.min(Math.max(rect.x + rect.width / 2 - ARROW_SIZE, CARD_MARGIN + 8), screenWidth - CARD_MARGIN - 8 - ARROW_SIZE * 2)
    : null;
  const arrowTop = rect ? (cardBelow ? rect.y + rect.height + 8 : undefined) : null;
  const arrowBottom = rect && !cardBelow ? screenHeight - rect.y + 8 : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Blocks every touch to whatever's beneath - deliberately not
          dismissible by tapping outside; Next/Previous below are the only
          way through, per the spec this is built against. */}
      <Pressable style={styles.backdrop} onPress={() => {}} />

      {rect && arrowLeft != null ? (
        <View
          pointerEvents="none"
          style={[
            cardBelow ? styles.arrowUp : styles.arrowDown,
            {
              left: arrowLeft,
              top: arrowTop,
              bottom: arrowBottom ?? undefined,
              borderBottomColor: cardBelow ? colors.primaryRed : undefined,
              borderTopColor: !cardBelow ? colors.primaryRed : undefined,
            },
          ]}
        />
      ) : null}

      <View
        style={[
          styles.cardWrap,
          cardTop != null ? { top: cardTop } : null,
          cardBottom != null ? { bottom: cardBottom } : null,
          !rect ? { top: screenHeight / 2 - 100 } : null,
        ]}
      >
        <GlassSurface style={styles.card}>
          {step.kicker ? <Text style={styles.kicker}>{step.kicker}</Text> : null}
          <Text style={styles.body}>{step.body}</Text>

          <View style={styles.dots}>
            {steps.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && { backgroundColor: colors.primaryRed, width: 16 }]} />
            ))}
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              onPress={previous}
              disabled={isFirst}
              style={[styles.navBtn, isFirst && styles.navBtnDisabled]}
            >
              <Text style={[styles.navBtnText, { color: colors.text }]}>Previous</Text>
            </Pressable>
            <Pressable onPress={next} style={[styles.navBtn, styles.navBtnPrimary, { backgroundColor: colors.primaryRed }]}>
              <Text style={[styles.navBtnText, styles.navBtnTextPrimary]}>{isLast ? 'Done' : 'Next'}</Text>
            </Pressable>
          </View>
        </GlassSurface>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.62)',
      zIndex: 2000,
      elevation: 40,
    },
    // A CSS-triangle-style arrow (transparent borders on 3 sides, a
    // colored border on the 4th) rather than a ring around the target -
    // points from the card straight at whatever it's describing.
    arrowUp: {
      position: 'absolute',
      width: 0,
      height: 0,
      borderLeftWidth: ARROW_SIZE,
      borderRightWidth: ARROW_SIZE,
      borderBottomWidth: ARROW_SIZE * 1.3,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      zIndex: 2001,
      elevation: 41,
    },
    arrowDown: {
      position: 'absolute',
      width: 0,
      height: 0,
      borderLeftWidth: ARROW_SIZE,
      borderRightWidth: ARROW_SIZE,
      borderTopWidth: ARROW_SIZE * 1.3,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      zIndex: 2001,
      elevation: 41,
    },
    cardWrap: {
      position: 'absolute',
      left: CARD_MARGIN,
      right: CARD_MARGIN,
      zIndex: 2001,
      elevation: 41,
    },
    card: {
      padding: 18,
      borderRadius: 22,
    },
    kicker: {
      fontSize: 11,
      fontFamily: fonts.bodyBold,
      color: colors.primaryRed,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 6,
    },
    body: {
      fontSize: 14,
      lineHeight: 20.5,
      fontFamily: fonts.body,
      color: colors.text,
    },
    dots: {
      flexDirection: 'row',
      gap: 5,
      marginTop: 16,
      marginBottom: 4,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
    },
    navBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navBtnDisabled: {
      opacity: 0.35,
    },
    navBtnPrimary: {},
    navBtnText: {
      fontSize: 13.5,
      fontFamily: fonts.bodyBold,
    },
    navBtnTextPrimary: {
      color: '#fff',
    },
  });
}

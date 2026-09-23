import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import * as pollsApi from '../api/polls';
import type { ActivePoll } from '../api/polls';
import { useAuth } from '../context/AuthContext';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';
import GlassSurface from './GlassSurface';
import LiquidPressable from './LiquidPressable';

const POLL_CHECK_INTERVAL_MS = 10000;

// A one-off admin-broadcast poll (data/polls.js) - no right answer, shown as
// a popup wherever the user happens to be, mirroring NotificationBubbles'
// ProductBubble: mounted once at the app root (App.tsx, sibling of
// NavigationContainer, not nested inside any modal-presented screen), so a
// plain absolutely-positioned overlay is safe here - no react-native
// <Modal> nesting-conflict risk like ProfileScreen's sign-out confirm had.
export default function PollPopup() {
  const { user } = useAuth();
  const [poll, setPoll] = useState<ActivePoll | null>(null);
  const checkingRef = useRef(false);

  const check = useCallback(() => {
    if (!user || checkingRef.current) return;
    checkingRef.current = true;
    pollsApi.fetchActivePoll()
      .then((res) => setPoll((current) => current ?? res.poll))
      .catch(() => {})
      .finally(() => { checkingRef.current = false; });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    check();
    const interval = setInterval(() => { if (AppState.currentState === 'active') check(); }, POLL_CHECK_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
    return () => { clearInterval(interval); sub.remove(); };
  }, [user, check]);

  function dismiss() {
    if (!poll) return;
    const dismissed = poll;
    setPoll(null);
    pollsApi.dismissPoll(dismissed.id).catch(() => {});
  }

  function answer(index: number) {
    if (!poll) return;
    const answered = poll;
    setPoll(null);
    pollsApi.respondToPoll(answered.id, index).catch(() => {});
  }

  if (!poll) return null;
  return <PollCard poll={poll} onAnswer={answer} onDismiss={dismiss} />;
}

function PollCard({ poll, onAnswer, onDismiss }: { poll: ActivePoll; onAnswer: (index: number) => void; onDismiss: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <LiquidPressable style={StyleSheet.absoluteFill} accessibilityLabel="Dismiss" onPress={onDismiss} />
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <GlassSurface style={StyleSheet.absoluteFill} />
        <Text style={[styles.kicker, { color: colors.textSoft }]}>Quick question</Text>
        <Text style={[styles.question, { color: colors.text }]}>{poll.question}</Text>
        {poll.options.map((option, i) => (
          <LiquidPressable key={i} style={[styles.option, { borderColor: colors.border, backgroundColor: colors.background }]} onPress={() => onAnswer(i)}>
            <Text style={[styles.optionText, { color: colors.text }]}>{option}</Text>
          </LiquidPressable>
        ))}
        <LiquidPressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} hitSlop={12} style={styles.close}>
          <GlassSurface style={StyleSheet.absoluteFill} />
          <Ionicons name="close" color={colors.text} size={20} />
        </LiquidPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1000, elevation: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 22,
  },
  card: { width: '100%', maxWidth: 420, borderRadius: 26, overflow: 'hidden', padding: 22 },
  kicker: { fontSize: 12, fontFamily: fonts.bodySemiBold, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  question: { fontSize: 19, fontFamily: fonts.displayBlack, lineHeight: 25, marginBottom: 18 },
  option: { borderWidth: 1, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 10 },
  optionText: { fontSize: 14, fontFamily: fonts.bodySemiBold },
  close: {
    position: 'absolute', top: 14, right: 14,
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
});

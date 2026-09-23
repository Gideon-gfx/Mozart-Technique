import { FlatList, ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import * as gamesApi from '../../api/games';
import type { InstrumentGame, LeaderboardEntry, NoteGameTier } from '../../api/games';
import { useAuth } from '../../context/AuthContext';
import BackButton from '../../components/BackButton';
import ScreenWatermark from '../../components/ScreenWatermark';
import type { OrgStudentTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<OrgStudentTabParamList, 'Games'>;

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

// Diatonic step relative to the bottom line (E4 = step 0) - matches
// public/assets/note-game.js exactly, just ported from SVG/DOM to plain
// RN Views (each step is half a line-spacing; even steps sit ON a line,
// odd steps sit IN a space).
function noteAtStep(step: number) {
  const absIndex = step + (4 * 7 + 2);
  const octave = Math.floor(absIndex / 7);
  const letter = LETTERS[((absIndex % 7) + 7) % 7];
  return { letter, octave, step };
}

const TIERS: Record<NoteGameTier, { label: string; minStep: number; maxStep: number; optionCount: number; seconds: number }> = {
  beginner: { label: 'Ages 5-8 · Beginner', minStep: 0, maxStep: 8, optionCount: 4, seconds: 15 },
  intermediate: { label: 'Ages 9-12 · Intermediate', minStep: -2, maxStep: 10, optionCount: 5, seconds: 10 },
  advanced: { label: 'Ages 13+ · Advanced', minStep: -4, maxStep: 12, optionCount: 7, seconds: 6 },
};

function ledgerSteps(step: number) {
  const steps: number[] = [];
  if (step <= -2) {
    const boundary = step % 2 === 0 ? step : step + 1;
    for (let s = -2; s >= boundary; s -= 2) steps.push(s);
  }
  if (step >= 10) {
    const boundary = step % 2 === 0 ? step : step - 1;
    for (let s = 10; s <= boundary; s += 2) steps.push(s);
  }
  return steps;
}

const LINE_SPACING = 18;
const BOTTOM_LINE_Y = 150;
const STAFF_LEFT = 50;
const STAFF_RIGHT = 270;
function yForStep(step: number) {
  return BOTTOM_LINE_Y - step * (LINE_SPACING / 2);
}

const QUESTION_COUNT = 10;

// Two game sets: the native "name that note" mini-game below (a port of
// public/assets/note-game.js - same positions/tiers/scoring, plain Views
// instead of an SVG staff, with a real server-tracked leaderboard), and
// the eight instrument theory challenges from public/classroom-games/
// (piano/guitar/bass/violin/cello/trumpet/saxophone/drums), reused as-is
// via the in-app WebView rather than re-built natively - they're practice-
// only and deliberately don't touch the note-recognition leaderboard.
// Letting an org pick/limit which games its students see is a further,
// separate feature to build later; for now every org-student sees all of
// them, same as the web ngo-dashboard.html classroom does.
export default function OrgStudentGamesScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tier, setTier] = useState<NoteGameTier | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [instrumentGames, setInstrumentGames] = useState<InstrumentGame[]>([]);

  function loadLeaderboard() {
    setLeaderboardLoading(true);
    gamesApi.fetchNoteGameLeaderboard()
      .then((data) => setLeaderboard(data.leaderboard))
      .catch(() => {})
      .finally(() => setLeaderboardLoading(false));
  }

  useEffect(() => {
    loadLeaderboard();
    gamesApi.fetchInstrumentGamesCatalog().then(setInstrumentGames).catch(() => setInstrumentGames([]));
  }, []);

  function openInstrumentGame(game: InstrumentGame) {
    navigation.getParent()?.navigate('MeetingWebView', { url: gamesApi.instrumentGameUrl(game.id), title: game.title });
  }

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View style={styles.header}>
        <BackButton onPress={() => navigation.navigate('Overview')} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Games</Text>
          <Text style={styles.subtitle}>Practice note recognition and instrument theory</Text>
        </View>
      </View>
      {tier ? (
        <NoteGame tier={tier} colors={colors} onExit={() => { setTier(null); loadLeaderboard(); }} />
      ) : (
        <ScrollView contentContainerStyle={styles.tierPicker}>
          <Text style={styles.sectionTitle}>Note recognition</Text>
          {(Object.keys(TIERS) as NoteGameTier[]).map((t) => (
            <Pressable key={t} style={styles.tierBtn} onPress={() => setTier(t)}>
              <Ionicons name="musical-notes" size={20} color={colors.primaryRed} />
              <Text style={styles.tierBtnText}>{TIERS[t].label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ))}

          {instrumentGames.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Instrument challenges</Text>
              {instrumentGames.map((game) => (
                <Pressable key={game.id} style={styles.tierBtn} onPress={() => openInstrumentGame(game)}>
                  <Ionicons name="game-controller" size={20} color={colors.primaryRed} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tierBtnText}>{game.title}</Text>
                    <Text style={styles.emptyText}>{game.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              ))}
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Leaderboard</Text>
          {leaderboardLoading ? (
            <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 10 }} />
          ) : leaderboard.length === 0 ? (
            <Text style={styles.emptyText}>No scores yet - be the first to play!</Text>
          ) : (
            <FlatList
              data={leaderboard}
              keyExtractor={(item) => String(item.studentUserId)}
              scrollEnabled={false}
              renderItem={({ item, index }) => (
                <View style={[styles.leaderRow, item.studentUserId === user?.id && styles.leaderRowMine]}>
                  <Text style={styles.leaderRank}>{index + 1}</Text>
                  <Text style={styles.leaderName} numberOfLines={1}>{item.studentName}</Text>
                  <Text style={styles.leaderScore}>{item.score} pts</Text>
                </View>
              )}
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

function NoteGame({ tier, colors, onExit }: { tier: NoteGameTier; colors: ThemeColors; onExit: () => void }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const config = TIERS[tier];
  const [asked, setAsked] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [note, setNote] = useState(() => randomNote(config));
  const [options, setOptions] = useState<string[]>(() => buildOptions(note.letter, config.optionCount));
  const [timeLeft, setTimeLeft] = useState(config.seconds);
  const [locked, setLocked] = useState(false);
  const [pickedLetter, setPickedLetter] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const savedRef = useRef(false);

  function randomNote(cfg: typeof config) {
    const step = cfg.minStep + Math.floor(Math.random() * (cfg.maxStep - cfg.minStep + 1));
    return noteAtStep(step);
  }

  function buildOptions(correctLetter: string, optionCount: number) {
    const pool = new Set<string>([correctLetter]);
    while (pool.size < optionCount) pool.add(LETTERS[Math.floor(Math.random() * LETTERS.length)]);
    return [...pool].sort(() => Math.random() - 0.5);
  }

  useEffect(() => {
    if (done || locked) return;
    if (timeLeft <= 0) {
      answer(null);
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, locked, done]);

  function nextQuestion(prevAsked: number) {
    if (prevAsked >= QUESTION_COUNT) {
      setDone(true);
      return;
    }
    const nextNote = randomNote(config);
    setNote(nextNote);
    setOptions(buildOptions(nextNote.letter, config.optionCount));
    setTimeLeft(config.seconds);
    setLocked(false);
    setPickedLetter(null);
  }

  function answer(letter: string | null) {
    if (locked) return;
    setLocked(true);
    setPickedLetter(letter);
    const isCorrect = letter === note.letter;
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
      setScore((s) => s + 10 + Math.max(0, timeLeft));
    }
    const nextAsked = asked + 1;
    setTimeout(() => {
      setAsked(nextAsked);
      nextQuestion(nextAsked);
    }, 900);
  }

  useEffect(() => {
    if (done && !savedRef.current) {
      savedRef.current = true;
      gamesApi.recordNoteGameSession({ tier, score, correctCount, totalCount: QUESTION_COUNT }).catch(() => {});
    }
  }, [done, tier, score, correctCount]);

  if (done) {
    return (
      <View style={styles.doneWrap}>
        <Ionicons name="trophy" size={40} color={colors.primaryRed} />
        <Text style={styles.doneTitle}>Round complete!</Text>
        <Text style={styles.doneText}>{correctCount} / {QUESTION_COUNT} correct · {score} points</Text>
        <View style={styles.doneActions}>
          <Pressable style={styles.playAgainBtn} onPress={() => { setAsked(0); setScore(0); setCorrectCount(0); setDone(false); savedRef.current = false; nextQuestion(0); }}>
            <Text style={styles.playAgainBtnText}>Play again</Text>
          </Pressable>
          <Pressable style={styles.exitBtn} onPress={onExit}>
            <Text style={styles.exitBtnText}>Change level</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const ledgers = ledgerSteps(note.step);
  const noteX = 160;
  const noteY = yForStep(note.step);

  return (
    <View style={styles.gameWrap}>
      <View style={styles.hud}>
        <Text style={styles.hudText}>Question {asked + 1} / {QUESTION_COUNT}</Text>
        <Text style={styles.hudText}>Score: {score}</Text>
        <Text style={[styles.hudText, timeLeft <= 3 && { color: colors.danger }]}>{Math.max(0, timeLeft)}s</Text>
      </View>

      <View style={styles.board}>
        <Ionicons name="musical-notes" size={26} color={colors.text} style={{ position: 'absolute', left: 8, top: 60 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.staffLine, { top: BOTTOM_LINE_Y - i * LINE_SPACING, left: STAFF_LEFT, width: STAFF_RIGHT - STAFF_LEFT }]} />
        ))}
        {ledgers.map((s) => (
          <View key={s} style={[styles.staffLine, { top: yForStep(s), left: noteX - 16, width: 32 }]} />
        ))}
        <View
          style={[
            styles.noteHead,
            { left: noteX - 9, top: noteY - 7, backgroundColor: colors.danger, transform: [{ rotate: '-18deg' }] },
          ]}
        />
        <View style={[styles.noteStem, { left: noteX + 8, top: noteY - 38, height: 38, backgroundColor: colors.danger }]} />
      </View>

      <Text style={styles.prompt}>What note is this?</Text>
      <View style={styles.optionsRow}>
        {options.map((letter) => {
          const isPicked = pickedLetter === letter;
          const isCorrectLetter = letter === note.letter;
          const showState = locked && (isPicked || isCorrectLetter);
          return (
            <Pressable
              key={letter}
              style={[
                styles.optionBtn,
                showState && isCorrectLetter && { backgroundColor: colors.success, borderColor: colors.success },
                showState && !isCorrectLetter && isPicked && { backgroundColor: colors.danger, borderColor: colors.danger },
              ]}
              onPress={() => answer(letter)}
              disabled={locked}
            >
              <Text style={[styles.optionBtnText, showState && { color: colors.onPrimary }]}>{letter}</Text>
            </Pressable>
          );
        })}
      </View>
      {locked ? (
        <Text style={[styles.feedback, { color: pickedLetter === note.letter ? colors.success : colors.danger }]}>
          {pickedLetter === note.letter ? 'Correct!' : `Not quite - that was ${note.letter}${note.octave}.`}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14 },
    title: { fontSize: 20, fontFamily: fonts.displayBlack, color: colors.text },
    subtitle: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    tierPicker: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
    sectionTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 24, marginBottom: 4 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 8 },
    leaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    leaderRowMine: { backgroundColor: `${colors.primaryRed}0c`, borderRadius: 10, paddingHorizontal: 8 },
    leaderRank: { width: 22, fontSize: 13, fontFamily: fonts.bodyBold, color: colors.textFaint },
    leaderName: { flex: 1, fontSize: 13.5, fontFamily: fonts.bodyMedium, color: colors.text },
    leaderScore: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    tierBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 16,
    },
    tierBtnText: { flex: 1, fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    gameWrap: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
    hud: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    hudText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.textSoft },
    board: {
      height: 220,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      marginBottom: 16,
      overflow: 'hidden',
    },
    staffLine: { position: 'absolute', height: 1.5, backgroundColor: colors.text },
    noteHead: { position: 'absolute', width: 18, height: 14, borderRadius: 999 },
    noteStem: { position: 'absolute', width: 1.8 },
    prompt: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textFaint, textAlign: 'center', marginBottom: 12 },
    optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    optionBtn: {
      width: 56,
      height: 56,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionBtnText: { fontSize: 18, fontFamily: fonts.displayBlack, color: colors.text },
    feedback: { textAlign: 'center', fontSize: 13, fontFamily: fonts.bodyBold, marginTop: 14 },
    doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 30 },
    doneTitle: { fontSize: 20, fontFamily: fonts.displayBlack, color: colors.text },
    doneText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.textSoft },
    doneActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    playAgainBtn: { backgroundColor: colors.primaryRed, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 },
    playAgainBtnText: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    exitBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 },
    exitBtnText: { fontSize: 13.5, fontFamily: fonts.bodySemiBold, color: colors.text },
  });
}

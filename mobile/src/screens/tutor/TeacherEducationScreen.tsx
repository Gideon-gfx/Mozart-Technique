import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../../api/client';
import * as teacherEdApi from '../../api/teacherEducation';
import type { CertModule, CrosswalkRow, CredentialSubmission, PracticumReview, QuizAssignment, Standing, Tier } from '../../api/teacherEducation';
import BackButton from '../../components/BackButton';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../context/ToastContext';
import type { MainStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'TeacherEducation'>;
type Section = 'assignments' | 'modules' | 'credentials' | 'practicum' | 'tiers';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'assignments', label: 'Assigned to You' },
  { key: 'modules', label: 'Modules' },
  { key: 'credentials', label: 'Credentials' },
  { key: 'practicum', label: 'Practicum' },
  { key: 'tiers', label: 'What Can I Teach?' },
];

// Two equally legitimate paths to every tier (Part 2.1): MT's own
// certification (modules below), or a recognized external credential.
// Advanced/Professional never unlock on points alone - both require a
// human-reviewed practicum submission, surfaced here via the same
// tierEngine.js standing the web portal reads.
export default function TeacherEducationScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [section, setSection] = useState<Section>('assignments');
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStanding = useCallback(() => {
    teacherEdApi.fetchStanding().then((res) => setStanding(res.standing)).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([teacherEdApi.fetchTiers(), teacherEdApi.fetchStanding()])
      .then(([tiersRes, standingRes]) => {
        setTiers(tiersRes.tiers);
        setStanding(standingRes.standing);
      })
      .catch(() => toast('Could not load your standing.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentTier = tiers.find((t) => t.code === standing?.unlockedTier);
  const nextTier = tiers.find((t) => t.code === standing?.nextTier);
  const progressPct = standing && nextTier ? Math.min(1, standing.totalPoints / nextTier.mtPointsFloor) : 1;

  return (
    <View style={styles.screen}>
      <View style={styles.topRow}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Teacher Education</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 30 }} />
      ) : (
        <>
          <View style={styles.standingCard}>
            <View style={styles.standingTopRow}>
              <View>
                <Text style={styles.standingLabel}>Your current tier</Text>
                <Text style={styles.standingTier}>{currentTier?.label || standing?.unlockedTier}</Text>
              </View>
              {standing?.practicumGated ? (
                <View style={styles.gatedBadge}><Text style={styles.gatedBadgeText}>Practicum needed</Text></View>
              ) : null}
            </View>
            {currentTier ? <Text style={styles.canTeach}>Can teach up to: {currentTier.canTeachStudentLevel}</Text> : null}
            <View style={styles.track}><View style={[styles.trackFill, { width: `${progressPct * 100}%` }]} /></View>
            <Text style={styles.nextNote}>
              {nextTier ? `${standing?.totalPoints} pts - ${standing?.pointsToNext} more to reach ${nextTier.label}.` : `${standing?.totalPoints} pts - top tier reached.`}
            </Text>
          </View>

          <View style={styles.chipsRow}>
            {SECTIONS.map((s) => (
              <Pressable key={s.key} style={[styles.chip, section === s.key && styles.chipActive]} onPress={() => setSection(s.key)}>
                <Text style={[styles.chipText, section === s.key && styles.chipTextActive]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {section === 'assignments' ? <AssignmentsSection colors={colors} /> : null}
            {section === 'modules' ? <ModulesSection colors={colors} onPassed={loadStanding} /> : null}
            {section === 'credentials' ? <CredentialsSection colors={colors} /> : null}
            {section === 'practicum' ? <PracticumSection colors={colors} /> : null}
            {section === 'tiers' ? <TiersSection colors={colors} tiers={tiers} /> : null}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function AssignmentsSection({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<QuizAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    teacherEdApi.fetchMyAssignments().then((res) => setItems(res.items)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator color={colors.primaryRed} />;
  if (!items.length) return <Text style={styles.emptyText}>Nothing assigned right now.</Text>;
  return (
    <View style={{ gap: 10 }}>
      {items.map((item) => (
        <View key={item.id} style={styles.rowCard}>
          <Text style={[styles.badge, statusStyle(item.status, colors)]}>{item.status}</Text>
          <Text style={styles.rowTitle}>{item.targetType}: {item.targetId}</Text>
          {item.reason ? <Text style={styles.rowMeta}>{item.reason}</Text> : null}
          {item.dueAt ? <Text style={styles.rowMetaFaint}>Due {new Date(item.dueAt).toLocaleDateString()}</Text> : null}
          {item.status === 'assigned' ? (
            <Pressable style={styles.smallBtn} onPress={() => teacherEdApi.startAssignment(item.id).then(load)}>
              <Text style={styles.smallBtnText}>Start</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function ModulesSection({ colors, onPassed }: { colors: ThemeColors; onPassed: () => void }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [modules, setModules] = useState<CertModule[]>([]);
  const [answers, setAnswers] = useState<Record<string, Record<number, number>>>({});
  const [results, setResults] = useState<Record<string, { passed: boolean; pct: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    teacherEdApi.fetchModules().then((res) => setModules(res.modules)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function pick(code: string, questionId: number, index: number) {
    setAnswers((prev) => ({ ...prev, [code]: { ...(prev[code] || {}), [questionId]: index } }));
  }

  async function submit(module: CertModule) {
    const picked = answers[module.code] || {};
    if (Object.keys(picked).length < module.questions.length) return toast('Answer every question first.', 'error');
    try {
      const res = await teacherEdApi.submitAttempt(module.code, Object.entries(picked).map(([questionId, selectedIndex]) => ({ questionId: Number(questionId), selectedIndex })));
      setResults((prev) => ({ ...prev, [module.code]: { passed: res.attempt.passed, pct: res.attempt.overallPct } }));
      if (res.attempt.passed) onPassed();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not submit.', 'error');
    }
  }

  if (loading) return <ActivityIndicator color={colors.primaryRed} />;
  return (
    <View style={{ gap: 14 }}>
      {modules.map((m) => {
        const result = results[m.code];
        return (
          <View key={m.code} style={styles.rowCard}>
            <View style={styles.cardTopRow}>
              <Text style={styles.rowTitle}>{m.title}</Text>
              <Text style={[styles.badge, m.kind === 'specialist' ? styles.badgePurple : styles.badgeBlue]}>{m.kind}</Text>
            </View>
            {m.resource ? <Text style={styles.rowMeta}>{m.resource.body}</Text> : null}
            {m.questions.map((q, qi) => (
              <View key={q.id} style={{ marginTop: 10 }}>
                <Text style={styles.questionText}>{qi + 1}. {q.text}</Text>
                {q.options.map((opt, oi) => {
                  const selected = answers[m.code]?.[q.id] === oi;
                  return (
                    <Pressable key={oi} style={styles.optionRow} onPress={() => pick(m.code, q.id, oi)}>
                      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={16} color={selected ? colors.primaryRed : colors.textFaint} />
                      <Text style={styles.optionText}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <Pressable style={styles.smallBtn} onPress={() => submit(m)}>
              <Text style={styles.smallBtnText}>Submit answers</Text>
            </Pressable>
            {result ? (
              <Text style={[styles.resultText, { color: result.passed ? colors.success : colors.danger }]}>
                {result.passed ? `Passed - ${Math.round(result.pct * 100)}%` : `Not yet - ${Math.round(result.pct * 100)}%, try again`}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function CredentialsSection({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CrosswalkRow[]>([]);
  const [selected, setSelected] = useState<CrosswalkRow | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [issuingBodyRef, setIssuingBodyRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState<CredentialSubmission[]>([]);

  const loadMine = useCallback(() => {
    teacherEdApi.fetchMyCredentials().then((res) => setMine(res.submissions)).catch(() => {});
  }, []);
  useEffect(() => { loadMine(); }, [loadMine]);
  useEffect(() => {
    const timer = setTimeout(() => {
      teacherEdApi.fetchCrosswalk(query).then((res) => setRows(res.rows.slice(0, 30))).catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  async function submit() {
    if (!selected) return toast('Select the credential you hold.', 'error');
    setSubmitting(true);
    try {
      await teacherEdApi.submitCredential(selected.id, evidenceUrl || undefined, issuingBodyRef || undefined);
      toast('Submitted for review.', 'success');
      setSelected(null);
      setEvidenceUrl('');
      setIssuingBodyRef('');
      loadMine();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not submit.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View>
      <Text style={styles.sectionHint}>Already hold a credential from ABRSM, Trinity, RCM, MUSON, ABGMVM, or another recognized body? Submit it here for MT recognition.</Text>
      <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Search credential (e.g. ABRSM LRSM, TCRG)" placeholderTextColor={colors.textFaint} />
      <View style={{ maxHeight: 180, marginTop: 8 }}>
        <ScrollView>
          {rows.map((r) => (
            <Pressable key={r.id} style={[styles.optionRow, selected?.id === r.id && { backgroundColor: colors.background, borderRadius: 8 }]} onPress={() => setSelected(r)}>
              <Ionicons name={selected?.id === r.id ? 'radio-button-on' : 'radio-button-off'} size={16} color={selected?.id === r.id ? colors.primaryRed : colors.textFaint} />
              <Text style={styles.optionText}>{r.body} - {r.credentialName} ({r.mtPoints} pts)</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <TextInput style={styles.input} value={evidenceUrl} onChangeText={setEvidenceUrl} placeholder="Evidence URL (certificate scan/photo)" placeholderTextColor={colors.textFaint} autoCapitalize="none" />
      <TextInput style={styles.input} value={issuingBodyRef} onChangeText={setIssuingBodyRef} placeholder="Candidate/certificate number (optional)" placeholderTextColor={colors.textFaint} />
      <PrimaryButton title="Submit for review" onPress={submit} loading={submitting} style={{ marginTop: 10, marginBottom: 20 }} />

      <Text style={styles.subheading}>My submissions</Text>
      {mine.length === 0 ? <Text style={styles.emptyText}>Nothing submitted yet.</Text> : mine.map((s) => (
        <View key={s.id} style={styles.rowCard}>
          <Text style={[styles.badge, statusStyle(s.status, colors)]}>{s.status}</Text>
          <Text style={styles.rowTitle}>{s.crosswalkSnapshot.body} - {s.crosswalkSnapshot.credentialName}</Text>
          {s.status === 'verified' ? <Text style={[styles.rowMeta, { color: colors.success }]}>+{s.mtPointsAwarded} MT points awarded</Text> : null}
          {s.reviewNote ? <Text style={styles.rowMeta}>{s.reviewNote}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function PracticumSection({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [stage, setStage] = useState<'advanced_specialist' | 'professional'>('advanced_specialist');
  const [videoUrl, setVideoUrl] = useState('');
  const [lessonPlanUrl, setLessonPlanUrl] = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState<PracticumReview[]>([]);

  const loadMine = useCallback(() => {
    teacherEdApi.fetchMyPracticum().then((res) => setMine(res.reviews)).catch(() => {});
  }, []);
  useEffect(() => { loadMine(); }, [loadMine]);

  async function submit() {
    setSubmitting(true);
    try {
      await teacherEdApi.submitPracticum(stage, videoUrl || undefined, lessonPlanUrl || undefined, outcomeNote || undefined);
      toast('Submitted for review.', 'success');
      setVideoUrl('');
      setLessonPlanUrl('');
      setOutcomeNote('');
      loadMine();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not submit.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View>
      <Text style={styles.sectionHint}>Neither path unlocks Advanced or Professional on its own - both require a reviewed teaching-evidence submission.</Text>
      <View style={styles.chipsRow}>
        <Pressable style={[styles.chip, stage === 'advanced_specialist' && styles.chipActive]} onPress={() => setStage('advanced_specialist')}>
          <Text style={[styles.chipText, stage === 'advanced_specialist' && styles.chipTextActive]}>Advanced-Specialist</Text>
        </Pressable>
        <Pressable style={[styles.chip, stage === 'professional' && styles.chipActive]} onPress={() => setStage('professional')}>
          <Text style={[styles.chipText, stage === 'professional' && styles.chipTextActive]}>Professional</Text>
        </Pressable>
      </View>
      <TextInput style={styles.input} value={videoUrl} onChangeText={setVideoUrl} placeholder="Video URL" placeholderTextColor={colors.textFaint} autoCapitalize="none" />
      <TextInput style={styles.input} value={lessonPlanUrl} onChangeText={setLessonPlanUrl} placeholder="Lesson plan URL" placeholderTextColor={colors.textFaint} autoCapitalize="none" />
      <TextInput style={styles.input} value={outcomeNote} onChangeText={setOutcomeNote} placeholder="Student outcome note" placeholderTextColor={colors.textFaint} />
      <PrimaryButton title="Submit for review" onPress={submit} loading={submitting} style={{ marginTop: 10, marginBottom: 20 }} />

      <Text style={styles.subheading}>My submissions</Text>
      {mine.length === 0 ? <Text style={styles.emptyText}>Nothing submitted yet.</Text> : mine.map((r) => (
        <View key={r.id} style={styles.rowCard}>
          <Text style={[styles.badge, statusStyle(r.status, colors)]}>{r.status}</Text>
          <Text style={styles.rowTitle}>{r.stage.replace('_', ' ')}</Text>
          {r.reviewNote ? <Text style={styles.rowMeta}>{r.reviewNote}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function TiersSection({ colors, tiers }: { colors: ThemeColors; tiers: Tier[] }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.sectionHint}>Mozart Techniques' own policy - shown here in full, not left implicit.</Text>
      {tiers.map((t) => (
        <View key={t.code} style={styles.rowCard}>
          <Text style={styles.rowTitle}>{t.label}</Text>
          <Text style={styles.rowMeta}>Can teach up to: {t.canTeachStudentLevel}</Text>
          <Text style={styles.rowMetaFaint}>Unlocks at {t.mtPointsFloor} MT points</Text>
        </View>
      ))}
    </View>
  );
}

function statusStyle(status: string, colors: ThemeColors) {
  if (status === 'verified' || status === 'passed' || status === 'completed') return { backgroundColor: colors.statusActiveBg, color: colors.statusActiveText };
  if (status === 'rejected' || status === 'overdue') return { backgroundColor: `${colors.danger}18`, color: colors.danger };
  return { backgroundColor: colors.statusPendingBg, color: colors.statusPendingText };
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    topRow: { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { fontSize: 18, fontFamily: fonts.displayBlack, color: colors.text },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    standingCard: { marginHorizontal: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 18, marginBottom: 12 },
    standingTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    standingLabel: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
    standingTier: { fontSize: 20, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 2 },
    gatedBadge: { backgroundColor: colors.statusPendingBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    gatedBadgeText: { fontSize: 10, fontFamily: fonts.bodyBold, color: colors.statusPendingText, textTransform: 'uppercase' },
    canTeach: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textSoft, marginTop: 8 },
    track: { height: 7, borderRadius: 4, backgroundColor: colors.background, overflow: 'hidden', marginTop: 12 },
    trackFill: { height: '100%', backgroundColor: colors.primaryRed, borderRadius: 4 },
    nextNote: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.textSoft, marginTop: 8 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.surface },
    chipActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    chipText: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    chipTextActive: { color: colors.onPrimary },
    sectionHint: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, lineHeight: 18, marginBottom: 12 },
    subheading: { fontSize: 14.5, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 4, marginBottom: 10 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    rowCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginBottom: 4 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rowTitle: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text, marginTop: 4 },
    rowMeta: { fontSize: 12, fontFamily: fonts.body, color: colors.textSoft, marginTop: 4 },
    rowMetaFaint: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 4 },
    badge: { fontSize: 10, fontFamily: fonts.bodyBold, textTransform: 'uppercase', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
    badgeBlue: { backgroundColor: '#DBEAFE', color: '#1D4ED8' },
    badgePurple: { backgroundColor: '#EDE9FE', color: '#6D28D9' },
    questionText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: 6 },
    optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    optionText: { flex: 1, fontSize: 12.5, fontFamily: fonts.body, color: colors.text },
    smallBtn: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: colors.primaryRed, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    smallBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    resultText: { fontSize: 12.5, fontFamily: fonts.bodyBold, marginTop: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 13.5,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.surface,
      marginTop: 8,
    },
  });
}

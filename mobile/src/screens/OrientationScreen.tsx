import { ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { ApiError, resolveMediaUrl } from '../api/client';
import * as orientationApi from '../api/orientation';
import type { OrientationAudience, OrientationPost, OrientationQuestion } from '../api/orientation';
import BackButton from '../components/BackButton';
import PrimaryButton from '../components/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'Orientation'>;

const AUDIENCE_LABELS: Record<string, string> = {
  tutor: 'Tutor orientation',
  student: 'Student orientation',
  organization: 'Organization orientation',
  sponsor: 'Sponsor orientation',
  admin: 'Admin orientation',
  support_agent: 'Support agent orientation',
};

// Same 5-reaction set every chat surface uses (data/reaction-emoji.js) -
// one shared, familiar reaction picker across the whole app.
const REACTIONS = ['👍', '❤️', '😂', '😢', '🙏'];

// Same YouTube-embed detection as orientation-hub.html's own inline script
// - anything else (a direct file, Vimeo, Drive) is handed to the WebView as
// a plain uri, which renders its own native controls either way.
function embedUrl(url: string): string {
  const youtube = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/i);
  return youtube ? `https://www.youtube-nocookie.com/embed/${youtube[1]}` : url;
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Mirrors orientation-hub.html's onboarding content/quiz at the top (one
// real screen per audience, tutor-only questionnaire), plus a genuinely new
// "Updates" feed underneath: dated posts an admin publishes over time,
// grouped by the day they were sent, each reactable with the same 5-emoji
// set as chat. The feed is a separate, additive layer - the one-time
// onboarding material above it is untouched.
export default function OrientationScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audience, setAudience] = useState<OrientationAudience>('student');
  const [content, setContent] = useState<orientationApi.OrientationContent | null>(null);
  const [questions, setQuestions] = useState<OrientationQuestion[]>([]);
  const [posts, setPosts] = useState<OrientationPost[]>([]);
  const [reactTarget, setReactTarget] = useState<OrientationPost | null>(null);

  const load = useCallback(() => {
    return Promise.all([orientationApi.fetchOrientation(), orientationApi.fetchOrientationPosts()])
      .then(([base, feed]) => {
        setAudience(base.audience as OrientationAudience);
        setContent(base.content);
        setQuestions(base.questions);
        setPosts(feed.posts);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your orientation.'));
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function react(post: OrientationPost, emoji: string) {
    const prev = posts;
    // Optimistic toggle, mirroring chat's own reaction UX.
    setPosts((list) =>
      list.map((p) => {
        if (p.id !== post.id) return p;
        const toggledOff = p.myReaction === emoji;
        const reactions = p.reactions.filter((r) => r.userId !== user?.id);
        if (!toggledOff && user) reactions.push({ userId: user.id, emoji });
        return { ...p, reactions, myReaction: toggledOff ? null : emoji };
      }),
    );
    try {
      await orientationApi.reactToOrientationPost(post.id, emoji);
    } catch {
      setPosts(prev);
      toast('Could not react to that post.', 'error');
    }
  }

  async function deletePost(post: OrientationPost) {
    const ok = await confirm({ title: 'Delete this update?', message: post.title, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await orientationApi.deleteOrientationPost(post.id);
      setPosts((list) => list.filter((p) => p.id !== post.id));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete that update.', 'error');
    }
  }

  async function addComment(post: OrientationPost, text: string) {
    try {
      const result = await orientationApi.commentOnOrientationPost(post.id, text);
      setPosts((list) => list.map((p) => (p.id === post.id ? result.post : p)));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not post that comment.', 'error');
    }
  }

  async function removeComment(post: OrientationPost, commentId: number) {
    try {
      const result = await orientationApi.deleteOrientationComment(post.id, commentId);
      setPosts((list) => list.map((p) => (p.id === post.id ? result.post : p)));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete that comment.', 'error');
    }
  }

  // Patches one post's progress fields in place after Finished/quiz-submit,
  // so the checkmark/state persists without a full reload.
  function updatePostProgress(postId: number, patch: Partial<OrientationPost>) {
    setPosts((list) => list.map((p) => (p.id === postId ? { ...p, ...patch } : p)));
  }

  const groups = useMemo(() => {
    const out: { label: string; posts: OrientationPost[] }[] = [];
    posts.forEach((post) => {
      const label = dayLabel(post.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.posts.push(post);
      else out.push({ label, posts: [post] });
    });
    return out;
  }, [posts]);

  const videoUrl = content?.videoUrl ? resolveMediaUrl(content.videoUrl) : null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title} numberOfLines={1}>Orientation</Text>
        <View style={{ width: 42 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.tag}>{AUDIENCE_LABELS[audience] || 'Orientation'}</Text>
          <View style={styles.onboardCard}>
            <Text style={styles.heading}>{content?.title || 'Welcome to Mozart Techniques'}</Text>

            {videoUrl ? (
              <View style={styles.videoBox}>
                <WebView source={{ uri: embedUrl(videoUrl) }} style={styles.webview} allowsFullscreenVideo mediaPlaybackRequiresUserAction={false} javaScriptEnabled />
              </View>
            ) : null}

            <Text style={styles.notes}>
              {content?.notes || 'Your orientation materials will appear here once your administrator publishes them.'}
            </Text>

            {audience === 'tutor' && questions.length ? <OrientationQuiz questions={questions} colors={colors} /> : null}
          </View>

          <Text style={styles.sectionTitle}>Updates</Text>
          {groups.length === 0 ? (
            <Text style={styles.emptyText}>Nothing posted here yet.</Text>
          ) : (
            groups.map((group) => (
              <View key={group.label} style={styles.dateGroup}>
                <View style={styles.dateHeaderRow}>
                  <View style={styles.dateHeaderLine} />
                  <Text style={styles.dateHeaderText}>{group.label}</Text>
                  <View style={styles.dateHeaderLine} />
                </View>
                {group.posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    colors={colors}
                    isAdmin={isAdmin}
                    currentUserId={user?.id}
                    onLongPress={() => setReactTarget(post)}
                    onDelete={() => deletePost(post)}
                    onComment={(text) => addComment(post, text)}
                    onDeleteComment={(commentId) => removeComment(post, commentId)}
                    onUpdateProgress={(patch) => updatePostProgress(post.id, patch)}
                  />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <ReactSheet post={reactTarget} onClose={() => setReactTarget(null)} onReact={react} colors={colors} />
    </View>
  );
}

// Reacting is a long press on the card (same gesture chat bubbles use) -
// it opens ReactSheet's emoji row rather than showing one permanently, so
// the card stays a clean read view. A summary pill (unique emoji + total
// count) shows underneath whenever the post has any reactions, view-only,
// matching chat's own reactionsPill under a bubble.
function PostCard({
  post,
  colors,
  isAdmin,
  currentUserId,
  onLongPress,
  onDelete,
  onComment,
  onDeleteComment,
  onUpdateProgress,
}: {
  post: OrientationPost;
  colors: ThemeColors;
  isAdmin: boolean;
  currentUserId: number | undefined;
  onLongPress: () => void;
  onDelete: () => void;
  onComment: (text: string) => Promise<void>;
  onDeleteComment: (commentId: number) => void;
  onUpdateProgress: (patch: Partial<OrientationPost>) => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const videoUrl = post.videoUrl ? resolveMediaUrl(post.videoUrl) : null;
  const attachmentUrl = post.attachmentUrl ? resolveMediaUrl(post.attachmentUrl) : null;
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await onComment(draft.trim());
      setDraft('');
    } finally {
      setSending(false);
    }
  }

  return (
    <Pressable style={styles.postCard} onLongPress={onLongPress} delayLongPress={280}>
      <View style={styles.postHeaderRow}>
        <Text style={styles.postAuthor}>{post.createdByName}</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.postTime}>{dayLabel(post.createdAt)} · {timeLabel(post.createdAt)}</Text>
        {isAdmin ? (
          <Pressable onPress={onDelete} hitSlop={8} style={{ marginLeft: 10 }}>
            <Ionicons name="trash-outline" size={15} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.postTitleRow}>
        <Text style={styles.postTitle}>{post.title}</Text>
        {post.required ? (
          <View style={[styles.requiredPill, post.done && styles.requiredPillDone]}>
            <Ionicons name={post.done ? 'checkmark-circle' : 'alert-circle'} size={11} color={post.done ? colors.success : colors.statusPendingText} />
            <Text style={[styles.requiredPillText, post.done && { color: colors.success }]}>{post.done ? 'Completed' : 'Required'}</Text>
          </View>
        ) : null}
      </View>
      {videoUrl ? (
        <View style={styles.postVideoBox}>
          <WebView source={{ uri: embedUrl(videoUrl) }} style={styles.webview} allowsFullscreenVideo mediaPlaybackRequiresUserAction={false} javaScriptEnabled />
        </View>
      ) : null}
      {post.notes ? <Text style={styles.postNotes}>{post.notes}</Text> : null}
      {attachmentUrl ? (
        <Pressable style={styles.attachmentRow} onPress={() => Linking.openURL(attachmentUrl)}>
          <Ionicons name="document-attach-outline" size={16} color={colors.primaryRed} />
          <Text style={styles.attachmentName} numberOfLines={1}>{post.attachmentName || 'Attachment'}</Text>
          <Ionicons name="open-outline" size={14} color={colors.textFaint} />
        </Pressable>
      ) : null}

      <OrientationProgress post={post} colors={colors} onUpdateProgress={onUpdateProgress} />

      <View style={styles.postFooterRow}>
        {post.reactions.length ? (
          <View style={[styles.reactionsPill, post.myReaction && styles.reactionsPillActive]}>
            <Text style={styles.reactionsPillText}>
              {Array.from(new Set(post.reactions.map((r) => r.emoji))).join('')}
              {post.reactions.length > 1 ? ` ${post.reactions.length}` : ''}
            </Text>
          </View>
        ) : null}
        <Pressable onPress={() => setCommentsOpen((v) => !v)} hitSlop={6} style={styles.commentToggle}>
          <Ionicons name="chatbubble-outline" size={13} color={colors.textFaint} />
          <Text style={styles.commentToggleText}>{post.comments.length ? `${post.comments.length} comment${post.comments.length > 1 ? 's' : ''}` : 'Comment'}</Text>
        </Pressable>
      </View>

      {commentsOpen ? (
        <View style={styles.commentsBlock}>
          {post.comments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.commentAuthor}>{c.userName}</Text>
                <Text style={styles.commentText}>{c.text}</Text>
              </View>
              {c.userId === currentUserId || isAdmin ? (
                <Pressable onPress={() => onDeleteComment(c.id)} hitSlop={8}>
                  <Ionicons name="close" size={14} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
          ))}
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a comment…"
              placeholderTextColor={colors.textFaint}
              multiline
            />
            <Pressable onPress={send} disabled={sending || !draft.trim()} hitSlop={8} style={styles.commentSendBtn}>
              <Ionicons name="send" size={16} color={draft.trim() ? colors.primaryRed : colors.textFaint} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

// The Finished -> (roll-down quiz, if any) -> score -> retry-until-pass
// flow the owner specified. `post.done`/`finished`/`passed`/`attempts` are
// the server's per-viewer record (survives navigating away and back);
// `phase` here is just this screen visit's in-progress quiz state - a
// failed attempt sends the user back to "content + Finished button"
// (re-clicking Finished is what restarts the MCQs, matching the spec)
// rather than looping straight back into another attempt.
function OrientationProgress({
  post,
  colors,
  onUpdateProgress,
}: {
  post: OrientationPost;
  colors: ThemeColors;
  onUpdateProgress: (patch: Partial<OrientationPost>) => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [phase, setPhase] = useState<'idle' | 'quiz' | 'result'>('idle');
  const [questions, setQuestions] = useState<OrientationQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { passed: false; correct: number; total: number; score: number }
    | { passed: true; correct: number; total: number; score: number; review: orientationApi.OrientationQuizReviewQuestion[] }
    | null
  >(null);

  if (post.done) {
    return (
      <View style={styles.doneRow}>
        <Ionicons name="checkmark-circle" size={16} color={colors.success} />
        <Text style={styles.doneText}>{post.hasQuiz ? 'Completed - quiz passed' : 'Viewed'}</Text>
      </View>
    );
  }

  async function startOrRetry() {
    setBusy(true);
    try {
      await orientationApi.finishOrientationPost(post.id);
      if (!post.hasQuiz) {
        onUpdateProgress({ finished: true, done: true });
        return;
      }
      onUpdateProgress({ finished: true });
      const { questions: fetched } = await orientationApi.fetchOrientationPostQuiz(post.id);
      setQuestions(fetched);
      setQIndex(0);
      setAnswers({});
      setResult(null);
      setPhase('quiz');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not load the quiz.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitQuiz(finalAnswers: Record<number, number>) {
    setBusy(true);
    try {
      const ordered = questions.map((q) => finalAnswers[q.index]);
      const res = await orientationApi.submitOrientationPostQuiz(post.id, ordered);
      setResult(res);
      setPhase('result');
      onUpdateProgress({ finished: true, passed: res.passed, done: res.passed, attempts: post.attempts + 1 });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not submit the quiz.', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'quiz') {
    const q = questions[qIndex];
    if (!q) return null;
    const selected = answers[q.index];
    const isLast = qIndex === questions.length - 1;
    return (
      <View style={styles.quizFlowCard}>
        <Text style={styles.quizFlowProgress}>Question {qIndex + 1} of {questions.length}</Text>
        <Text style={styles.quizFlowQuestion}>{q.question}</Text>
        {q.options.map((option, oi) => (
          <Pressable key={oi} style={styles.optionRow} onPress={() => setAnswers((prev) => ({ ...prev, [q.index]: oi }))}>
            <Ionicons name={selected === oi ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected === oi ? colors.primaryRed : colors.textFaint} />
            <Text style={styles.optionText}>{option}</Text>
          </Pressable>
        ))}
        <PrimaryButton
          title={isLast ? 'Submit' : 'Next'}
          onPress={() => (isLast ? submitQuiz(answers) : setQIndex((i) => i + 1))}
          loading={busy}
          disabled={selected === undefined}
          style={{ marginTop: 12 }}
        />
      </View>
    );
  }

  if (phase === 'result' && result) {
    if (result.passed) {
      return (
        <View style={styles.quizFlowCard}>
          <Text style={[styles.scoreText, { color: colors.success }]}>Passed - {result.correct}/{result.total}</Text>
          {result.review.map((r, i) => (
            <View key={i} style={styles.reviewBlock}>
              <Text style={styles.reviewQuestion}>{i + 1}. {r.question}</Text>
              {r.options.map((opt, oi) => {
                const isCorrect = oi === r.correctIndex;
                const isYours = oi === r.yourAnswer;
                return (
                  <View key={oi} style={styles.reviewOptionRow}>
                    <Ionicons
                      name={isCorrect ? 'checkmark-circle' : isYours ? 'close-circle' : 'ellipse-outline'}
                      size={15}
                      color={isCorrect ? colors.success : isYours ? colors.danger : colors.textFaint}
                    />
                    <Text style={[styles.reviewOptionText, isCorrect && { color: colors.success }, isYours && !isCorrect && { color: colors.danger }]}>{opt}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      );
    }
    return (
      <View style={styles.quizFlowCard}>
        <Text style={[styles.scoreText, { color: colors.danger }]}>Not yet - {result.correct}/{result.total} ({Math.round(result.score * 100)}%, need 70%)</Text>
        <Text style={styles.retryHint}>Review the material above, then try again.</Text>
        <PrimaryButton title="Finished - retake quiz" onPress={() => setPhase('idle')} style={{ marginTop: 10 }} />
      </View>
    );
  }

  return (
    <Pressable style={styles.finishBtn} onPress={startOrRetry} disabled={busy}>
      {busy ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Ionicons name="checkmark" size={16} color={colors.onPrimary} />}
      <Text style={styles.finishBtnText}>{post.attempts > 0 ? "I've reviewed it again" : 'Finished'}</Text>
    </Pressable>
  );
}

// Long-press's popup - the same 5-emoji row chat's MessageActionSheet
// opens on a message long-press, trimmed to just reacting since a post has
// no reply/edit/pin of its own.
function ReactSheet({
  post,
  onClose,
  onReact,
  colors,
}: {
  post: OrientationPost | null;
  onClose: () => void;
  onReact: (post: OrientationPost, emoji: string) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!post) return null;
  return (
    <Modal visible={!!post} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.reactSheetBackdrop} onPress={onClose}>
        <View style={styles.reactSheetRow}>
          {REACTIONS.map((emoji) => {
            const active = post.myReaction === emoji;
            return (
              <Pressable
                key={emoji}
                style={[styles.reactionBtn, active && styles.reactionBtnActive]}
                onPress={() => {
                  onReact(post, emoji);
                  onClose();
                }}
              >
                <Text style={styles.reactSheetEmoji}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}


function OrientationQuiz({ questions, colors }: { questions: OrientationQuestion[]; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ text: string; passed: boolean } | null>(null);

  async function submit() {
    if (Object.keys(answers).length < questions.length) {
      setStatus({ text: 'Answer every question before submitting.', passed: false });
      return;
    }
    setSubmitting(true);
    try {
      const result = await orientationApi.submitTutorOrientation(questions.map((q) => answers[q.index]));
      setStatus({
        text: result.passed ? 'Questionnaire completed successfully.' : 'Please review the material and try again.',
        passed: result.passed,
      });
    } catch (err) {
      setStatus({ text: err instanceof ApiError ? err.message : 'Could not submit questionnaire.', passed: false });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.quizCard}>
      <Text style={styles.quizTitle}>Orientation questionnaire</Text>
      {questions.map((q, qi) => (
        <View key={q.index} style={[styles.questionBlock, qi > 0 && styles.questionDivider]}>
          <Text style={styles.questionText}>{qi + 1}. {q.question}</Text>
          {q.options.map((option, oi) => {
            const selected = answers[q.index] === oi;
            return (
              <Pressable key={oi} style={styles.optionRow} onPress={() => setAnswers((prev) => ({ ...prev, [q.index]: oi }))}>
                <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? colors.primaryRed : colors.textFaint} />
                <Text style={styles.optionText}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <PrimaryButton title="Submit questionnaire" onPress={submit} loading={submitting} style={{ marginTop: 4 }} />
      {status ? (
        <Text style={[styles.statusText, { color: status.passed ? colors.success : colors.danger }]}>{status.text}</Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 14,
      gap: 10,
    },
    title: { flex: 1, fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center' },
    headerBtn: { width: 42, alignItems: 'flex-end' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    tag: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.primaryRed, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
    onboardCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 26,
    },
    heading: { fontSize: 19, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14 },
    videoBox: { aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000', marginBottom: 16 },
    webview: { flex: 1, backgroundColor: '#000' },
    notes: { fontSize: 13.5, fontFamily: fonts.body, color: colors.textSoft, lineHeight: 21 },
    quizCard: {
      backgroundColor: colors.background,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginTop: 18,
    },
    quizTitle: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 10 },
    questionBlock: { paddingVertical: 10 },
    questionDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    questionText: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 8 },
    optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    optionText: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.textSoft },
    statusText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, marginTop: 12, textAlign: 'center' },

    sectionTitle: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 4 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 10 },
    dateGroup: { marginTop: 18 },
    dateHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    dateHeaderLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dateHeaderText: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
    postCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 12,
    },
    postHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    postAuthor: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    postTime: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint },
    postTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
    postTitle: { fontSize: 14.5, fontFamily: fonts.bodyBold, color: colors.text },
    requiredPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.statusPendingBg,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    requiredPillDone: { backgroundColor: `${colors.success}17` },
    requiredPillText: { fontSize: 10, fontFamily: fonts.bodyBold, color: colors.statusPendingText },
    doneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
    doneText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.success },
    finishBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primaryRed,
      borderRadius: 12,
      paddingVertical: 11,
      marginTop: 10,
    },
    finishBtnText: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    quizFlowCard: {
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginTop: 10,
    },
    quizFlowProgress: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
    quizFlowQuestion: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 8 },
    scoreText: { fontSize: 15, fontFamily: fonts.displayBlack },
    retryHint: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 4 },
    reviewBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    reviewQuestion: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 6 },
    reviewOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
    reviewOptionText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textSoft },
    postVideoBox: { aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', marginBottom: 10 },
    postNotes: { fontSize: 13, fontFamily: fonts.body, color: colors.textSoft, lineHeight: 19 },
    attachmentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 10,
      marginTop: 10,
    },
    attachmentName: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    postFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
    reactionsPill: {
      alignSelf: 'flex-start',
      backgroundColor: colors.background,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    reactionsPillActive: { backgroundColor: `${colors.primaryRed}17` },
    reactionsPillText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textSoft },
    commentToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    commentToggleText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textFaint },
    commentsBlock: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 8 },
    commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    commentAuthor: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.text },
    commentText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textSoft, marginTop: 1 },
    commentInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 2 },
    commentInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 12.5,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
      maxHeight: 80,
    },
    commentSendBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    reactSheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
    reactSheetRow: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    reactionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.background,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    reactionBtnActive: { backgroundColor: `${colors.primaryRed}17` },
    reactSheetEmoji: { fontSize: 22 },

    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, maxHeight: '85%' },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    fieldLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 10, marginBottom: 6 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    chipAll: { borderStyle: 'dashed', borderColor: colors.primaryRed },
    chipActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    chipText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
    chipTextActive: { color: colors.onPrimary },
    fieldHint: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: -3, marginBottom: 6 },
    attachmentPicked: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 10,
      backgroundColor: colors.background,
    },
    attachmentPickedName: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    uploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.primaryRed,
      borderStyle: 'dashed',
      borderRadius: 12,
      paddingVertical: 12,
    },
    uploadBtnText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.primaryRed },
    requiredRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 12,
      marginTop: 14,
    },
    requiredLabel: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    requiredHint: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2, lineHeight: 15 },
    quizHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 6 },
    questionCard: {
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 10,
      gap: 8,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    optionInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 7,
      fontSize: 12.5,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
    },
    textarea: { minHeight: 80, textAlignVertical: 'top' },
  });
}

import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import * as adminApi from '../../api/admin';
import type { AdminLibraryItem, AdminOrientationQuestion } from '../../api/admin';
import { ApiError } from '../../api/client';
import * as orientationApi from '../../api/orientation';
import type { OrientationAudience, OrientationPost, OrientationQuizDraftQuestion } from '../../api/orientation';
import * as pollsApi from '../../api/polls';
import type { AdminPoll } from '../../api/polls';
import { fetchTaxonomy } from '../../api/tutors';
import AdminHeader from '../../components/AdminHeader';
import CollapsibleSidebar from '../../components/CollapsibleSidebar';
import PrimaryButton from '../../components/PrimaryButton';
import ScreenWatermark from '../../components/ScreenWatermark';
import { useToast } from '../../context/ToastContext';
import type { AdminTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<AdminTabParamList, 'EducatorTools'>;
type Section = 'orientation' | 'library' | 'polls';

const SECTIONS: { key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'orientation', label: 'Orientation', icon: 'compass-outline' },
  { key: 'library', label: 'Technique Library', icon: 'library-outline' },
  { key: 'polls', label: 'Polls', icon: 'stats-chart-outline' },
];

const AUDIENCES = ['tutor', 'student', 'admin', 'sponsor', 'organization', 'support_agent'];

// Content/quality tooling, not user administration - mirrors admin.html's
// live Educator Tools panel (Tutor Orientation + Technique Video Library;
// the Subject Curriculum & Evaluations card stays out here too, matching
// the web app's own deliberate CSS-hidden decision - it's not dead, just
// not part of the current live surface on either platform).
export default function AdminEducatorToolsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [section, setSection] = useState<Section>('orientation');

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <AdminHeader
        title="Educator Tools"
        onBack={() => navigation.navigate('Analytics')}
        onNotifications={() => navigation.getParent()?.navigate('Notifications')}
        onProfile={() => navigation.getParent()?.navigate('Profile')}
      />
      <CollapsibleSidebar sections={SECTIONS} activeKey={section} onSelect={(key) => setSection(key as Section)}>
        <View style={styles.content}>
          {section === 'orientation' ? <OrientationSection colors={colors} /> : section === 'library' ? <LibrarySection colors={colors} /> : <PollsSection colors={colors} />}
        </View>
      </CollapsibleSidebar>
    </View>
  );
}

function SectionScroll({ children, colors }: { children: React.ReactNode; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <ScrollView contentContainerStyle={styles.sectionContent} showsVerticalScrollIndicator={false}>{children}</ScrollView>;
}

function OrientationSection({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [audience, setAudience] = useState('tutor');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [questions, setQuestions] = useState<AdminOrientationQuestion[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback((aud: string) => {
    setLoading(true);
    adminApi
      .fetchAdminOrientation(aud)
      .then((res) => {
        setTitle(res.content?.title || '');
        setVideoUrl(res.content?.videoUrl || '');
        setNotes(res.content?.notes || '');
        setQuestions(res.questions || []);
      })
      .catch(() => toast('Could not load orientation content.', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      load(audience);
    }, [load, audience]),
  );

  function updateQuestion(index: number, patch: Partial<AdminOrientationQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function updateOption(qIndex: number, oIndex: number, value: string) {
    setQuestions((prev) => prev.map((q, i) => (i === qIndex ? { ...q, options: q.options.map((o, j) => (j === oIndex ? value : o)) } : q)));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, { question: '', options: ['', '', '', ''], correctIndex: 0 }]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  async function pickVideoFile() {
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true });
    } catch {
      toast('Could not open the file picker. Try again in a moment.', 'error');
      return;
    }
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const uploaded = await adminApi.uploadAdminOrientationVideo({ uri: asset.uri, name: asset.name, type: asset.mimeType || 'video/mp4' });
      setVideoUrl(uploaded.url);
      toast('Orientation video uploaded.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await adminApi.saveAdminOrientation({ audience, title, videoUrl, notes, questions });
      toast('Saved.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save orientation content.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionHeading}>Tutor Orientation</Text>
      <View style={styles.chipsRow}>
        {AUDIENCES.map((a) => (
          <Pressable key={a} style={[styles.chip, audience === a && styles.chipActive]} onPress={() => setAudience(a)}>
            <Text style={[styles.chipText, audience === a && styles.chipTextActive]}>{a}</Text>
          </Pressable>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : (
        <SectionScroll colors={colors}>
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Orientation title" placeholderTextColor={colors.textFaint} />
          <Text style={styles.fieldLabel}>Video URL</Text>
          <TextInput style={styles.input} value={videoUrl} onChangeText={setVideoUrl} placeholder="https://..." placeholderTextColor={colors.textFaint} autoCapitalize="none" />
          <Text style={styles.orText}>or</Text>
          <Pressable style={styles.filePickBtn} onPress={pickVideoFile} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.primaryRed} />
            ) : (
              <Ionicons name="film-outline" size={16} color={colors.primaryRed} />
            )}
            <Text style={styles.filePickBtnText}>{uploading ? 'Uploading...' : 'Upload local video'}</Text>
          </Pressable>
          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput style={[styles.input, styles.textarea]} value={notes} onChangeText={setNotes} placeholder="Notes" placeholderTextColor={colors.textFaint} multiline />

          <View style={styles.quizHeaderRow}>
            <Text style={styles.fieldLabel}>Quiz questions</Text>
            <Pressable onPress={addQuestion} hitSlop={8}>
              <Ionicons name="add-circle" size={22} color={colors.primaryRed} />
            </Pressable>
          </View>
          {questions.map((q, qi) => (
            <View key={qi} style={styles.questionCard}>
              <View style={styles.cardTopRow}>
                <TextInput style={[styles.input, { flex: 1 }]} value={q.question} onChangeText={(v) => updateQuestion(qi, { question: v })} placeholder={`Question ${qi + 1}`} placeholderTextColor={colors.textFaint} />
                <Pressable onPress={() => removeQuestion(qi)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
              {q.options.map((opt, oi) => (
                <Pressable key={oi} style={styles.optionRow} onPress={() => updateQuestion(qi, { correctIndex: oi })}>
                  <Ionicons name={q.correctIndex === oi ? 'radio-button-on' : 'radio-button-off'} size={16} color={q.correctIndex === oi ? colors.primaryRed : colors.textFaint} />
                  <TextInput style={styles.optionInput} value={opt} onChangeText={(v) => updateOption(qi, oi, v)} placeholder={`Option ${oi + 1}`} placeholderTextColor={colors.textFaint} />
                </Pressable>
              ))}
            </View>
          ))}
          <PrimaryButton title="Save orientation" onPress={save} loading={saving} style={{ marginTop: 18, marginBottom: 30 }} />

          <OrientationUpdatesPanel colors={colors} />
        </SectionScroll>
      )}
    </View>
  );
}

// Dated, audience-selectable announcements - separate from the one-time
// primer above. Lives here (the admin console) rather than on the shared
// Orientation screen everyone views, since that screen is a pure viewer -
// this is the only place the "who's selected sees a pop-up" upload flow
// should be reachable from.
function OrientationUpdatesPanel({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast, confirm } = useToast();
  const [audiences, setAudiences] = useState<OrientationAudience[]>(['tutor']);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [required, setRequired] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<OrientationQuizDraftQuestion[]>([]);
  const [posting, setPosting] = useState(false);
  const [sentPosts, setSentPosts] = useState<OrientationPost[]>([]);
  const [loadingSent, setLoadingSent] = useState(true);

  const loadSent = useCallback(() => {
    orientationApi
      .fetchAdminOrientationPosts()
      .then((res) => setSentPosts(res.posts))
      .catch(() => {})
      .finally(() => setLoadingSent(false));
  }, []);

  useFocusEffect(useCallback(() => { loadSent(); }, [loadSent]));

  const allSelected = AUDIENCES.every((a) => audiences.includes(a as OrientationAudience));

  function toggleAudience(value: OrientationAudience) {
    setAudiences((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function toggleAll() {
    setAudiences(allSelected ? [] : (AUDIENCES as OrientationAudience[]));
  }

  function updatePostQuestion(index: number, patch: Partial<OrientationQuizDraftQuestion>) {
    setQuizQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function updatePostOption(qIndex: number, oIndex: number, value: string) {
    setQuizQuestions((prev) => prev.map((q, i) => (i === qIndex ? { ...q, options: q.options.map((o, j) => (j === oIndex ? value : o)) } : q)));
  }

  async function pickAttachment() {
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    } catch {
      toast('Could not open the file picker. Try again in a moment.', 'error');
      return;
    }
    if (result.canceled || !result.assets[0]) return;
    const picked = result.assets[0];
    setAttaching(true);
    try {
      const uploaded = await orientationApi.uploadOrientationAttachment({ uri: picked.uri, name: picked.name, type: picked.mimeType || 'application/octet-stream' });
      setAttachment({ url: uploaded.url, name: uploaded.name });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not upload that file.', 'error');
    } finally {
      setAttaching(false);
    }
  }

  async function pickPostVideo() {
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true });
    } catch {
      toast('Could not open the file picker. Try again in a moment.', 'error');
      return;
    }
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setAttaching(true);
    try {
      const uploaded = await adminApi.uploadAdminOrientationVideo({ uri: asset.uri, name: asset.name, type: asset.mimeType || 'video/mp4' });
      setVideoUrl(uploaded.url);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed.', 'error');
    } finally {
      setAttaching(false);
    }
  }

  async function post() {
    if (!title.trim()) return toast('Enter a title.', 'error');
    if (!audiences.length) return toast('Select at least one dashboard to send this to.', 'error');
    setPosting(true);
    try {
      const validQuestions = quizQuestions.filter((q) => q.question.trim() && q.options.every((o) => o.trim()));
      const result = await orientationApi.createOrientationPost({
        audiences,
        title: title.trim(),
        notes: notes.trim() || undefined,
        videoUrl: videoUrl.trim() || undefined,
        attachmentUrl: attachment?.url,
        attachmentName: attachment?.name,
        required,
        questions: validQuestions.length ? validQuestions : undefined,
      });
      const targets = result.posts.length === AUDIENCES.length ? 'everyone' : result.posts.map((p) => p.audience).join(', ');
      toast(`Posted to ${targets}.`, 'success');
      setTitle('');
      setNotes('');
      setVideoUrl('');
      setAttachment(null);
      setRequired(false);
      setQuizQuestions([]);
      loadSent();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not post that update.', 'error');
    } finally {
      setPosting(false);
    }
  }

  async function removePost(post: OrientationPost) {
    const ok = await confirm({ title: 'Delete this update?', message: post.title, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await orientationApi.deleteOrientationPost(post.id);
      setSentPosts((list) => list.filter((p) => p.id !== post.id));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete that update.', 'error');
    }
  }

  return (
    <View style={styles.updatesPanel}>
      <Text style={styles.sectionHeading}>Orientation Updates</Text>
      <Text style={styles.panelHint}>Dated announcements people see as a pop-up on their dashboard and in their Orientation screen. Separate from the one-time primer above.</Text>

      <Text style={styles.fieldLabel}>Send to (select one or more)</Text>
      <View style={styles.chipsRow}>
        {AUDIENCES.map((a) => {
          const active = audiences.includes(a as OrientationAudience);
          return (
            <Pressable key={a} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleAudience(a as OrientationAudience)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{a}</Text>
            </Pressable>
          );
        })}
        <Pressable style={[styles.chip, styles.chipAll, allSelected && styles.chipActive]} onPress={toggleAll}>
          <Text style={[styles.chipText, allSelected && styles.chipTextActive]}>All</Text>
        </Pressable>
      </View>

      <Text style={styles.fieldLabel}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Studio etiquette update" placeholderTextColor={colors.textFaint} />
      <Text style={styles.fieldLabel}>Notes</Text>
      <TextInput style={[styles.input, styles.textarea]} value={notes} onChangeText={setNotes} placeholder="What do they need to know?" placeholderTextColor={colors.textFaint} multiline />
      <Text style={styles.fieldLabel}>Video URL</Text>
      <TextInput style={styles.input} value={videoUrl} onChangeText={setVideoUrl} placeholder="https://..." placeholderTextColor={colors.textFaint} autoCapitalize="none" />
      <Text style={styles.orText}>or</Text>
      <Pressable style={styles.filePickBtn} onPress={pickPostVideo} disabled={attaching}>
        <Ionicons name="film-outline" size={16} color={colors.primaryRed} />
        <Text style={styles.filePickBtnText}>Upload local video</Text>
      </Pressable>

      <Text style={styles.fieldLabel}>Attachment - any file (document, letter, image, PDF, anything)</Text>
      {attachment ? (
        <View style={styles.attachmentPicked}>
          <Ionicons name="document-attach-outline" size={16} color={colors.primaryRed} />
          <Text style={styles.rowTitle} numberOfLines={1}>{attachment.name}</Text>
          <Pressable onPress={() => setAttachment(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textFaint} />
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.filePickBtn} onPress={pickAttachment} disabled={attaching}>
          {attaching ? <ActivityIndicator size="small" color={colors.primaryRed} /> : <Ionicons name="cloud-upload-outline" size={16} color={colors.primaryRed} />}
          <Text style={styles.filePickBtnText}>{attaching ? 'Uploading...' : 'Upload a file'}</Text>
        </Pressable>
      )}

      <Pressable style={styles.requiredRow} onPress={() => setRequired((r) => !r)}>
        <Ionicons name={required ? 'checkbox' : 'square-outline'} size={20} color={required ? colors.primaryRed : colors.textFaint} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Require this to be completed</Text>
          <Text style={styles.rowMeta}>
            {quizQuestions.length ? 'Must be passed (70%+) - ' : 'Must at least be viewed ("Finished" tapped) - '}
            tutors are blocked from withdrawing, everyone else gets a reminder until they do.
          </Text>
        </View>
      </Pressable>

      <View style={styles.quizHeaderRow}>
        <Text style={styles.fieldLabel}>Quiz questions (optional)</Text>
        <Pressable onPress={() => setQuizQuestions((prev) => [...prev, { question: '', options: ['', '', '', ''], correctIndex: 0 }])} hitSlop={8}>
          <Ionicons name="add-circle" size={22} color={colors.primaryRed} />
        </Pressable>
      </View>
      {quizQuestions.map((q, qi) => (
        <View key={qi} style={styles.questionCard}>
          <View style={styles.cardTopRow}>
            <TextInput style={[styles.input, { flex: 1 }]} value={q.question} onChangeText={(v) => updatePostQuestion(qi, { question: v })} placeholder={`Question ${qi + 1}`} placeholderTextColor={colors.textFaint} />
            <Pressable onPress={() => setQuizQuestions((prev) => prev.filter((_, i) => i !== qi))} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          </View>
          {q.options.map((opt, oi) => (
            <Pressable key={oi} style={styles.optionRow} onPress={() => updatePostQuestion(qi, { correctIndex: oi })}>
              <Ionicons name={q.correctIndex === oi ? 'radio-button-on' : 'radio-button-off'} size={16} color={q.correctIndex === oi ? colors.primaryRed : colors.textFaint} />
              <TextInput style={styles.optionInput} value={opt} onChangeText={(v) => updatePostOption(qi, oi, v)} placeholder={`Option ${oi + 1}`} placeholderTextColor={colors.textFaint} />
            </Pressable>
          ))}
        </View>
      ))}

      <PrimaryButton title="Post update" onPress={post} loading={posting} style={{ marginTop: 16, marginBottom: 24 }} />

      <Text style={styles.sectionHeading}>Sent updates</Text>
      {loadingSent ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 10 }} />
      ) : sentPosts.length === 0 ? (
        <Text style={styles.emptyText}>Nothing sent yet.</Text>
      ) : (
        sentPosts.map((p) => (
          <View key={p.id} style={[styles.rowCard, styles.rowCardColumn, { marginBottom: 10 }]}>
            <View style={styles.cardTopRow}>
              <Text style={styles.rowTitle} numberOfLines={1}>{p.title}</Text>
              <Pressable onPress={() => removePost(p)} hitSlop={8}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </Pressable>
            </View>
            <Text style={styles.rowMeta}>
              {p.audience}{p.required ? ' · Required' : ''}{p.hasQuiz ? ' · Quiz' : ''} · {(p.reactions || []).length} reactions · {(p.comments || []).length} comments
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function LibrarySection({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast, confirm } = useToast();
  const [items, setItems] = useState<AdminLibraryItem[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [genresList, setGenresList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [editItem, setEditItem] = useState<AdminLibraryItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editCategory, setEditCategory] = useState<string | null>(null);
  const [editGenre, setEditGenre] = useState<string | null>(null);
  const [replaceItem, setReplaceItem] = useState<AdminLibraryItem | null>(null);
  const [replaceUrl, setReplaceUrl] = useState('');
  const [savingModal, setSavingModal] = useState(false);

  const load = useCallback(() => {
    return adminApi
      .fetchAdminLibrary()
      .then((res) => setItems(res.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the library.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      fetchTaxonomy()
        .then((res) => {
          setSubjects(res.subjects);
          setGenresList(res.genres);
        })
        .catch(() => {});
    }, []),
  );

  async function pickVideoFile() {
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true });
    } catch {
      toast('Could not open the file picker. Try again in a moment.', 'error');
      return;
    }
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const uploaded = await adminApi.uploadAdminLibraryVideo({ uri: asset.uri, name: asset.name, type: asset.mimeType || 'video/mp4' });
      setUrl(uploaded.url);
      setPickedFile({ uri: asset.uri, name: asset.name, type: asset.mimeType || 'video/mp4' });
      toast('Uploaded - now add it to the library.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed.', 'error');
    } finally {
      setUploading(false);
    }
  }

  const visibleItems = items.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [item.title, item.category, item.genre].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  async function addItem() {
    if (!title.trim() || !url.trim()) {
      toast('Title and a link or uploaded file are required.', 'error');
      return;
    }
    setAdding(true);
    try {
      await adminApi.createAdminLibraryItem({ title: title.trim(), url: url.trim(), category: category || undefined, genre: genre || undefined, isFile: Boolean(pickedFile) });
      setTitle('');
      setUrl('');
      setCategory(null);
      setGenre(null);
      setPickedFile(null);
      toast('Added.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not add that clip.', 'error');
    } finally {
      setAdding(false);
    }
  }

  async function toggleStatus(item: AdminLibraryItem) {
    setBusyId(item.id);
    try {
      await adminApi.setAdminLibraryItemStatus(item.id, item.status === 'active' ? 'broken' : 'active');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update that item.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: AdminLibraryItem) {
    const ok = await confirm({ title: 'Delete clip?', message: item.title, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await adminApi.deleteAdminLibraryItem(item.id);
      toast('Deleted.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete that item.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(item: AdminLibraryItem) {
    setEditItem(item);
    setEditTitle(item.title);
    setEditUrl(item.url);
    setEditCategory(item.category || null);
    setEditGenre(item.genre || null);
  }

  async function saveEdit() {
    if (!editItem) return;
    if (!editTitle.trim() || !editUrl.trim()) {
      toast('Title and link are required.', 'error');
      return;
    }
    setSavingModal(true);
    try {
      await adminApi.updateAdminLibraryItem(editItem.id, {
        title: editTitle.trim(),
        url: editUrl.trim(),
        category: editCategory || undefined,
        genre: editGenre || undefined,
        isFile: editItem.isFile,
      });
      toast('Video updated.', 'success');
      setEditItem(null);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update that clip.', 'error');
    } finally {
      setSavingModal(false);
    }
  }

  function openReplace(item: AdminLibraryItem) {
    setReplaceItem(item);
    setReplaceUrl(item.url);
  }

  async function saveReplace() {
    if (!replaceItem) return;
    if (!replaceUrl.trim()) {
      toast('Enter a link.', 'error');
      return;
    }
    setSavingModal(true);
    try {
      await adminApi.updateAdminLibraryItem(replaceItem.id, { url: replaceUrl.trim(), isFile: false });
      toast('Link replaced.', 'success');
      setReplaceItem(null);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not replace that link.', 'error');
    } finally {
      setSavingModal(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionHeading}>Technique Video Library</Text>
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <SectionScroll colors={colors}>
          <View style={styles.addCard}>
            <Text style={styles.fieldLabel}>Subject</Text>
            <View style={styles.chipsRow}>
              <Pressable style={[styles.chip, !category && styles.chipActive]} onPress={() => setCategory(null)}>
                <Text style={[styles.chipText, !category && styles.chipTextActive]}>Any</Text>
              </Pressable>
              {subjects.map((s) => (
                <Pressable key={s} style={[styles.chip, category === s && styles.chipActive]} onPress={() => setCategory(s)}>
                  <Text style={[styles.chipText, category === s && styles.chipTextActive]}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Genre</Text>
            <View style={styles.chipsRow}>
              <Pressable style={[styles.chip, !genre && styles.chipActive]} onPress={() => setGenre(null)}>
                <Text style={[styles.chipText, !genre && styles.chipTextActive]}>Any</Text>
              </Pressable>
              {genresList.map((g) => (
                <Pressable key={g} style={[styles.chip, genre === g && styles.chipActive]} onPress={() => setGenre(g)}>
                  <Text style={[styles.chipText, genre === g && styles.chipTextActive]}>{g}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={colors.textFaint} />
            <Text style={styles.fieldLabel}>Link</Text>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={(v) => { setUrl(v); if (v) setPickedFile(null); }}
              placeholder="Link (or upload below)"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
            />
            <Text style={styles.orText}>or</Text>
            <Pressable style={styles.filePickBtn} onPress={pickVideoFile} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.primaryRed} />
              ) : (
                <Ionicons name="film-outline" size={16} color={colors.primaryRed} />
              )}
              <Text style={styles.filePickBtnText}>{uploading ? 'Uploading...' : pickedFile ? pickedFile.name : 'Choose a video file'}</Text>
            </Pressable>
            <PrimaryButton title="Add to Library" onPress={addItem} loading={adding} style={{ marginTop: 10 }} />
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={15} color={colors.textFaint} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search title, subject or genre"
              placeholderTextColor={colors.textFaint}
            />
          </View>

          {visibleItems.length === 0 ? (
            <Text style={styles.emptyText}>{items.length === 0 ? 'No clips yet.' : 'No clips match.'}</Text>
          ) : (
            visibleItems.map((item, i) => (
              <View key={item.id} style={[styles.rowCard, styles.rowCardColumn, i > 0 && { marginTop: 10 }]}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.title}{item.isFile ? ' (uploaded)' : ''}</Text>
                  <View style={[styles.badge, item.status === 'active' ? styles.badgeActive : styles.badgeDanger]}>
                    <Text style={[styles.badgeText, item.status === 'active' ? styles.badgeTextActive : styles.badgeTextDanger]}>{item.status}</Text>
                  </View>
                </View>
                <Text style={styles.rowMeta}>{item.category || 'Any'}{item.genre ? ` · ${item.genre}` : ''}</Text>
                <View style={styles.actionsRow}>
                  <Pressable style={styles.actionBtnSecondary} onPress={() => Linking.openURL(item.url)}>
                    <Text style={styles.actionBtnTextSecondary}>Open</Text>
                  </Pressable>
                  <Pressable style={styles.actionBtnSecondary} onPress={() => openEdit(item)}>
                    <Text style={styles.actionBtnTextSecondary}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.actionBtnSecondary} onPress={() => openReplace(item)}>
                    <Text style={styles.actionBtnTextSecondary}>Replace Link</Text>
                  </Pressable>
                  <Pressable style={styles.actionBtnSecondary} onPress={() => toggleStatus(item)} disabled={busyId === item.id}>
                    <Text style={styles.actionBtnTextSecondary}>{item.status === 'active' ? 'Mark broken' : 'Mark active'}</Text>
                  </Pressable>
                  <Pressable style={styles.deleteIconBtn} onPress={() => remove(item)} disabled={busyId === item.id}>
                    {busyId === item.id ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="trash-outline" size={16} color={colors.danger} />}
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </SectionScroll>
      )}

      <Modal visible={!!editItem} transparent animationType="fade" onRequestClose={() => setEditItem(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditItem(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Edit clip</Text>
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput style={styles.input} value={editTitle} onChangeText={setEditTitle} placeholder="Title" placeholderTextColor={colors.textFaint} />
              <Text style={styles.fieldLabel}>Link</Text>
              <TextInput style={styles.input} value={editUrl} onChangeText={setEditUrl} placeholder="https://..." placeholderTextColor={colors.textFaint} autoCapitalize="none" />
              <Text style={styles.fieldLabel}>Subject</Text>
              <View style={styles.chipsRow}>
                <Pressable style={[styles.chip, !editCategory && styles.chipActive]} onPress={() => setEditCategory(null)}>
                  <Text style={[styles.chipText, !editCategory && styles.chipTextActive]}>Any</Text>
                </Pressable>
                {subjects.map((s) => (
                  <Pressable key={s} style={[styles.chip, editCategory === s && styles.chipActive]} onPress={() => setEditCategory(s)}>
                    <Text style={[styles.chipText, editCategory === s && styles.chipTextActive]}>{s}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Genre</Text>
              <View style={styles.chipsRow}>
                <Pressable style={[styles.chip, !editGenre && styles.chipActive]} onPress={() => setEditGenre(null)}>
                  <Text style={[styles.chipText, !editGenre && styles.chipTextActive]}>Any</Text>
                </Pressable>
                {genresList.map((g) => (
                  <Pressable key={g} style={[styles.chip, editGenre === g && styles.chipActive]} onPress={() => setEditGenre(g)}>
                    <Text style={[styles.chipText, editGenre === g && styles.chipTextActive]}>{g}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={[styles.actionBtnSecondary, { flex: 1, alignItems: 'center' }]} onPress={() => setEditItem(null)}>
                <Text style={styles.actionBtnTextSecondary}>Cancel</Text>
              </Pressable>
              <PrimaryButton title="Save" onPress={saveEdit} loading={savingModal} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!replaceItem} transparent animationType="fade" onRequestClose={() => setReplaceItem(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setReplaceItem(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Replace link</Text>
            <Text style={styles.fieldLabel}>New link for {replaceItem?.title}</Text>
            <TextInput style={styles.input} value={replaceUrl} onChangeText={setReplaceUrl} placeholder="https://..." placeholderTextColor={colors.textFaint} autoCapitalize="none" />
            <View style={styles.modalActions}>
              <Pressable style={[styles.actionBtnSecondary, { flex: 1, alignItems: 'center' }]} onPress={() => setReplaceItem(null)}>
                <Text style={styles.actionBtnTextSecondary}>Cancel</Text>
              </Pressable>
              <PrimaryButton title="Save" onPress={saveReplace} loading={savingModal} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// One-off, no-correct-answer questions broadcast to every signed-in user,
// once each, wherever they happen to be on web or the app. Separate from
// the Orientation quiz questions above, which are graded and audience-
// scoped - a poll here has no right answer and always goes to everyone.
function PollsSection({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast, confirm } = useToast();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [sending, setSending] = useState(false);
  const [polls, setPolls] = useState<AdminPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    return pollsApi.fetchAdminPolls()
      .then((res) => setPolls(res.polls))
      .catch(() => toast('Could not load polls.', 'error'));
  }, [toast]);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));

  function updateOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  async function send() {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) return toast('Enter a question.', 'error');
    if (cleanOptions.length < 2) return toast('Add at least 2 options.', 'error');
    setSending(true);
    try {
      await pollsApi.createPoll(question.trim(), cleanOptions);
      toast('Poll sent.', 'success');
      setQuestion('');
      setOptions(['', '', '', '']);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send that poll.', 'error');
    } finally {
      setSending(false);
    }
  }

  async function close(poll: AdminPoll) {
    setBusyId(poll.id);
    try {
      await pollsApi.closePoll(poll.id);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not close that poll.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(poll: AdminPoll) {
    const ok = await confirm({ title: 'Delete this poll?', message: poll.question, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    setBusyId(poll.id);
    try {
      await pollsApi.deletePoll(poll.id);
      toast('Deleted.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete that poll.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionHeading}>Popup Polls</Text>
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : (
        <SectionScroll colors={colors}>
          <Text style={styles.panelHint}>
            A one-off question with no right answer - pops up once on whoever's screen it lands on (web and app), for every signed-in user.
          </Text>
          <Text style={styles.fieldLabel}>Question</Text>
          <TextInput
            style={styles.input}
            value={question}
            onChangeText={setQuestion}
            placeholder="e.g. Which of these is a sign a piece is too difficult?"
            placeholderTextColor={colors.textFaint}
            multiline
          />
          <View style={styles.quizHeaderRow}>
            <Text style={styles.fieldLabel}>Options</Text>
            <Pressable onPress={() => setOptions((prev) => [...prev, ''])} hitSlop={8}>
              <Ionicons name="add-circle" size={22} color={colors.primaryRed} />
            </Pressable>
          </View>
          {options.map((opt, i) => (
            <View key={i} style={styles.optionRow}>
              <TextInput
                style={styles.optionInput}
                value={opt}
                onChangeText={(v) => updateOption(i, v)}
                placeholder={`Option ${i + 1}`}
                placeholderTextColor={colors.textFaint}
              />
              {options.length > 2 ? (
                <Pressable onPress={() => removeOption(i)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
          ))}
          <PrimaryButton title="Send Poll" onPress={send} loading={sending} style={{ marginTop: 16, marginBottom: 24 }} />

          <Text style={styles.sectionHeading}>Sent polls</Text>
          {polls.length === 0 ? (
            <Text style={styles.emptyText}>No polls sent yet.</Text>
          ) : (
            polls.map((poll, i) => {
              const maxCount = Math.max(1, ...poll.counts);
              return (
                <View key={poll.id} style={[styles.rowCard, styles.rowCardColumn, i > 0 && { marginTop: 10 }]}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{poll.question}</Text>
                    <View style={[styles.badge, poll.active ? styles.badgeActive : styles.badgeDanger]}>
                      <Text style={[styles.badgeText, poll.active ? styles.badgeTextActive : styles.badgeTextDanger]}>{poll.active ? 'active' : 'closed'}</Text>
                    </View>
                  </View>
                  <Text style={styles.rowMeta}>{poll.totalResponses} answered · {poll.totalSeen} seen</Text>
                  {poll.options.map((opt, oi) => {
                    const count = poll.counts[oi] || 0;
                    const pct = Math.round((count / maxCount) * 100);
                    return (
                      <View key={oi} style={{ marginTop: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={[styles.rowMeta, { flex: 1 }]} numberOfLines={1}>{opt}</Text>
                          <Text style={styles.rowMeta}>{count}</Text>
                        </View>
                        <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.background, overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${pct}%`, backgroundColor: colors.primaryRed, borderRadius: 3 }} />
                        </View>
                      </View>
                    );
                  })}
                  <View style={styles.actionsRow}>
                    {poll.active ? (
                      <Pressable style={styles.actionBtnSecondary} onPress={() => close(poll)} disabled={busyId === poll.id}>
                        <Text style={styles.actionBtnTextSecondary}>Close</Text>
                      </Pressable>
                    ) : null}
                    <Pressable style={styles.deleteIconBtn} onPress={() => remove(poll)} disabled={busyId === poll.id}>
                      {busyId === poll.id ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="trash-outline" size={16} color={colors.danger} />}
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </SectionScroll>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12 },
    title: { fontSize: 20, fontFamily: fonts.displayBlack, color: colors.text },
    shell: { flex: 1, flexDirection: 'row' },
    sidebar: { flexGrow: 0, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border },
    sidebarOpen: { width: 160 },
    sidebarClosed: { width: 60 },
    sidebarToggle: { alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    sidebarContent: { paddingVertical: 10, paddingHorizontal: 8, gap: 6 },
    sidebarItem: { alignItems: 'center', gap: 6, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 6 },
    sidebarItemOpen: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 12 },
    sidebarItemActive: { backgroundColor: colors.primaryRed },
    sidebarItemText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center', lineHeight: 15, flexShrink: 1 },
    sidebarItemTextActive: { color: colors.onPrimary },
    content: { flex: 1, padding: 16 },
    sectionContent: { paddingBottom: 30 },
    sectionHeading: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 10 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center', marginTop: 20 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.surface },
    chipActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    chipText: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.text, textTransform: 'capitalize' },
    chipTextActive: { color: colors.onPrimary },
    chipAll: { borderStyle: 'dashed', borderColor: colors.primaryRed },
    updatesPanel: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 26, paddingTop: 22 },
    panelHint: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginBottom: 4, lineHeight: 17 },
    requiredRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.background, borderRadius: 12, padding: 12, marginTop: 16 },
    attachmentPicked: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.surface },
    fieldLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 10, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    textarea: { minHeight: 70, textAlignVertical: 'top' },
    orText: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint, textAlign: 'center', marginVertical: 8 },
    filePickBtn: {
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
    filePickBtnText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.primaryRed },
    quizHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
    questionCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginTop: 10 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    optionInput: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 4 },
    addCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginBottom: 14 },
    rowCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 },
    rowCardColumn: { flexDirection: 'column', alignItems: 'stretch' },
    rowTitle: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text, flexShrink: 1 },
    rowMeta: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    badgeActive: { backgroundColor: colors.statusActiveBg },
    badgeDanger: { backgroundColor: `${colors.danger}18` },
    badgeText: { fontSize: 10, fontFamily: fonts.bodyBold, textTransform: 'capitalize' },
    badgeTextActive: { color: colors.statusActiveText },
    badgeTextDanger: { color: colors.danger },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' },
    actionBtnSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
    actionBtnTextSecondary: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.text },
    deleteIconBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: `${colors.danger}12`, alignItems: 'center', justifyContent: 'center' },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.text },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    modalCard: { width: '100%', maxHeight: '85%', backgroundColor: colors.surface, borderRadius: 18, padding: 18 },
    modalTitle: { fontSize: 15.5, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 4 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  });
}

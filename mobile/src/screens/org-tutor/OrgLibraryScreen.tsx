import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../../api/client';
import * as organizationsApi from '../../api/organizations';
import type { OrgLibraryItem } from '../../api/organizations';
import BackButton from '../../components/BackButton';
import PrimaryButton from '../../components/PrimaryButton';
import { useRoleMode } from '../../context/RoleModeContext';
import { useToast } from '../../context/ToastContext';
import type { MainStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'OrgLibrary'>;

const ALL_TABS: { key: 'general' | 'mine' | 'shared'; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'mine', label: 'From the org' },
  { key: 'shared', label: 'Shared' },
];

// Mirrors org-tutor.html's "Uploads & Library" panel - the organization's
// own shared library (/api/organizations/library), distinct from both the
// tutor's own MyLibrary and the shared Mozart-wide technique Library.
// "From the org" ('mine') is the linked *tutor's* own uploads/submissions
// to the org - not a real concept for a student viewer, so Org Student
// mode only ever sees General (uploaded for the whole institution) and
// Shared (specifically shared to students).
export default function OrgLibraryScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { mode } = useRoleMode();
  const { toast } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const TABS = mode === 'org-student' ? ALL_TABS.filter((t) => t.key !== 'mine') : ALL_TABS;
  const isOwner = mode === 'organization';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'general' | 'mine' | 'shared'>('general');
  const [data, setData] = useState<{ general: OrgLibraryItem[]; mine: OrgLibraryItem[]; shared: OrgLibraryItem[] } | null>(null);
  const [folders, setFolders] = useState<{ id: number; name: string }[]>([]);
  const [organizationName, setOrganizationName] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);

  const load = () => {
    return organizationsApi
      .fetchOrgLibrary()
      .then((res) => {
        setData(res);
        setFolders(res.folders);
        setOrganizationName(res.organizationName);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your organization library.'));
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const items = data ? data[tab] : [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title} numberOfLines={1}>{organizationName ? `${organizationName}'s library` : 'My organization’s library'}</Text>
        {isOwner ? (
          <Pressable style={styles.headerIconBtn} onPress={() => setUploadOpen(true)} hitSlop={8}>
            <Ionicons name="cloud-upload-outline" size={20} color={colors.primaryRed} />
          </Pressable>
        ) : (
          <View style={{ width: 42 }} />
        )}
      </View>

      {isOwner ? (
        <View style={styles.ownerActionsRow}>
          <Pressable style={styles.ownerActionBtn} onPress={() => setUploadOpen(true)}>
            <Ionicons name="cloud-upload-outline" size={15} color={colors.onPrimary} />
            <Text style={styles.ownerActionBtnText}>Upload</Text>
          </Pressable>
          <Pressable style={[styles.ownerActionBtn, styles.ownerActionBtnSecondary]} onPress={() => setFolderOpen(true)}>
            <Ionicons name="folder-outline" size={15} color={colors.text} />
            <Text style={[styles.ownerActionBtnText, { color: colors.text }]}>Create folder</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.tabsRow}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
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
          {items.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="folder-open-outline" size={26} color={colors.textFaint} />
              <Text style={styles.emptyText}>Nothing here yet.</Text>
            </View>
          ) : (
            items.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                  {item.fileUrl || item.url ? (
                    <Pressable style={styles.openBtn} onPress={() => Linking.openURL((item.fileUrl || item.url)!)}>
                      <Ionicons name="open-outline" size={14} color={colors.primaryRed} />
                      <Text style={styles.openBtnText}>Open</Text>
                    </Pressable>
                  ) : null}
                </View>
                {item.category ? <Text style={styles.cardMeta}>{item.category}</Text> : null}
                {item.text ? <Text style={styles.cardBody}>{item.text}</Text> : null}
                {item.requiresSubmission ? (
                  item.mySubmission ? (
                    <View style={styles.badgeSuccess}>
                      <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                      <Text style={styles.badgeSuccessText}>Sent back {new Date(item.mySubmission.createdAt).toLocaleDateString()}</Text>
                    </View>
                  ) : (
                    <View style={styles.badgeWarn}>
                      <Text style={styles.badgeWarnText}>Every tutor must send this back</Text>
                    </View>
                  )
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <UploadSheet
        visible={uploadOpen}
        onClose={() => setUploadOpen(false)}
        folders={folders}
        colors={colors}
        onUploaded={() => {
          setUploadOpen(false);
          toast('Uploaded to library.', 'success');
          load();
        }}
      />
      <CreateFolderSheet
        visible={folderOpen}
        onClose={() => setFolderOpen(false)}
        colors={colors}
        onCreated={() => {
          setFolderOpen(false);
          toast('Folder created.', 'success');
          load();
        }}
      />
    </View>
  );
}

const LIBRARY_TYPES: { key: 'info' | 'photo' | 'video' | 'document'; label: string }[] = [
  { key: 'info', label: 'Link / Drive' },
  { key: 'photo', label: 'Photo' },
  { key: 'video', label: 'Video' },
  { key: 'document', label: 'Document' },
];

function UploadSheet({
  visible,
  onClose,
  folders,
  onUploaded,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  folders: { id: number; name: string }[];
  onUploaded: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<'info' | 'photo' | 'video' | 'document'>('info');
  const [url, setUrl] = useState('');
  const [visibility, setVisibility] = useState<'general' | 'shared'>('general');
  const [folderId, setFolderId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [asset, setAsset] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setCategory('');
      setType('info');
      setUrl('');
      setVisibility('general');
      setFolderId(null);
      setNote('');
      setAsset(null);
    }
  }, [visible]);

  async function pickFile() {
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    } catch {
      toast('Could not open the file picker. Try again in a moment.', 'error');
      return;
    }
    if (result.canceled || !result.assets[0]) return;
    const picked = result.assets[0];
    setAsset({ uri: picked.uri, name: picked.name, type: picked.mimeType || 'application/octet-stream' });
  }

  async function submit() {
    if (!title.trim()) {
      toast('Enter a name.', 'error');
      return;
    }
    if (!url.trim() && !asset) {
      toast('Add a URL or choose a file.', 'error');
      return;
    }
    setUploading(true);
    try {
      let fileUrl: string | undefined;
      if (asset) {
        const mediaType = type === 'photo' ? 'photo' : type === 'video' ? 'video' : 'document';
        const uploaded = await organizationsApi.uploadOrgMedia(mediaType, asset);
        fileUrl = uploaded.url;
      }
      await organizationsApi.uploadLibraryItem({
        title: title.trim(),
        category: category.trim() || undefined,
        url: url.trim() || undefined,
        fileUrl,
        type,
        visibility,
        folderId,
        text: note.trim() || undefined,
      });
      onUploaded();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not upload to the library.', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Upload to Library</Text>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Name" placeholderTextColor={colors.textFaint} />
            <Text style={styles.fieldLabel}>Subject</Text>
            <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="Subject" placeholderTextColor={colors.textFaint} />
            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.chipsRow}>
              {LIBRARY_TYPES.map((t) => {
                const active = type === t.key;
                return (
                  <Pressable key={t.key} style={[styles.chip, active && styles.chipActive]} onPress={() => setType(t.key)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>URL (YouTube, Drive, or other link)</Text>
            <TextInput style={styles.input} value={url} onChangeText={setUrl} placeholder="https://..." placeholderTextColor={colors.textFaint} autoCapitalize="none" />
            <Pressable style={styles.filePickBtn} onPress={pickFile}>
              <Ionicons name="document-attach-outline" size={15} color={colors.primaryRed} />
              <Text style={styles.filePickBtnText} numberOfLines={1}>{asset ? asset.name : 'Or upload a file from your device'}</Text>
            </Pressable>
            <Text style={styles.fieldLabel}>Visibility</Text>
            <View style={styles.chipsRow}>
              <Pressable style={[styles.chip, visibility === 'general' && styles.chipActive]} onPress={() => setVisibility('general')}>
                <Text style={[styles.chipText, visibility === 'general' && styles.chipTextActive]}>General - students & tutors</Text>
              </Pressable>
              <Pressable style={[styles.chip, visibility === 'shared' && styles.chipActive]} onPress={() => setVisibility('shared')}>
                <Text style={[styles.chipText, visibility === 'shared' && styles.chipTextActive]}>Shared - tutors & staff</Text>
              </Pressable>
            </View>
            {folders.length > 0 ? (
              <>
                <Text style={styles.fieldLabel}>Folder</Text>
                <View style={styles.chipsRow}>
                  <Pressable style={[styles.chip, folderId === null && styles.chipActive]} onPress={() => setFolderId(null)}>
                    <Text style={[styles.chipText, folderId === null && styles.chipTextActive]}>No folder</Text>
                  </Pressable>
                  {folders.map((f) => (
                    <Pressable key={f.id} style={[styles.chip, folderId === f.id && styles.chipActive]} onPress={() => setFolderId(f.id)}>
                      <Text style={[styles.chipText, folderId === f.id && styles.chipTextActive]}>{f.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput style={[styles.input, styles.textarea]} value={note} onChangeText={setNote} placeholder="Instructions or context" placeholderTextColor={colors.textFaint} multiline />
            <PrimaryButton title="Upload to library" onPress={submit} loading={uploading} style={{ marginTop: 18, marginBottom: 20 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CreateFolderSheet({
  visible,
  onClose,
  onCreated,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (visible) setName('');
  }, [visible]);

  async function create() {
    if (!name.trim()) {
      toast('Enter a folder name.', 'error');
      return;
    }
    setCreating(true);
    try {
      await organizationsApi.createLibraryFolder(name.trim());
      onCreated();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not create that folder.', 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Create Folder</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Folder name" placeholderTextColor={colors.textFaint} maxLength={100} />
          <PrimaryButton title="Create folder" onPress={create} loading={creating} style={{ marginTop: 16 }} />
        </Pressable>
      </Pressable>
    </Modal>
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
    tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
    tab: { flex: 1, borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, alignItems: 'center' },
    tabActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    tabText: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    tabTextActive: { color: colors.onPrimary },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingTop: 60, gap: 8 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, textAlign: 'center', fontSize: 13 },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 10,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    cardTitle: { flex: 1, fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    cardMeta: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 3 },
    cardBody: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textSoft, marginTop: 6, lineHeight: 18 },
    openBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
    openBtnText: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    badgeWarn: { alignSelf: 'flex-start', backgroundColor: '#FEF3C7', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginTop: 8 },
    badgeWarnText: { fontSize: 10.5, fontFamily: fonts.bodyBold, color: '#B45309' },
    badgeSuccess: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
    badgeSuccessText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.success },
    headerIconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
    ownerActionsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 14 },
    ownerActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.primaryRed,
      borderRadius: 12,
      paddingVertical: 11,
    },
    ownerActionBtnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    ownerActionBtnText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, maxHeight: '88%' },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
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
      backgroundColor: colors.background,
    },
    textarea: { minHeight: 70, textAlignVertical: 'top' },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
    chipActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    chipText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
    chipTextActive: { color: colors.onPrimary },
    filePickBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: colors.background, borderRadius: 10, padding: 12 },
    filePickBtnText: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
  });
}

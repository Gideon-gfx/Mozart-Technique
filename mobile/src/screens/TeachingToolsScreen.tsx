import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API_BASE_URL } from '../api/client';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'TeachingTools'>;

// Native chrome around the actual tool (public/teaching-tools/ - an iframed
// web SPA with its own restyle, see that folder's styles.css) - this file
// owns the native back bar and background pause state. Permissions are
// requested by the WebView when a microphone or camera tool is started.
export default function TeachingToolsScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [error, setError] = useState('');
  const webRef = useRef<WebView>(null);
  const savingScore = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      const event = state === 'active' ? 'mozart-tools-resume' : 'mozart-tools-pause';
      webRef.current?.injectJavaScript(`document.dispatchEvent(new Event('${event}')); true;`);
    });
    return () => sub.remove();
  }, []);
  async function saveScoreFile(data: { name?: unknown; mimeType?: unknown; data?: unknown; encoding?: unknown }) {
    if (savingScore.current || typeof data.data !== 'string' || data.data.length > 6 * 1024 * 1024) return;
    const image = data.name === 'mozart-score.png' && data.mimeType === 'image/png' && data.encoding === 'base64';
    const xml = data.name === 'mozart-transcription.musicxml' && data.mimeType === 'application/vnd.recordare.musicxml+xml' && data.encoding === 'utf8';
    if (!image && !xml) return;
    savingScore.current = true;
    try {
      if (!FileSystem.documentDirectory) throw new Error('Device file storage is unavailable.');
      const folder = `${FileSystem.documentDirectory}Scores/`;
      await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
      const uri = `${folder}mozart-score-${Date.now()}.${image ? 'png' : 'musicxml'}`;
      await FileSystem.writeAsStringAsync(uri, data.data, { encoding: image ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: image ? 'image/png' : 'application/xml', UTI: image ? 'public.png' : 'public.xml', dialogTitle: 'Save your Mozart score' });
      }
      webRef.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('mozart-score-saved', {detail: {message: 'Score file saved. Use your device sharing options to keep a copy.'}})); true;`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the score file.';
      setError(message);
      webRef.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('mozart-score-saved', {detail: ${JSON.stringify({ error: message })}})); true;`);
    } finally { savingScore.current = false; }
  }
  const studentView = route.params?.role === 'student';
  const toolsTitle = studentView ? 'Student tools' : 'Teaching tools';
  const url = `${API_BASE_URL}/teaching-tools/index.html?v=20261018-score-drawing-1&role=${studentView ? 'student' : 'teacher'}`;
  return <SafeAreaView style={styles.page}>
    <View style={styles.bar}><Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back to chat"><Text style={styles.link}>‹ Back to chat</Text></Pressable><Text style={styles.title}>{toolsTitle}</Text></View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <WebView ref={webRef}
      cacheEnabled={false} cacheMode="LOAD_NO_CACHE"
      source={{ uri: url }} style={styles.web} originWhitelist={[API_BASE_URL]}
      onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url.startsWith(`${API_BASE_URL}/teaching-tools/`)}
      allowsInlineMediaPlayback mediaPlaybackRequiresUserAction
      mediaCapturePermissionGrantType="prompt" javaScriptEnabled
      onMessage={event => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.type === 'close-tools') { navigation.goBack(); return; }
          if (data.type === 'save-score') { void saveScoreFile(data); return; }
          if (data.type === 'share-notes' && typeof data.text === 'string' && data.text.length <= 100000) {
            Share.share({title:data.name === 'mozart-transcription.musicxml' ? 'Mozart sheet music' : 'Mozart lesson notes',message:data.text}).catch(() => setError('Could not open the sharing menu.'));
          }
        } catch { /* Ignore messages outside the documented tool bridge. */ }
      }}
      onError={() => setError('Teaching tools could not load. Check your connection and that the updated web server is deployed.')}
      startInLoadingState renderLoading={() => <View style={styles.loading}><ActivityIndicator color={colors.primaryRed} /></View>}
    />
  </SafeAreaView>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    bar: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    link: { color: colors.primaryRed, fontSize: 13, fontFamily: fonts.display, paddingVertical: 10 },
    title: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text },
    text: { fontSize: 15, lineHeight: 23, fontFamily: fonts.body, color: colors.textSoft },
    web: { flex: 1, backgroundColor: colors.background },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    error: { padding: 12, fontFamily: fonts.bodySemiBold, color: colors.danger },
  });
}

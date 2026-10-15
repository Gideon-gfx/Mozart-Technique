import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { API_BASE_URL } from '../api/client';
import type { MainStackParamList } from '../navigation/types';
import PrimaryButton from '../components/PrimaryButton';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'TeachingTools'>;

// Native chrome around the actual tool (public/teaching-tools/ - an iframed
// web SPA with its own restyle, see that folder's styles.css) - this file
// only owns the back bar, mic-permission intro, and the paused-in-
// background state, so it now pulls real theme colors/fonts instead of the
// hardcoded hex + system-default font it previously had, matching every
// other screen in the app.
export default function TeachingToolsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => { const sub = AppState.addEventListener('change', state => setForeground(state === 'active')); return () => sub.remove(); }, []);
  const url = `${API_BASE_URL}/teaching-tools/index.html`;
  async function open(withMicrophone: boolean) {
    if (withMicrophone) {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) setError('Microphone permission was declined. Other tools still work.');
    }
    setReady(true);
  }
  return <SafeAreaView style={styles.page}>
    <View style={styles.bar}><Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back to chat"><Text style={styles.link}>‹ Back to chat</Text></Pressable><Text style={styles.title}>Teaching tools</Text></View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {!ready ? <View style={styles.intro}><Text style={styles.introTitle}>Your music studio</Text><Text style={styles.text}>Open the metronome, keyboard, tuner, notation and notebook without leaving Mozart. Microphone access is optional and only used when you start a microphone tool.</Text><PrimaryButton title="Continue with microphone" onPress={() => { open(true).catch(() => { setError('Could not request microphone access.'); setReady(true); }); }} /><Pressable onPress={() => open(false)} style={styles.secondaryLink}><Text style={styles.link}>Continue without microphone</Text></Pressable></View> : foreground ? <WebView
      source={{ uri: url }} style={styles.web} originWhitelist={[API_BASE_URL]}
      onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url.startsWith(`${API_BASE_URL}/teaching-tools/`)}
      allowsInlineMediaPlayback mediaPlaybackRequiresUserAction
      mediaCapturePermissionGrantType="prompt" javaScriptEnabled
      onMessage={event => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.type === 'share-notes' && typeof data.text === 'string' && data.text.length <= 100000) {
            Share.share({title:'Mozart lesson notes',message:data.text}).catch(() => setError('Could not open the sharing menu.'));
          }
        } catch { /* Only the documented text-note bridge is accepted. */ }
      }}
      onError={() => setError('Teaching tools could not load. Check your connection and that the updated web server is deployed.')}
      startInLoadingState renderLoading={() => <View style={styles.loading}><ActivityIndicator color={colors.primaryRed} /></View>}
    /> : <Text style={styles.text}>Tools paused while the app is in the background.</Text>}
  </SafeAreaView>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    bar: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    link: { color: colors.primaryRed, fontSize: 15, fontFamily: fonts.bodyBold, paddingVertical: 10 },
    secondaryLink: { alignSelf: 'center' },
    title: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text },
    intro: { padding: 24, gap: 18 },
    introTitle: { fontSize: 22, fontFamily: fonts.displayBlack, color: colors.text },
    text: { fontSize: 15, lineHeight: 23, fontFamily: fonts.body, color: colors.textSoft },
    web: { flex: 1, backgroundColor: colors.background },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    error: { padding: 12, fontFamily: fonts.bodySemiBold, color: colors.danger },
  });
}

import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';

import BackButton from '../components/BackButton';
import Pressable from '../components/LiquidPressable';
import PrimaryButton from '../components/PrimaryButton';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';
import { openBrowser } from '../utils/openBrowser';

type Props = NativeStackScreenProps<MainStackParamList, 'MeetingWebView'>;

// Renders a Google Meet (or other video-call) link inside the app's own
// WebView instead of handing it to the device's browser - keeps joining a
// lesson feeling like part of Mozart Techniques rather than switching away
// to a separate app/task. Camera/mic getUserMedia requests from the page
// are handled automatically: on Android, react-native-webview's own
// WebChromeClient matches them against this app's already-granted
// CAMERA/RECORD_AUDIO permissions (prompting for either if not yet
// granted); on iOS, mediaCapturePermissionGrantType below auto-grants them
// for the same host the page is already loaded from.
export default function MeetingWebViewScreen({ navigation, route }: Props) {
  const { url, title = 'Meeting' } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [error, setError] = useState(false);

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <View style={styles.bar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Pressable onPress={() => openBrowser(url).catch(() => {})} hitSlop={10} accessibilityLabel="Open in browser instead">
          <Ionicons name="open-outline" size={20} color={colors.textFaint} />
        </Pressable>
      </View>
      {error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>Couldn&apos;t load the meeting</Text>
          <Text style={styles.errorBody}>Your connection may be slow, or this page doesn&apos;t work well embedded. Try opening it in your browser instead.</Text>
          <PrimaryButton title="Open in browser" onPress={() => openBrowser(url).catch(() => {})} style={{ marginTop: 4 }} />
        </View>
      ) : (
        <WebView
          source={{ uri: url }}
          style={styles.web}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grantIfSameHostElseDeny"
          javaScriptEnabled
          domStorageEnabled
          onError={() => setError(true)}
          onHttpError={(event) => { if (event.nativeEvent.statusCode >= 400) setError(true); }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primaryRed} size="large" />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
    title: { flex: 1, fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, textAlign: 'center' },
    web: { flex: 1, backgroundColor: colors.background },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
    errorTitle: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, textAlign: 'center' },
    errorBody: { fontSize: 13, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', lineHeight: 19, marginBottom: 8 },
  });
}

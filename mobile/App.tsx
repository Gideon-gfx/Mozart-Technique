import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  useFonts as useMontserratFonts,
} from '@expo-google-fonts/montserrat';
import {
  ScienceGothic_800ExtraBold,
  ScienceGothic_900Black,
  useFonts as useScienceGothicFonts,
} from '@expo-google-fonts/science-gothic';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type * as NotificationsPackage from 'expo-notifications';
import * as ExpoSplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import * as authApi from './src/api/auth';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CartProvider } from './src/context/CartContext';
import { NotificationsProvider } from './src/context/NotificationsContext';
import { MotionProvider } from './src/context/MotionContext';
import NotificationBubbles from './src/components/NotificationBubbles';
import PollPopup from './src/components/PollPopup';
import type { MainStackParamList } from './src/navigation/types';
import { RoleModeProvider } from './src/context/RoleModeContext';
import { TourRunnerProvider } from './src/context/TourRunnerContext';
import { TourTargetsProvider } from './src/context/TourTargetsContext';
import { ToastProvider } from './src/context/ToastContext';
import MainStack from './src/navigation/MainStack';
import { navigationRef } from './src/navigation/navigationRef';
import type { AuthStackParamList } from './src/navigation/types';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import GetStartedScreen from './src/screens/GetStartedScreen';
import LoginScreen from './src/screens/LoginScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import { ThemeProvider } from './src/theme/ThemeContext';
import { useTheme } from './src/theme/useTheme';
import { fonts } from './src/theme/fonts';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

// Same guarded-require pattern as NotificationsContext.tsx and
// useGoogleSignIn.ts - a plain top-level `import` runs (and can throw, on a
// build without expo-notifications' native code linked in yet) the instant
// this module loads, before any component or effect below has a chance to
// catch it.
let Notifications: typeof NotificationsPackage | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Notifications = require('expo-notifications');
} catch {
  Notifications = null;
}

// Keep the configured native launch screen visible until fonts and auth are
// ready, avoiding a JavaScript loading screen before onboarding.
ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

function Root({ fontsLoaded, bootFallback }: { fontsLoaded: boolean; bootFallback: boolean }) {
  const { user, loading, loggingOut, refresh } = useAuth();
  const { colors } = useTheme();
  // Dismissed the instant "Skip"/"Get started" is tapped, without waiting
  // on the mark-seen request or the session refetch it triggers - both run
  // in the background. Reset to false on every new user id so a second
  // account signing in on the same device (that still needs it) sees it
  // again instead of inheriting the previous account's dismissal.
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const dismissedForUserId = useRef<number | null>(null);

  useEffect(() => {
    if ((fontsLoaded && !loading) || bootFallback) ExpoSplashScreen.hideAsync().catch(() => {});
  }, [bootFallback, fontsLoaded, loading]);

  if (user && dismissedForUserId.current !== user.id) {
    dismissedForUserId.current = user.id;
    if (onboardingDismissed) setOnboardingDismissed(false);
  }

  if ((!fontsLoaded || loading) && !bootFallback) {
    return <View style={[styles.loading, { backgroundColor: colors.background }]} />;
  }

  // Checked before the signed-in/signed-out split below, and regardless of
  // which one currently applies - the instant sign-out is confirmed,
  // everything underneath should stop being interactive rather than the
  // previous screen staying tappable for however long /api/logout takes.
  if (loggingOut) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primaryRed} size="large" />
        <Text style={[styles.loadingLabel, { color: colors.text }]}>Logging out…</Text>
      </View>
    );
  }

  // Signed-in and signed-out are two entirely separate navigators, swapped
  // wholesale - the standard React Navigation auth-flow pattern.
  if (!user) {
    return (
      <AuthStack.Navigator
        screenOptions={{
          headerShown: false,
          // The native-stack push/pop transition briefly shows this
          // background behind whichever screen hasn't painted its own
          // content yet - left at the default (white), it flashed white at
          // the leading edge of the slide in dark mode. Every screen also
          // sets its own root background, but this is what's visible
          // *during* the transition, before that paints.
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <AuthStack.Screen name="Onboarding">
          {({ navigation }) => <OnboardingScreen onFinish={() => navigation.navigate('GetStarted')} />}
        </AuthStack.Screen>
        <AuthStack.Screen name="GetStarted" component={GetStartedScreen} />
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="SignUp" component={SignUpScreen} />
        <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      </AuthStack.Navigator>
    );
  }

  // Every account sees this once - including ones that existed before the
  // walkthrough did (server.js's publicUser defaults needsAppOnboarding to
  // true unless explicitly cleared) - not just brand-new signups, since the
  // app itself is what's new to them. Gates the whole of MainStack rather
  // than living inside it so there's no tab bar/header showing underneath.
  if (user.needsAppOnboarding && !onboardingDismissed) {
    return (
      <OnboardingScreen
        finishLabel="Continue"
        onFinish={() => {
          setOnboardingDismissed(true);
          authApi.completeAppOnboarding().then(refresh).catch(() => {});
        }}
      />
    );
  }

  return <MainStack />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

function AppInner() {
  const { colors, scheme } = useTheme();
  const [montserratLoaded, montserratError] = useMontserratFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });
  const [scienceGothicLoaded, scienceGothicError] = useScienceGothicFonts({
    ScienceGothic_800ExtraBold,
    ScienceGothic_900Black,
  });
  const fontsLoaded = (montserratLoaded || !!montserratError) && (scienceGothicLoaded || !!scienceGothicError);
  const [bootFallback, setBootFallback] = useState(false);

  useEffect(() => {
    if (montserratError) console.error('[startup] Montserrat font load failed', montserratError);
    if (scienceGothicError) console.error('[startup] Science Gothic font load failed', scienceGothicError);
  }, [montserratError, scienceGothicError]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      console.warn('[startup] readiness timed out; showing the app with fallback fonts/session state');
      setBootFallback(true);
    }, 5000);
    return () => clearTimeout(timeout);
  }, []);

  // Tapping a native push notification (tray, lock screen, or the
  // system's notification history) routes the same places the in-app
  // bubble's tap does - see NotificationBubbles' onOpenType/onOpenInbox
  // below. The push payload only carries `href` (server.js's
  // sendExpoPushNotifications), not a `type`, so this reads that string
  // instead of matching on type.
  useEffect(() => {
    if (!Notifications) return undefined;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (!navigationRef.isReady()) return;
      const href = response.notification.request.content.data?.href as string | undefined;
      if (href && href.includes('orientation')) navigationRef.navigate('Orientation');
      else navigationRef.navigate('Notifications');
    });
    return () => sub.remove();
  }, []);

  // Colors the native-stack header/back-button chrome and NavigationContainer's
  // own background flash between screens - without this it stays light-themed
  // regardless of the OS setting, even though every screen's own body follows it.
  const navigationTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      primary: colors.primaryRed,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <SafeAreaProvider>
      <MotionProvider>
      <ToastProvider>
        <AuthProvider>
          <NotificationsProvider>
            <RoleModeProvider>
              <CartProvider>
              <TourTargetsProvider>
              <TourRunnerProvider>
                <NavigationContainer ref={navigationRef} theme={navigationTheme}>
                  <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
                  <Root fontsLoaded={fontsLoaded} bootFallback={bootFallback} />
                </NavigationContainer>
                <NotificationBubbles
                  onOpenInbox={() => { if (navigationRef.isReady()) navigationRef.navigate('Notifications'); }}
                  onOpenType={(type) => {
                    if (!navigationRef.isReady()) return;
                    if (type === 'orientation' || type === 'orientation-required') navigationRef.navigate('Orientation');
                    else navigationRef.navigate('Notifications');
                  }}
                  // ProductDetail now lives inside StoreStack, nested under
                  // each role's "Store" tab - deep-navigate through Tabs ->
                  // Store rather than a flat top-level route. No-ops for a
                  // role whose tab set has no Store tab (e.g. Support Agent).
                  onOpenProduct={(slug) => {
                    if (!navigationRef.isReady()) return;
                    navigationRef.navigate('Tabs', { screen: 'Store', params: { screen: 'ProductDetail', params: { slug } } } as never);
                  }}
                />
                <PollPopup />
              </TourRunnerProvider>
              </TourTargetsProvider>
              </CartProvider>
            </RoleModeProvider>
          </NotificationsProvider>
        </AuthProvider>
      </ToastProvider>
      </MotionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLabel: {
    marginTop: 14,
    fontSize: 14,
    fontFamily: fonts.bodySemiBold,
  },
});

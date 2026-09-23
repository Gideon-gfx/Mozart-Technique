import Constants from 'expo-constants';
import { useMemo } from 'react';
import type * as GoogleSigninPackage from '@react-native-google-signin/google-signin';

// This package is native code - its own NativeGoogleSignin.js spec file runs
// `TurboModuleRegistry.getEnforcing('RNGoogleSignin')` at module top level,
// which throws synchronously the moment anything imports it if that native
// module isn't linked into the binary. Expo Go only ships Expo's own bundled
// native modules, so it's never linked there, and a plain top-level `import`
// would crash this module's evaluation - and therefore every screen that
// uses this hook - the instant Expo Go loads the JS bundle, not just when
// Google sign-in is tapped. A `require()` inside try/catch is evaluated
// lazily (unlike `import`, which Metro hoists and always runs), so it can
// actually be caught, and the rest of the app keeps working in Expo Go.
let googleSignin: typeof GoogleSigninPackage | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  googleSignin = require('@react-native-google-signin/google-signin');
} catch {
  googleSignin = null;
}

function getGoogleClientIds() {
  const extra = (Constants.expoConfig?.extra || {}) as Record<string, string | undefined>;
  return { webClientId: extra.googleWebClientId, iosClientId: extra.googleIosClientId };
}

export function useGoogleSignIn(onIdToken: (idToken: string) => void, onError: (message: string) => void) {
  const { webClientId, iosClientId } = getGoogleClientIds();
  const configured = Boolean(webClientId) && googleSignin !== null;

  useMemo(() => {
    if (!configured || !googleSignin) return;
    googleSignin.GoogleSignin.configure({ webClientId, iosClientId, offlineAccess: false });
  }, [configured, webClientId, iosClientId]);

  async function start() {
    if (!googleSignin) {
      onError('Google sign-in needs a development build - it uses native code Expo Go can\'t run. Everything else in the app still works here.');
      return;
    }
    if (!configured) {
      onError('Google sign-in is not set up yet - it needs a Google OAuth client ID added to app.json first.');
      return;
    }
    const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = googleSignin;
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (isSuccessResponse(response)) {
        if (response.data.idToken) {
          onIdToken(response.data.idToken);
        } else {
          onError('Google did not return an ID token - try again.');
        }
      }
      // response.type === 'cancelled': the user backed out of the picker,
      // nothing to report.
    } catch (error) {
      if (isErrorWithCode(error)) {
        if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) return;
        if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          onError('Google Play Services is required for Google sign-in on this device.');
          return;
        }
      }
      onError('Could not sign in with Google. Try again.');
    }
  }

  return { configured, start };
}

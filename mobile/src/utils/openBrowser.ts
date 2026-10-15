import * as WebBrowser from 'expo-web-browser';
import type { WebBrowserOpenOptions, WebBrowserResult } from 'expo-web-browser';
import { Platform } from 'react-native';

// On Android, expo-web-browser's Custom Tabs session resolves a URL exactly
// like a plain implicit VIEW intent unless a target package is pinned - if
// some other installed app (Google Meet, a bank app on a Stripe 3-D Secure
// redirect, etc.) is registered as that URL's verified App Link handler,
// Android hands the intent straight to THAT app instead of a browser. Some
// of those handler activities are themselves guarded by a permission this
// app doesn't hold (Google Meet's own join-by-url activity requires
// CALL_PHONE) - Android then throws a SecurityException from deep inside
// that other app's Activity.onCreate(), which happens on the Activity
// lifecycle, entirely outside this call's own promise. No .catch() here can
// ever catch it, and it takes the whole app process down. Pinning the
// session to Chrome (present on effectively every Play Store-eligible
// device) bypasses that app-link resolution entirely, so a link only ever
// opens as a normal web page; if Chrome genuinely isn't installed, this
// rejects as an ordinary catchable promise instead of crashing.
export function openBrowser(url: string, options: WebBrowserOpenOptions = {}): Promise<WebBrowserResult> {
  return WebBrowser.openBrowserAsync(url, {
    ...options,
    ...(Platform.OS === 'android' ? { browserPackage: 'com.android.chrome' } : null),
  });
}

import Constants from 'expo-constants';
import type * as NotificationsPackage from 'expo-notifications';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import * as notificationsApi from '../api/notifications';
import * as orientationApi from '../api/orientation';
import { useAuth } from './AuthContext';
import type { AppNotification } from '../api/types';

// Same reasoning, same fix as useGoogleSignIn.ts's own guarded require():
// expo-notifications' own submodules call into native code at *import*
// time, not just when a function on it is called - a plain top-level
// `import` (which Metro hoists and always evaluates, regardless of where
// it's written) throws the instant this file loads on a build that
// doesn't have expo-notifications' native code linked in yet (any build
// made before this feature existed), crashing the entire app on launch,
// not just push. `require()` inside try/catch is evaluated lazily instead,
// so the failure can actually be caught here rather than during bundle
// evaluation before any of this file's own code has run.
let Notifications: typeof NotificationsPackage | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Notifications = require('expo-notifications');
} catch {
  Notifications = null;
}

// Foreground behavior only - a backgrounded/killed app is handled entirely
// by the OS from the payload server.js sends (sound/channel/badge already
// set server-side), this is just what happens if a push arrives while
// someone's actually looking at the app.
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// Not a real stored notification - synthesized client-side whenever the
// signed-in account has a required orientation post it hasn't passed/
// finished yet. -1 never collides with a real (positive, auto-incrementing)
// notification id.
const ORIENTATION_REMINDER_ID = -1;

interface NotificationsContextValue {
  hasUnread: boolean;
  refresh: () => Promise<void>;
  bubbles: AppNotification[];
  dismissBubble: (id: number) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

const POLL_INTERVAL_MS = 10000;

// Just enough to drive the red unread-dot every mode's header bell shows
// (NotificationBell) - not the Notifications screen's own data, which
// fetches its own full list independently. Polls while signed in and
// re-checks whenever the app comes back to the foreground, since a push
// notification arriving while backgrounded should already flip the dot on
// by the time someone looks at the screen again.
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [hasUnread, setHasUnread] = useState(false);
  const [bubbles, setBubbles] = useState<AppNotification[]>([]);
  // Kept separate from `bubbles` (real notifications) rather than mixed
  // into the same state - refresh() below rebuilds `bubbles` from the real
  // notifications list on every poll and would otherwise wipe a synthetic
  // entry that has no matching row there. Merged back together only in the
  // exposed `value` below.
  const [orientationReminderDismissed, setOrientationReminderDismissed] = useState(false);
  const [orientationBlocked, setOrientationBlocked] = useState(false);
  const session = useRef<{ userId: number | null; seen: Set<number> | null; busy: boolean }>({ userId: null, seen: null, busy: false });
  if (session.current.userId !== (user?.id ?? null)) {
    session.current = { userId: user?.id ?? null, seen: null, busy: false };
  }
  const dismissBubble = useCallback((id: number) => {
    if (id === ORIENTATION_REMINDER_ID) setOrientationReminderDismissed(true);
    else setBubbles((queue) => queue.filter((item) => item.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setHasUnread(false);
      return;
    }
    const current = session.current;
    if (current.busy) return;
    current.busy = true;
    try {
      const { notifications } = await notificationsApi.fetchNotifications();
      if (session.current !== current) return;
      setHasUnread(notifications.some((n) => !n.read));
      // Keeps the OS app-icon badge in sync while the app is foregrounded -
      // the same count server.js already sends on a background push, this
      // just covers the "app was open the whole time" case that never gets
      // a push at all. No-ops entirely on a build without the native
      // module (Notifications is null) - badge just stays whatever the OS
      // last set it to.
      Notifications?.setBadgeCountAsync(notifications.filter((n) => !n.read).length).catch(() => {});
      const fresh = current.seen ? notifications.filter((n) => !n.read && !current.seen!.has(n.id)) : [];
      current.seen = new Set(notifications.map((n) => n.id));
      setBubbles((queue) => [...queue.filter((n) => notifications.some((entry) => entry.id === n.id && !entry.read)), ...fresh].slice(-12));
    } catch {
      // Silent - a failed check just leaves the dot as it was; the
      // Notifications screen itself surfaces any real connectivity error.
    } finally {
      current.busy = false;
    }
  }, [user?.id]);

  // Checked once per app-foreground (on mount, and again each time the app
  // comes back from the background) rather than on the 10s notification
  // poll - "recurring" should mean "each time they open the app", not a
  // bubble that reappears every 10 seconds while they're actively using it.
  const checkOrientation = useCallback(async () => {
    if (!user) return;
    try {
      const status = await orientationApi.fetchOrientationStatus();
      // A fresh un-dismiss on every check (rather than only when it flips
      // from false->true) is what makes this "recurring" - each app
      // foreground clears the previous dismissal, so a still-blocked
      // account sees the reminder again.
      setOrientationReminderDismissed(false);
      setOrientationBlocked(status.blocked);
    } catch {
      // Silent, same as refresh() above - this is a reminder, not a
      // critical path, and a failed check shouldn't surface an error.
    }
  }, [user]);

  useEffect(() => {
    setBubbles([]);
    setHasUnread(false);
    setOrientationBlocked(false);
    setOrientationReminderDismissed(false);
    refresh();
    checkOrientation();
  }, [refresh, checkOrientation]);

  // Registers this device for native push the moment someone's signed in,
  // and unregisters on the way out (logout, or this provider unmounting
  // with them still signed in never happens in practice, but the cleanup
  // covers it too) - a stale token left behind would otherwise keep
  // notifying whoever's account is signed in next on this same device.
  useEffect(() => {
    // Captured into a local const so it stays narrowed to non-null inside
    // the nested closure below - TS (rightly) won't carry a module-level
    // `let`'s narrowing across a function boundary, since it can't prove
    // nothing reassigns it in between.
    const notif = Notifications;
    if (!user || !notif) return;
    let cancelled = false;
    let registeredToken: string | null = null;

    (async () => {
      try {
        if (Platform.OS === 'android') {
          // No `sound` key here on purpose - unlike the push payload's own
          // `sound: 'default'` (server.js), which really does mean "system
          // default", this channel API treats any string as a *custom*
          // sound filename to look up among app.json's bundled sounds and
          // throws when it doesn't find one. Omitting it entirely is what
          // actually gets the system default notification sound.
          await notif.setNotificationChannelAsync('default', {
            name: 'Mozart Techniques',
            importance: notif.AndroidImportance.DEFAULT,
          });
        }
        const existing = await notif.getPermissionsAsync();
        let status = existing.status;
        if (status !== 'granted') {
          const requested = await notif.requestPermissionsAsync();
          status = requested.status;
        }
        if (status !== 'granted' || cancelled) return;
        const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
        const { data: token } = await notif.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        if (cancelled || !token) return;
        registeredToken = token;
        await notificationsApi.registerExpoPushToken(token);
      } catch {
        // A denied permission or a network hiccup just means no native
        // push this session - the in-app poll above still covers unread
        // state while the app is open.
      }
    })();

    return () => {
      cancelled = true;
      if (registeredToken) notificationsApi.unregisterExpoPushToken(registeredToken).catch(() => {});
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, POLL_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
        checkOrientation();
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [user, refresh, checkOrientation]);

  // Hide the previous account's state immediately, before reset effects run.
  const ready = session.current.seen !== null && Boolean(user);
  const allBubbles = useMemo(() => {
    if (!ready) return [];
    if (!orientationBlocked || orientationReminderDismissed) return bubbles;
    const reminder: AppNotification = {
      id: ORIENTATION_REMINDER_ID,
      type: 'orientation-required',
      message: 'Complete your required orientation to continue.',
      href: '/orientation',
      read: false,
      createdAt: new Date().toISOString(),
    };
    return [...bubbles, reminder];
  }, [ready, bubbles, orientationBlocked, orientationReminderDismissed]);
  const value = useMemo(() => ({ hasUnread: ready && hasUnread, refresh, bubbles: allBubbles, dismissBubble }), [ready, hasUnread, refresh, allBubbles, dismissBubble]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotificationsBadge() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotificationsBadge must be used within a NotificationsProvider');
  return ctx;
}

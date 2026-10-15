# Mozart Techniques - Mobile App

Expo (managed) + React Native + TypeScript. Talks to the same Express
backend as the web app (`../server.js`) over its existing JSON API and
session cookie - no separate mobile backend.

## Running it locally

1. Start the backend first, from the repo root: `node server.js` (or
   `npm run dev` if that's what you normally use). It needs to be reachable
   on your machine's LAN IP, not just `localhost`, for a phone or a
   physical-device Expo Go session to reach it - `npm start` below figures
   that out automatically from Expo's own dev server host.
2. From this `mobile/` folder: `npm install` (first time only), then
   `npm start`.
3. Scan the QR code with Expo Go (iOS/Android), or press `i` / `a` in the
   terminal for a simulator/emulator if you have Xcode/Android Studio set
   up.

## How auth works here

The backend uses a signed session cookie (`cookie-session`), the same one
the web app uses - not a bearer token. `src/api/client.ts`'s `apiFetch`
sends `credentials: 'include'` on every request; React Native's networking
layer (native `NSURLSession` on iOS, OkHttp-backed on Android) persists and
resends cookies automatically, so logging in via `POST /api/login` and then
calling `GET /api/session` on the next app launch "just works" without any
extra cookie-jar library.

## Project layout

```
App.tsx                    - root: providers + the (currently plain,
                              no-stack-yet) auth-state switch between
                              LoginScreen and DashboardScreen
src/
  api/
    client.ts               - base URL resolution + a fetch wrapper that
                               throws on { success: false }
    auth.ts                 - login/signup/logout/session/my-assignments
    types.ts                - PublicUser, AssignmentSummary - keep these in
                               sync with server.js's publicUser() and
                               /api/my-assignments response shapes
  context/
    AuthContext.tsx          - user state + login/logout, backed by the
                               session cookie (not local token storage)
  screens/
    LoginScreen.tsx
    DashboardScreen.tsx      - lists /api/my-assignments as student + tutor
  theme/
    colors.ts                - mirrors the web app's brand palette
```

## What's next (not built yet)

Everything past login + a basic dashboard list - messaging, the negotiate
flow, push notifications, a real navigation stack once there's more than
two screens to move between. This was deliberately scoped small for v1;
widen `AssignmentSummary` and add screens as those come up rather than
guessing their shape ahead of time.

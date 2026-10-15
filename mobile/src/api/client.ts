import Constants from 'expo-constants';

// Matches server.js's own default (`const PORT = process.env.PORT || 3000`).
const DEV_API_PORT = 3000;

// In development, Metro reports the dev machine's LAN IP as its "host URI"
// (e.g. "192.168.1.5:8081") - the Express server we want lives on that
// same machine, just a different port. "localhost" only resolves to the
// phone/simulator itself, never the dev machine, so it can't be the
// fallback here. In production this is overridden entirely by
// EXPO_PUBLIC_API_URL, set at build time.
function resolveApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');

  const hostUri =
    Constants.expoConfig?.hostUri ||
    // Older/alternate shapes some Expo Go builds still report through.
    (Constants as unknown as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } })
      .manifest2?.extra?.expoClient?.hostUri;
  const host = hostUri ? hostUri.split(':')[0] : 'localhost';
  return `http://${host}:${DEV_API_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

// A Main Admin can deliberately enter the narrower Country Admin console.
// Keep that choice with every API call so the server can enforce the same
// country boundary as a dedicated Country Admin account.
let adminRequestView: 'country' | null = null;

export function setAdminRequestView(view: 'primary' | 'country' | null) {
  adminRequestView = view === 'country' ? 'country' : null;
}

// server.js serves photos/attachments either as a Cloudinary secure_url
// (already absolute) or, for anything uploaded before Cloudinary was
// configured, as a local relative path like "/uploads/photos/xyz.jpg". A
// browser resolves that relative to the page's own origin automatically;
// React Native's <Image> has no such origin and just fails to load it
// silently (rendering as nothing, not an error) - so every photoUrl/
// tutorPhotoUrl/studentPhotoUrl read from the API needs to go through this
// before being handed to <Image>.
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const REQUEST_TIMEOUT_MS = 12000;

// Every route on the Express side responds { success: boolean, ... } - this
// throws on both network failures and { success: false } responses, so
// callers only ever have to handle the "it worked" path plus one catch.
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  // A wrong host/port doesn't necessarily fail fast - depending on the
  // network, an unreachable address can just hang instead of rejecting
  // (this is exactly what happened during initial setup: the app pointed
  // at the wrong dev-server port and every screen sat on its loading state
  // forever instead of showing an error). Aborting after a timeout turns
  // that into a normal, debuggable ApiError.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        // Lets server.js tell a web signup from an app signup (e.g. to pick
        // the right welcome-email variant) without guessing from User-Agent.
        'X-Mozart-Client': 'mobile',
        ...(adminRequestView ? { 'X-Mozart-Admin-View': adminRequestView } : {}),
        ...(options.headers || {}),
      },
      // Cookies are actually handled by the native networking layer
      // (NSURLSession / OkHttp), not this option - included anyway since
      // it costs nothing and matches the web client's own fetch calls.
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new ApiError(
      timedOut
        ? `Could not reach the server at ${API_BASE_URL} - check it's running and reachable on your network.`
        : 'Could not reach the server. Check your connection.',
      0,
    );
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.success === false) {
    const message = (data && data.error) || `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

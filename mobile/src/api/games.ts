import { apiFetch, API_BASE_URL } from './client';

export type NoteGameTier = 'beginner' | 'intermediate' | 'advanced';

export function recordNoteGameSession(payload: { tier: NoteGameTier; score: number; correctCount: number; totalCount: number }) {
  return apiFetch<{ success: true }>('/api/games/note-recognition/session', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface LeaderboardEntry {
  studentUserId: number;
  studentName: string;
  score: number;
  tier: NoteGameTier;
  playedAt: string;
}

export function fetchNoteGameLeaderboard() {
  return apiFetch<{ success: true; leaderboard: LeaderboardEntry[] }>('/api/games/note-recognition/leaderboard');
}

export interface InstrumentGame {
  id: string;
  title: string;
  category: string;
  description: string;
}

// public/classroom-games/ (catalog.json + engine.js + play.js) is a
// standalone, already-working web mini-game set - eight instrument theory
// challenges (piano, guitar, bass, violin, cello, trumpet, saxophone,
// drums), each procedurally generating 12 questions client-side. It's a
// static file, not an API route, so this is a plain fetch rather than
// apiFetch (which always expects the {success, ...} JSON envelope).
export function fetchInstrumentGamesCatalog() {
  return fetch(`${API_BASE_URL}/classroom-games/catalog.json`).then((r) => r.json() as Promise<InstrumentGame[]>);
}

// The URL MeetingWebViewScreen (reused as a general in-app browser) should
// load to play one game - matches play.js's own `?game=<id>` param.
export function instrumentGameUrl(gameId: string) {
  return `${API_BASE_URL}/classroom-games/index.html?game=${encodeURIComponent(gameId)}`;
}

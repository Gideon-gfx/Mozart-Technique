import { API_BASE_URL, apiFetch } from './client';
import type { LibraryItem } from './types';
import { uploadFile } from '../utils/uploadFile';

export function fetchMySubjects() {
  return apiFetch<{ success: true; subjects: string[]; isAdmin: boolean }>('/api/library/my-subjects');
}

export function fetchLibraryItems(params: { category?: string; genre?: string; q?: string }) {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.genre) query.set('genre', params.genre);
  if (params.q) query.set('q', params.q);
  const qs = query.toString();
  return apiFetch<{ success: true; items: LibraryItem[] }>(`/api/library${qs ? `?${qs}` : ''}`);
}

// --- Tutor's own library uploads (mirrors tutor.html's "Technique video
// uploads" card exactly - same /api/tutor-library* routes) ---

export function fetchMyTutorLibrary() {
  return apiFetch<{ success: true; items: LibraryItem[] }>('/api/tutor-library/mine');
}

const UPLOAD_TIMEOUT_MS = 90000; // a video file can be large; same reasoning as chat.ts's attachment upload

export function uploadTutorLibraryVideo(file: { uri: string; name: string; type: string }) {
  return uploadFile<{ success: true; url: string }>(`${API_BASE_URL}/api/tutor-library/upload`, file, 'video', UPLOAD_TIMEOUT_MS);
}

export function createTutorLibraryItem(payload: { title: string; description?: string; url: string; category: string; genre?: string | null; isFile: boolean }) {
  return apiFetch<{ success: true; item: LibraryItem }>('/api/tutor-library', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteTutorLibraryItem(id: number) {
  return apiFetch<{ success: true }>(`/api/tutor-library/${id}`, { method: 'DELETE' });
}

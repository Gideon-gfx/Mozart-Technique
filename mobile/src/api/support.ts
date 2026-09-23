import { API_BASE_URL, apiFetch } from './client';
import type { SupportThread } from './types';
import { uploadFile } from '../utils/uploadFile';

// Mirrors server.js's /api/mozart-ai/* routes - a message auto-escalates to
// a human agent thread server-side, same behavior as the web widget.
export function fetchSupportThread() {
  return apiFetch<{ success: true; thread: SupportThread }>('/api/mozart-ai/thread');
}

export function sendSupportMessage(text: string) {
  return apiFetch<{ success: true; thread: SupportThread }>('/api/mozart-ai/message', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

// Multipart, not JSON - can't go through apiFetch, which always sets
// Content-Type: application/json.
export function sendSupportAttachment(file: { uri: string; name: string; type: string }) {
  return uploadFile<{ success: true; thread: SupportThread }>(`${API_BASE_URL}/api/mozart-ai/attachment`, file, 'file');
}

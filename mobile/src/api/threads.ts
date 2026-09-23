import { apiFetch } from './client';

export type MuteDuration = '8h' | '1w' | 'always';

function threadPath(type: 'assignment' | 'group' | 'org', id: number, action: string) {
  return `/api/threads/${type}/${id}/${action}`;
}

export function toggleFavorite(type: 'assignment' | 'group' | 'org', id: number) {
  return apiFetch<{ success: true; favorite: boolean }>(threadPath(type, id, 'favorite'), { method: 'POST' });
}

export function toggleArchive(type: 'assignment' | 'group' | 'org', id: number) {
  return apiFetch<{ success: true; archived: boolean }>(threadPath(type, id, 'archive'), { method: 'POST' });
}

export function togglePin(type: 'assignment' | 'group' | 'org', id: number) {
  return apiFetch<{ success: true; pinned: boolean }>(threadPath(type, id, 'pin'), { method: 'POST' });
}

// duration null unmutes.
export function setMute(type: 'assignment' | 'group' | 'org', id: number, duration: MuteDuration | null) {
  return apiFetch<{ success: true; muted: unknown }>(threadPath(type, id, 'mute'), {
    method: 'POST',
    body: JSON.stringify({ duration }),
  });
}

export function markUnread(type: 'assignment' | 'group' | 'org', id: number) {
  return apiFetch<{ success: true }>(threadPath(type, id, 'mark-unread'), { method: 'POST' });
}

export function clearThread(type: 'assignment' | 'group' | 'org', id: number) {
  return apiFetch<{ success: true }>(threadPath(type, id, 'clear'), { method: 'POST' });
}

export function deleteThread(type: 'assignment' | 'group' | 'org', id: number) {
  return apiFetch<{ success: true }>(threadPath(type, id, 'delete'), { method: 'POST' });
}

// Direct threads only (400s for a group).
export function toggleBlock(assignmentId: number) {
  return apiFetch<{ success: true; blocked: boolean }>(threadPath('assignment', assignmentId, 'block'), { method: 'POST' });
}

export function markAllRead() {
  return apiFetch<{ success: true }>('/api/threads/mark-all-read', { method: 'POST' });
}

export function reportThread(threadKey: string, reason: string) {
  return apiFetch<{ success: true }>('/api/reports', {
    method: 'POST',
    body: JSON.stringify({ threadKey, reason }),
  });
}

export interface CreateGroupPayload {
  course: string;
  groupName: string;
  studentIds: number[];
}

export function createTutorGroupChat(payload: CreateGroupPayload) {
  return apiFetch<{ success: true; conversation: { id: number; title: string } }>('/api/tutors/me/group-chats', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

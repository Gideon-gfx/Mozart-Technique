import { apiFetch } from './client';

// One-off, admin-broadcast opinion polls (data/polls.js on the backend) -
// no right answer, shown as a popup once per user wherever they happen to
// be. Separate from Tutor/Performer Orientation and from Orientation
// Updates' quiz questions, which are graded/audience-scoped.

export interface ActivePoll {
  id: number;
  question: string;
  options: string[];
}

// The respondent's view - just enough to render the popup, no counts.
export function fetchActivePoll() {
  return apiFetch<{ success: true; poll: ActivePoll | null }>('/api/polls/active');
}

export function respondToPoll(pollId: number, optionIndex: number) {
  return apiFetch<{ success: true }>(`/api/polls/${pollId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ optionIndex }),
  });
}

export function dismissPoll(pollId: number) {
  return apiFetch<{ success: true }>(`/api/polls/${pollId}/dismiss`, { method: 'POST' });
}

// --- Admin ---

export interface AdminPoll {
  id: number;
  question: string;
  options: string[];
  active: boolean;
  createdAt: string;
  counts: number[];
  totalResponses: number;
  totalSeen: number;
}

export function fetchAdminPolls() {
  return apiFetch<{ success: true; polls: AdminPoll[] }>('/api/admin/polls');
}

export function createPoll(question: string, options: string[]) {
  return apiFetch<{ success: true; poll: AdminPoll }>('/api/admin/polls', {
    method: 'POST',
    body: JSON.stringify({ question, options }),
  });
}

export function closePoll(pollId: number) {
  return apiFetch<{ success: true; poll: AdminPoll }>(`/api/admin/polls/${pollId}/close`, { method: 'POST' });
}

export function deletePoll(pollId: number) {
  return apiFetch<{ success: true }>(`/api/admin/polls/${pollId}`, { method: 'DELETE' });
}

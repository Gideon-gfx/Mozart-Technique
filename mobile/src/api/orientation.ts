import { API_BASE_URL, apiFetch } from './client';
import { uploadFile } from '../utils/uploadFile';

const UPLOAD_TIMEOUT_MS = 90000; // matches admin.ts's video uploader - files can be sizeable

export interface OrientationContent {
  title: string;
  notes: string;
  videoUrl: string | null;
  rewardType: string | null;
  updatedAt: string;
}

export interface OrientationQuestion {
  index: number;
  question: string;
  options: string[];
}

// Same real /api/orientation the web orientation-hub.html page uses -
// audience (tutor/student/organization/sponsor/admin/support_agent) is
// resolved server-side from the signed-in account, so this one call always
// returns the right content for whoever's asking.
export function fetchOrientation() {
  return apiFetch<{ success: true; audience: string; content: OrientationContent | null; questions: OrientationQuestion[] }>('/api/orientation');
}

// Only the tutor audience gets a gradeable questionnaire (matches
// orientation-hub.html: the quiz only renders when audience === 'tutor').
export function submitTutorOrientation(answers: number[]) {
  return apiFetch<{ success: true; passed: boolean; score: number; reward: number }>('/api/tutors/orientation/submit', {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

export type OrientationAudience = 'tutor' | 'student' | 'admin' | 'sponsor' | 'organization' | 'support_agent';

export interface OrientationComment {
  id: number;
  userId: number;
  userName: string;
  text: string;
  createdAt: string;
}

export interface OrientationPost {
  id: number;
  audience: OrientationAudience;
  title: string;
  notes: string;
  videoUrl: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  required: boolean;
  createdByName: string;
  createdAt: string;
  reactions: { userId: number; emoji: string }[];
  myReaction: string | null;
  comments: OrientationComment[];
  // The caller's own progress on this post - always present, computed
  // server-side per viewer (same idea as myReaction above).
  hasQuiz: boolean;
  finished: boolean;
  passed: boolean;
  attempts: number;
  done: boolean;
}

// A question as the admin composer edits it - correctIndex included, unlike
// OrientationQuestion above (which is what a taker receives, with the
// answer stripped out server-side).
export interface OrientationQuizDraftQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface OrientationQuizReviewQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  yourAnswer: number;
}

export interface OrientationPostStatus {
  id: number;
  title: string;
  hasQuiz: boolean;
  finished: boolean;
  passed: boolean;
  attempts: number;
  bestScore: number;
  done: boolean;
}

// A separate dated, reactable "updates" feed - distinct from the one-time
// onboarding content/quiz above.
export function fetchOrientationPosts() {
  return apiFetch<{ success: true; audience: OrientationAudience; posts: OrientationPost[] }>('/api/orientation/posts');
}

export function reactToOrientationPost(id: number, emoji: string) {
  return apiFetch<{ success: true; post: OrientationPost }>(`/api/orientation/posts/${id}/react`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

// Anyone who can see a post can comment on it, same as reacting - not
// admin-only, unlike creating/deleting the post itself.
export function commentOnOrientationPost(id: number, text: string) {
  return apiFetch<{ success: true; post: OrientationPost }>(`/api/orientation/posts/${id}/comment`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function deleteOrientationComment(postId: number, commentId: number) {
  return apiFetch<{ success: true; post: OrientationPost }>(`/api/orientation/posts/${postId}/comment/${commentId}`, { method: 'DELETE' });
}

// Admin-only authoring - the feed itself is read by every audience.
// `audiences` may include 'all' to send to every dashboard at once; the
// server fans that out into one post per real audience and returns all of
// them (plus the first one under `post`, for older callers).
export function createOrientationPost(payload: {
  audiences: (OrientationAudience | 'all')[];
  title: string;
  notes?: string;
  videoUrl?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  required?: boolean;
  questions?: OrientationQuizDraftQuestion[];
}) {
  return apiFetch<{ success: true; post: OrientationPost; posts: OrientationPost[] }>('/api/admin/orientation/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Marks a post viewed - the only completion step when it has no quiz; when
// it does, this just unlocks the quiz (passing it is what completes it).
export function finishOrientationPost(id: number) {
  return apiFetch<{ success: true }>(`/api/orientation/posts/${id}/finish`, { method: 'POST' });
}

export function fetchOrientationPostQuiz(id: number) {
  return apiFetch<{ success: true; questions: OrientationQuestion[] }>(`/api/orientation/posts/${id}/quiz`);
}

// A passing result additionally carries `review` (each question with the
// correct answer and what the user picked, for the green/red display) - a
// failing one only carries the score, the server withholds the answers.
export function submitOrientationPostQuiz(id: number, answers: number[]) {
  return apiFetch<
    | { success: true; passed: false; correct: number; total: number; score: number }
    | { success: true; passed: true; correct: number; total: number; score: number; review: OrientationQuizReviewQuestion[] }
  >(`/api/orientation/posts/${id}/quiz/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

// Every required post targeted at the caller's own resolved audience, with
// their completion state - `blocked` is what gates a tutor's withdrawal and
// drives the recurring reminder for everyone else.
export function fetchOrientationStatus() {
  return apiFetch<{ success: true; audience: OrientationAudience; posts: OrientationPostStatus[]; blocked: boolean }>('/api/orientation/status');
}

// Admin-only: attaches (or replaces) a post's quiz after it already exists.
export function attachOrientationQuiz(postId: number, questions: OrientationQuizDraftQuestion[]) {
  return apiFetch<{ success: true; questions: OrientationQuizDraftQuestion[] }>(`/api/admin/orientation/posts/${postId}/quiz`, {
    method: 'POST',
    body: JSON.stringify({ questions }),
  });
}

// Any file type (documents, letters, images, anything but the handful of
// executable/markup extensions the server blocks) - separate from the
// video-only upload the one-time onboarding content editor uses.
export function uploadOrientationAttachment(file: { uri: string; name: string; type: string }) {
  return uploadFile<{ success: true; url: string; name: string }>(
    `${API_BASE_URL}/api/admin/orientation/posts/upload-file`,
    file,
    'file',
    UPLOAD_TIMEOUT_MS,
  );
}

export function deleteOrientationPost(id: number) {
  return apiFetch<{ success: true }>(`/api/admin/orientation/posts/${id}`, { method: 'DELETE' });
}

// Admin's manage view - every posted update across every audience, unlike
// fetchOrientationPosts() which resolves the caller's own single audience.
export function fetchAdminOrientationPosts() {
  return apiFetch<{ success: true; posts: OrientationPost[] }>('/api/admin/orientation/posts');
}

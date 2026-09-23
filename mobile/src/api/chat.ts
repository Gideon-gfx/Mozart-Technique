import { API_BASE_URL, apiFetch } from './client';
import type { ChatAttachment, ChatMessage, Conversation } from './types';
import { uploadFile } from '../utils/uploadFile';

export function fetchConversations() {
  return apiFetch<{ success: true; conversations: Conversation[] }>('/api/conversations');
}

// Also marks the thread read for this role - same as chat.html loading it.
export function fetchMessages(assignmentId: number) {
  return apiFetch<{ success: true; messages: ChatMessage[]; role: 'student' | 'tutor' }>(`/api/assignments/${assignmentId}/messages`);
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string;
}

// Tolerant by design (matches the server route) - a failure just resolves
// preview:null rather than throwing, so a caller never needs its own
// try/catch to keep a plain link rendering when no preview is available.
export function fetchLinkPreview(url: string) {
  return apiFetch<{ success: true; preview: LinkPreview | null }>(`/api/link-preview?url=${encodeURIComponent(url)}`);
}

export function sendMessage(assignmentId: number, text: string, replyToId?: number) {
  return apiFetch<{ success: true; message: ChatMessage }>(`/api/assignments/${assignmentId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text, replyToId: replyToId || undefined }),
  });
}

// Multipart upload first (returns a URL), then a normal message referencing
// it - same two-step flow chat.html uses, so an abandoned upload never
// becomes a half-sent message. text is an optional caption typed alongside
// the picked file in the composer - the message route accepts text and
// attachment together in one message rather than as two separate sends.
export async function sendAttachment(assignmentId: number, file: { uri: string; name: string; type: string }, text?: string, replyToId?: number) {
  const data = await uploadFile<{ success: true; attachment: ChatAttachment }>(`${API_BASE_URL}/api/chat/upload`, file, 'file');
  return apiFetch<{ success: true; message: ChatMessage }>(`/api/assignments/${assignmentId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ attachment: data.attachment, text: text || undefined, replyToId: replyToId || undefined }),
  });
}

export function editMessage(assignmentId: number, messageId: number, text: string) {
  return apiFetch<{ success: true; message: ChatMessage }>(`/api/assignments/${assignmentId}/messages/${messageId}`, {
    method: 'PUT',
    body: JSON.stringify({ text }),
  });
}

// "Delete for everyone" - only works within 10 minutes of sending and only
// before the recipient has seen it (server-enforced; ChatScreen also checks
// this client-side to decide whether to even offer the option).
export function deleteMessageForEveryone(assignmentId: number, messageId: number) {
  return apiFetch<{ success: true; message: ChatMessage }>(`/api/assignments/${assignmentId}/messages/${messageId}`, {
    method: 'DELETE',
  });
}

export function deleteMessageForMe(assignmentId: number, messageId: number) {
  return apiFetch<{ success: true; message: ChatMessage }>(`/api/assignments/${assignmentId}/messages/${messageId}/delete-for-me`, {
    method: 'POST',
  });
}

export function toggleMessagePin(assignmentId: number, messageId: number) {
  return apiFetch<{ success: true; message: ChatMessage }>(`/api/assignments/${assignmentId}/messages/${messageId}/pin`, {
    method: 'POST',
  });
}

// One reaction per user per message (data/chat.js's addReaction) - the same
// emoji again removes it, a different one replaces it. Server validates
// against the fixed 5-emoji set in data/reaction-emoji.js.
export function reactToMessage(assignmentId: number, messageId: number, emoji: string) {
  return apiFetch<{ success: true; message: ChatMessage }>(`/api/assignments/${assignmentId}/messages/${messageId}/react`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

// Forwarding sends a real new message to the target thread - an existing
// attachment's URL can be reused directly (server.js validates it's one of
// our own uploads) rather than re-uploading the file. There's no dedicated
// "forwarded" field in data/chat.js's message shape, so the tag is a
// visible text prefix on the message itself, not a hidden flag.
export function forwardMessage(assignmentId: number, text: string, attachment?: ChatAttachment | null) {
  return apiFetch<{ success: true; message: ChatMessage }>(`/api/assignments/${assignmentId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text, attachment: attachment || undefined }),
  });
}

// Mirrors chat.html's clip menu - poll (2-6 options), location (in-person
// lessons only), and a tagged library clip all go through the same send
// route, just with a different field populated.
export function sendPoll(assignmentId: number, question: string, options: string[]) {
  return apiFetch<{ success: true; message: ChatMessage }>(`/api/assignments/${assignmentId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ poll: { question, options } }),
  });
}

export function sendLocation(assignmentId: number, lat: number, lng: number) {
  return apiFetch<{ success: true; message: ChatMessage }>(`/api/assignments/${assignmentId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ location: { lat, lng } }),
  });
}

export function sendLibraryClip(assignmentId: number, libraryItemId: number, text?: string) {
  return apiFetch<{ success: true; message: ChatMessage }>(`/api/assignments/${assignmentId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ libraryItemId, text: text || undefined }),
  });
}

export function votePoll(assignmentId: number, messageId: number, optionId: number) {
  return apiFetch<{ success: true; message: ChatMessage }>(`/api/assignments/${assignmentId}/messages/${messageId}/poll-vote`, {
    method: 'POST',
    body: JSON.stringify({ optionId }),
  });
}

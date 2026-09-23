import { API_BASE_URL, apiFetch } from './client';
import type { ChatAttachment } from './types';
import { uploadFile } from '../utils/uploadFile';

export interface OrgChatParticipant {
  id: number;
  type: 'org' | 'tutor' | 'student';
  name: string;
}

export interface OrgConversation {
  id: number;
  orgId: number;
  type: 'direct' | 'group' | 'tutor-group';
  title: string;
  groupImageUrl: string | null;
  participants: OrgChatParticipant[];
  createdAt: string;
  unreadCount?: number;
  meetingLink?: string | null;
}

export interface OrgChatPoll {
  question: string;
  options: { id: number; text: string }[];
  votes: { userId: number; optionId: number }[];
}

export interface OrgChatMessage {
  id: number;
  senderId: number;
  senderType: 'org' | 'tutor' | 'student';
  senderName: string;
  text: string;
  attachment: ChatAttachment | null;
  libraryItem: { title: string; url: string } | null;
  poll: OrgChatPoll | null;
  location: { lat: number; lng: number } | null;
  reactions: { userId: number; role: string; emoji: string }[];
  pinned?: boolean;
  deleted?: boolean;
  createdAt: string;
  readByOrg: boolean;
  readByTutor: boolean;
  readByStudent: boolean;
}

// The tutor's own org-chat conversations: a real 1:1 thread with the
// organization itself (auto-created server-side), plus any classroom group
// chats they're part of. Distinct from the per-assignment lesson chat
// (ChatScreen) - this is the same real org-chat system org-tutor.html uses.
export function fetchMyOrgConversations() {
  return apiFetch<{ success: true; conversations: OrgConversation[]; organizationName: string }>('/api/organizations/mine/conversations');
}

// asRole matters only for an account that holds more than one relationship
// to the same conversation (it owns the org AND separately has a tutor
// profile linked to it) - without it the server defaults to resolving
// "org" first, which would mark every message this account sends as
// unread for its own tutor side. Pass whichever mode the caller is
// actually in (RoleModeContext); a normal single-role account can omit it.
export function fetchOrgConversationMessages(conversationId: number, asRole?: 'org' | 'tutor') {
  const qs = asRole ? `?asRole=${asRole}` : '';
  return apiFetch<{ success: true; messages: OrgChatMessage[]; conversation: OrgConversation }>(`/api/org-chat/conversations/${conversationId}/messages${qs}`);
}

interface SendOrgMessagePayload {
  text?: string;
  attachment?: ChatAttachment;
  poll?: { question: string; options: string[] };
  location?: { lat: number; lng: number };
  libraryItem?: { title: string; url: string };
  asRole?: 'org' | 'tutor';
}

function sendOrgMessage(conversationId: number, payload: SendOrgMessagePayload) {
  return apiFetch<{ success: true; message: OrgChatMessage; conversation: OrgConversation }>(`/api/org-chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sendOrgConversationMessage(conversationId: number, text: string, libraryItem?: { title: string; url: string }, asRole?: 'org' | 'tutor') {
  return sendOrgMessage(conversationId, { text, libraryItem, asRole });
}

export function sendOrgPoll(conversationId: number, question: string, options: string[], asRole?: 'org' | 'tutor') {
  return sendOrgMessage(conversationId, { poll: { question, options }, asRole });
}

export function sendOrgLocation(conversationId: number, lat: number, lng: number, asRole?: 'org' | 'tutor') {
  return sendOrgMessage(conversationId, { location: { lat, lng }, asRole });
}

const UPLOAD_TIMEOUT_MS = 90000;

// Uploads through the same generic /api/chat/upload endpoint the
// per-assignment ChatScreen uses (it isn't assignment-scoped - just an
// authenticated file upload), then attaches the result to this
// conversation - full attachment parity with the regular tutor chat.
export async function sendOrgAttachment(conversationId: number, file: { uri: string; name: string; type: string }, asRole?: 'org' | 'tutor') {
  const data = await uploadFile<{ success: true; attachment: ChatAttachment }>(`${API_BASE_URL}/api/chat/upload`, file, 'file', UPLOAD_TIMEOUT_MS);
  return sendOrgMessage(conversationId, { attachment: data.attachment, asRole });
}

function roleQs(asRole?: 'org' | 'tutor') {
  return asRole ? `?asRole=${asRole}` : '';
}

export function editOrgMessage(conversationId: number, messageId: number, text: string, asRole?: 'org' | 'tutor') {
  return apiFetch<{ success: true; message: OrgChatMessage }>(`/api/org-chat/conversations/${conversationId}/messages/${messageId}${roleQs(asRole)}`, {
    method: 'PUT',
    body: JSON.stringify({ text }),
  });
}

export function deleteOrgMessage(conversationId: number, messageId: number, asRole?: 'org' | 'tutor') {
  return apiFetch<{ success: true; message: OrgChatMessage }>(`/api/org-chat/conversations/${conversationId}/messages/${messageId}${roleQs(asRole)}`, {
    method: 'DELETE',
  });
}

export function deleteOrgMessageForMe(conversationId: number, messageId: number, asRole?: 'org' | 'tutor') {
  return apiFetch<{ success: true; message: OrgChatMessage }>(`/api/org-chat/conversations/${conversationId}/messages/${messageId}/delete-for-me${roleQs(asRole)}`, {
    method: 'POST',
  });
}

export function reactToOrgMessage(conversationId: number, messageId: number, emoji: string, asRole?: 'org' | 'tutor') {
  return apiFetch<{ success: true; message: OrgChatMessage }>(`/api/org-chat/conversations/${conversationId}/messages/${messageId}/react${roleQs(asRole)}`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

export function voteOrgPoll(conversationId: number, messageId: number, optionId: number, asRole?: 'org' | 'tutor') {
  return apiFetch<{ success: true; message: OrgChatMessage }>(`/api/org-chat/conversations/${conversationId}/messages/${messageId}/poll-vote${roleQs(asRole)}`, {
    method: 'POST',
    body: JSON.stringify({ optionId }),
  });
}

export function toggleOrgMessagePin(conversationId: number, messageId: number, asRole?: 'org' | 'tutor') {
  return apiFetch<{ success: true; message: OrgChatMessage }>(`/api/org-chat/conversations/${conversationId}/messages/${messageId}/pin${roleQs(asRole)}`, {
    method: 'POST',
  });
}

// A tutor's own classroom group chat within the organization, or the org
// owner's own group of students/tutors (Sponsor Messages' "New group") -
// the same real /api/organizations/group-chat route handles both (it
// auto-adds the tutor as a member server-side when a tutor is the caller).
export function createOrgGroupChat(groupName: string, members: { id: number; type: 'student' | 'tutor'; name: string }[]) {
  return apiFetch<{ success: true; conversation: OrgConversation }>('/api/organizations/group-chat', {
    method: 'POST',
    body: JSON.stringify({ groupName, members }),
  });
}

export function setOrgConversationMeetingLink(conversationId: number, meetingLink: string) {
  return apiFetch<{ success: true; conversation: OrgConversation }>(`/api/org-chat/conversations/${conversationId}/meeting`, {
    method: 'POST',
    body: JSON.stringify({ meetingLink }),
  });
}

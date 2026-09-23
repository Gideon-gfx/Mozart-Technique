import { API_BASE_URL, apiFetch } from './client';
import type { SupportThread } from './types';
import { uploadFile } from '../utils/uploadFile';

// Mirrors server.js's /api/support-agent/* routes (backs public/support-
// agent's own inbox page) - the agent side of the exact thread a customer's
// LiveSupportScreen/mozart-ai widget escalates into, hence reusing that
// SupportThread/SupportMessage shape rather than redefining it.
export interface AgentSupportThread extends SupportThread {
  userName: string;
  userEmail: string;
  assignedAgentId?: number | null;
  assignedAgentName?: string | null;
  escalatedAt?: string | null;
  closedAt?: string | null;
  customerRole: string;
  customerSupportAgent: boolean;
}

export function fetchAgentThreads() {
  return apiFetch<{ success: true; threads: AgentSupportThread[] }>('/api/support-agent/threads');
}

export function claimThread(threadId: number) {
  return apiFetch<{ success: true; thread: AgentSupportThread }>(`/api/support-agent/threads/${threadId}/claim`, { method: 'POST' });
}

export function sendAgentMessage(threadId: number, text: string) {
  return apiFetch<{ success: true; thread: AgentSupportThread }>(`/api/support-agent/threads/${threadId}/message`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function closeThread(threadId: number) {
  return apiFetch<{ success: true; thread: AgentSupportThread }>(`/api/support-agent/threads/${threadId}/close`, { method: 'POST' });
}

// Multipart, not JSON - same reasoning as support.ts's sendSupportAttachment.
export function sendAgentAttachment(threadId: number, file: { uri: string; name: string; type: string }) {
  return uploadFile<{ success: true; thread: AgentSupportThread }>(`${API_BASE_URL}/api/support-agent/threads/${threadId}/attachment`, file, 'file');
}

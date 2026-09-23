import { apiFetch } from './client';

// Mirrors public/teacher-education.html's own API calls - the tutor-facing
// side of Part 1-3's admin-assigned quizzes, MT certification/external-
// credential portal, and tier-equivalency engine.

export interface Tier {
  code: string;
  label: string;
  rank: number;
  canTeachStudentLevel: string;
  mtPointsFloor: number;
}
export function fetchTiers() {
  return apiFetch<{ success: true; tiers: Tier[] }>('/api/teaching-tiers');
}

export interface Standing {
  tutorId: number;
  nativePoints: number;
  nativeBreakdown: { source: string; points: number }[];
  externalPoints: number;
  externalBreakdown: { source: string; points: number; capped: boolean }[];
  externalPointsCapped: boolean;
  totalPoints: number;
  pointsOnlyTier: string;
  unlockedTier: string;
  practicumGated: boolean;
  nextTier: string | null;
  pointsToNext: number;
  policyVersion: number;
}
export function fetchStanding() {
  return apiFetch<{ success: true; standing: Standing }>('/api/teacher-ed/standing');
}

export interface QuizAssignment {
  id: number;
  assignedTo: number;
  targetType: string;
  targetId: string;
  reason: string | null;
  dueAt: string | null;
  status: 'assigned' | 'started' | 'completed' | 'overdue' | 'waived';
  createdAt: string;
}
export function fetchMyAssignments() {
  return apiFetch<{ success: true; items: QuizAssignment[] }>('/api/teacher-ed/my-assignments');
}
export function startAssignment(id: number) {
  return apiFetch<{ success: true }>(`/api/teacher-ed/my-assignments/${id}/start`, { method: 'POST' });
}

export interface CertQuestion { id: number; text: string; options: string[]; dimension: string }
export interface CertModule {
  code: string;
  title: string;
  kind: 'foundation' | 'specialist';
  dimensions: string[];
  resource: { type: string; title: string; body: string } | null;
  questions: CertQuestion[];
  active: boolean;
}
export function fetchModules() {
  return apiFetch<{ success: true; modules: CertModule[]; dimensions: { code: string; label: string }[] }>('/api/teacher-ed/modules');
}
export interface AttemptResult {
  overallPct: number;
  dimensionScores: Record<string, { pct: number; level: number }>;
  passed: boolean;
}
export function submitAttempt(code: string, answers: { questionId: number; selectedIndex: number }[]) {
  return apiFetch<{ success: true; attempt: AttemptResult }>(`/api/teacher-ed/modules/${code}/attempt`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

export interface CrosswalkRow {
  id: number;
  body: string;
  credentialName: string;
  credentialType: string;
  bodysOwnAnchor: string;
  mtPoints: number;
  proposedTier: string;
  verificationMethod: string;
}
export function fetchCrosswalk(q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiFetch<{ success: true; rows: CrosswalkRow[] }>(`/api/credential-crosswalk${qs}`);
}

export interface CredentialSubmission {
  id: number;
  tutorId: number;
  crosswalkSnapshot: { body: string; credentialName: string; bodysOwnAnchor: string; verificationMethod: string };
  status: 'pending' | 'verified' | 'rejected' | 'expired';
  reviewNote: string | null;
  mtPointsAwarded: number | null;
  submittedAt: string;
}
export function submitCredential(crosswalkId: number, evidenceUrl?: string, issuingBodyRef?: string) {
  return apiFetch<{ success: true; submission: CredentialSubmission }>('/api/teacher-ed/credentials', {
    method: 'POST',
    body: JSON.stringify({ crosswalkId, evidenceUrl, issuingBodyRef }),
  });
}
export function fetchMyCredentials() {
  return apiFetch<{ success: true; submissions: CredentialSubmission[] }>('/api/teacher-ed/my-credentials');
}

export interface PracticumReview {
  id: number;
  tutorId: number;
  stage: 'advanced_specialist' | 'professional';
  status: 'pending' | 'passed' | 'rejected';
  reviewNote: string | null;
  submittedAt: string;
}
export function submitPracticum(stage: 'advanced_specialist' | 'professional', videoUrl?: string, lessonPlanUrl?: string, outcomeNote?: string) {
  return apiFetch<{ success: true; review: PracticumReview }>('/api/teacher-ed/practicum', {
    method: 'POST',
    body: JSON.stringify({ stage, videoUrl, lessonPlanUrl, outcomeNote }),
  });
}
export function fetchMyPracticum() {
  return apiFetch<{ success: true; reviews: PracticumReview[] }>('/api/teacher-ed/my-practicum');
}

export function submitAppeal(kind: 'credential' | 'practicum', id: number, message: string) {
  return apiFetch<{ success: true }>('/api/teacher-ed/appeals', {
    method: 'POST',
    body: JSON.stringify({ kind, id, message }),
  });
}

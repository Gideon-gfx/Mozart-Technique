import { apiFetch } from './client';
import type { AssignmentSummary, PublicUser } from './types';

export function login(email: string, password: string) {
  return apiFetch<{ success: true; user: PublicUser }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function signup(name: string, email: string, password: string) {
  return apiFetch<{ success: true; user: PublicUser }>('/api/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
}

export function fetchSession() {
  return apiFetch<{ success: true; user: PublicUser | null }>('/api/session');
}

export function logout() {
  return apiFetch<{ success: true }>('/api/logout', { method: 'POST' });
}

export function loginWithGoogle(credential: string) {
  return apiFetch<{ success: true; user: PublicUser }>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}

export function completeAppOnboarding() {
  return apiFetch<{ success: true; user: PublicUser }>('/api/me/onboarding-complete', { method: 'POST' });
}

export function markTourSeen(tourId: string) {
  return apiFetch<{ success: true; user: PublicUser }>(`/api/me/tours/${encodeURIComponent(tourId)}/seen`, { method: 'POST' });
}

// Emails a 6-digit OTP to the account (data/mailer.js's
// sendPasswordResetEmail) - the user types it back in on the next step.
// devCode only ever comes back outside production (server.js gates it on
// NODE_ENV), as a local-dev convenience when there's no real inbox handy.
export function forgotPassword(email: string) {
  return apiFetch<{ success: true; emailSent: boolean; devCode?: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function verifyResetCode(token: string) {
  return apiFetch<{ success: true }>('/api/auth/verify-reset-code', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function resetPassword(token: string, password: string) {
  return apiFetch<{ success: true }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export function fetchMyAssignments() {
  return apiFetch<{
    success: true;
    asStudent: AssignmentSummary[];
    asTutor: AssignmentSummary[];
    tutorProfile: unknown;
  }>('/api/my-assignments');
}

// The tutor explicitly begins the billable clock only after both people
// have joined the lesson (matches server.js's own comment on this route) -
// starting a meeting link alone never creates a charge. Blocked with a
// clear error for in-person/studio lessons until the matching arrival
// step (student-sees-tutor / tutor-sees-student) happens - that arrival
// flow itself is web-only for now, so those lesson types will surface the
// server's rejection message here rather than a working button.
export function startLesson(assignmentId: number) {
  return apiFetch<{ success: true; lessonStartedAt: string }>(`/api/assignments/${assignmentId}/lesson-start`, {
    method: 'POST',
  });
}

// Ends the lesson and sends the bill - an empty body tells the server to
// compute billable minutes from the clock startLesson() started, exactly
// like web's "End lesson & send bill" button (chat.html).
export function endLessonAndSendBill(assignmentId: number) {
  return apiFetch<{ success: true; session: { id: number; durationMinutes: number; totalUsd: number; isFreeTrial: boolean } }>(`/api/assignments/${assignmentId}/sessions`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// Student confirms and pays a held lesson bill - mirrors chat.html's
// "Confirm class & pay". Either the saved card gets charged immediately
// (paidAutomatically:true) or, with no saved card yet, the server hands
// back a Stripe Checkout URL to open instead (redirectToCheckout:true).
export function confirmSessionPayment(assignmentId: number, sessionId: number) {
  return apiFetch<
    | { success: true; paidAutomatically: true; session: { id: number; paymentStatus: string } }
    | { success: true; redirectToCheckout: true; checkoutUrl: string }
  >(`/api/assignments/${assignmentId}/sessions/${sessionId}/confirm`, { method: 'POST' });
}

// Tutor cancels a held bill they sent by mistake - mirrors chat.html's
// "Cancel bill".
export function cancelSessionBill(assignmentId: number, sessionId: number) {
  return apiFetch<{ success: true; session: { id: number; paymentStatus: string } }>(`/api/assignments/${assignmentId}/sessions/${sessionId}/cancel`, { method: 'POST' });
}

export interface EnrolledCourse {
  id: number;
  category: string;
  level: string;
  title: string;
  status: string;
  statusText: string;
}

// The full raw studentProfile object (data/store.js), not just the
// dashboard-card subset - /api/dashboard hands this back verbatim.
export interface StudentProfile {
  ageGroup: string | null;
  city: string | null;
  genres?: string[];
  sex?: string | null;
  agreementAcceptedAt?: string | null;
}

// Also bumps the daily activity streak server-side (store.markActive) -
// same as visiting the web dashboard does.
export function fetchDashboardStats() {
  return apiFetch<{
    success: true;
    streak: { count: number };
    enrolledCourses: EnrolledCourse[];
    studentProfile: StudentProfile | null;
  }>('/api/dashboard');
}

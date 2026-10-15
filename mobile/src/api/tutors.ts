import { apiFetch } from './client';
import type { Taxonomy, TutorPublicProfile, TutorReview, TutorSummary } from './types';

export function fetchTaxonomy() {
  return apiFetch<{ success: true } & Taxonomy>('/api/taxonomy');
}

// No email/phone in this shape - same public listing page a tutor's link
// resolves to on web.
export function fetchTutorPublicProfile(id: number) {
  return apiFetch<{ success: true; tutor: TutorPublicProfile; reviews: TutorReview[] }>(`/api/tutors/${id}/public`);
}

export interface TutorSearchParams {
  category?: string;
  genre?: string;
  ageGroup?: string;
  city?: string;
  lessonType?: 'online' | 'physical' | 'studio';
  // Org Student mode's own Find a Tutor - scopes the results down to just
  // that organization's linked tutors.
  orgId?: number;
}

export function searchTutors(params: TutorSearchParams) {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.genre) query.set('genre', params.genre);
  if (params.ageGroup) query.set('ageGroup', params.ageGroup);
  if (params.city) query.set('city', params.city);
  if (params.lessonType) query.set('lessonType', params.lessonType);
  if (params.orgId) query.set('orgId', String(params.orgId));
  const qs = query.toString();
  return apiFetch<{ success: true; tutors: TutorSummary[]; viewerCountry: string }>(
    `/api/tutors${qs ? `?${qs}` : ''}`,
  );
}

// The full raw record /api/tutors/me returns (data/tutors.js's apply()) -
// widened from the original {id, categories, hourlyRateUsd} to cover what
// the Tutor Dashboard needs (name/photo, status, rating sums, wallet).
export interface MyTutorProfile {
  publicExactLocation?: boolean;
  id: number;
  userId: number;
  name: string;
  photoUrl: string | null;
  status: 'pending' | 'approved' | 'rejected';
  categories: string[];
  genres: string[];
  bio: string;
  qualifications: string;
  city: string | null;
  teachesOnline: boolean;
  inPersonVenue: 'student_location' | 'tutor_studio' | 'either';
  hourlyRateUsd: number;
  ratingSum: number;
  ratingCount: number;
  professionalismSum: number;
  professionalismCount: number;
  lessonsCompletedCount: number;
  balanceUsd: number;
  activationPaid: boolean;
  activationGrandfathered: boolean;
}

export function fetchMyTutorProfile() {
  return apiFetch<{ success: true; profile: MyTutorProfile | null }>('/api/tutors/me');
}

export interface PendingTutorRequest {
  id: number;
  category: string;
  lessonType: 'online' | 'physical' | 'studio';
  studentId: number;
  studentName: string;
  studentPhotoUrl: string | null;
  studentAgeGroup: string | null;
  studentCity: string | null;
  desiredLevel?: string | null;
  createdAt: string;
}

export function fetchPendingTutorRequests() {
  return apiFetch<{ success: true; requests: PendingTutorRequest[] }>('/api/tutors/me/pending-requests');
}

export function acceptPendingTutorRequest(id: number) {
  return apiFetch<{ success: true }>(`/api/tutors/me/pending-requests/${id}/accept`, { method: 'POST' });
}

export function fetchMyPayouts() {
  return apiFetch<{
    success: true;
    payoutDetails: { accountName?: string; bankName?: string; accountNumber?: string } | null;
    payouts: { id: number; amountUsd: number; status: string; createdAt: string }[];
    availableBalanceUsd: number;
    pendingAmountUsd: number;
  }>('/api/tutors/me/payouts');
}

export function savePayoutDetails(payload: { accountName: string; bankName: string; accountNumber: string }) {
  return apiFetch<{ success: true }>('/api/tutors/me/payout-details', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function requestWithdrawal(amount: number) {
  return apiFetch<{ success: true }>('/api/tutors/me/withdraw', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

// Creates a real Google Calendar event with a Meet link and invites the
// student - same /api/assignments/:id/schedule route tutor.html's own
// "Schedule meeting" modal uses. Requires the tutor to have connected
// Google Calendar first (server 400s with a clear message otherwise).
export function scheduleAssignment(assignmentId: number, startISO: string, durationMinutes: number) {
  return apiFetch<{ success: true }>(`/api/assignments/${assignmentId}/schedule`, {
    method: 'POST',
    body: JSON.stringify({ startISO, durationMinutes }),
  });
}

// Ends the tutor's own side of an active assignment - the "Remove student"
// long-press action on the Students tab.
export function endAssignment(assignmentId: number) {
  return apiFetch<{ success: true }>(`/api/assignments/${assignmentId}/end`, { method: 'POST' });
}

export function setMyCategories(categories: string[]) {
  return apiFetch<{ success: true; profile: MyTutorProfile }>('/api/tutors/me/categories', {
    method: 'POST',
    body: JSON.stringify({ categories }),
  });
}

export function setMyHourlyRate(hourlyRateUsd: number) {
  return apiFetch<{ success: true; profile: MyTutorProfile }>('/api/tutors/me/hourly-rate', {
    method: 'POST',
    body: JSON.stringify({ hourlyRateUsd }),
  });
}

export interface TutorProfileDetailsPayload {
  publicExactLocation?: boolean;
  bio?: string;
  qualifications?: string;
  city?: string;
  genres?: string[];
  teachesOnline?: boolean;
  inPersonVenue?: 'student_location' | 'tutor_studio' | 'either';
}

export function updateMyTutorProfile(payload: TutorProfileDetailsPayload) {
  return apiFetch<{ success: true; profile: MyTutorProfile }>('/api/tutors/me/profile', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface TutorRequestPayload {
  category: string;
  lessonType: 'online' | 'physical' | 'studio';
  city?: string;
  notes?: string;
  preferredTutorIds: number[];
  genre?: string;
  ageGroup?: string;
  desiredLevel?: string;
  suggestedAmountUsd?: number;
  // Set only by a sponsor's "Assign a Tutor" flow - submits this request on
  // behalf of one of their own sponsored students instead of the caller.
  assignStudentId?: number;
}

export function requestTutor(payload: TutorRequestPayload) {
  return apiFetch<{ success: true; suggestedAmountLocal: number | null; currency: string; symbol: string }>('/api/tutor-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchBenchmarkRate(category: string) {
  return apiFetch<{ success: true; rate: { category: string; amountUsd: number; amountLocal: number; currency: string; symbol: string } | null }>(
    `/api/benchmark-rates?category=${encodeURIComponent(category)}`,
  );
}

// --- InDrive-style negotiate flow: student side ---

export interface TutorOffer {
  id: number;
  requestId: number;
  tutorId: number;
  status: 'invited' | 'accepted' | 'countered' | 'declined' | 'expired' | 'selected' | 'not_selected';
  suggestedAmountUsd: number | null;
  counterAmountUsd: number | null;
  counterNote: string | null;
  distanceKm: number | null;
  tutorName: string;
  tutorPhotoUrl: string | null;
  tutorBio: string | null;
  tutorCity: string | null;
  avgRating: number | null;
  amountLocal: number | null;
}

export interface MyTutorRequest {
  id: number;
  category: string;
  lessonType: 'online' | 'physical' | 'studio';
  status: string;
  createdAt: string;
  offers: TutorOffer[];
}

export function fetchMyTutorRequests() {
  return apiFetch<{ success: true; requests: MyTutorRequest[]; currency: string; symbol: string }>('/api/tutor-requests/mine');
}

export function selectTutorOffer(requestId: number, offerId: number) {
  return apiFetch<{ success: true }>(`/api/tutor-requests/${requestId}/select`, {
    method: 'POST',
    body: JSON.stringify({ offerId }),
  });
}

// Withdraws a still-pending request (server rejects it once a tutor is
// matched - that's a real assignment by then, not a draft to delete).
export function deleteTutorRequest(requestId: number) {
  return apiFetch<{ success: true }>(`/api/tutor-requests/${requestId}`, { method: 'DELETE' });
}

// Records acceptance of the mandatory Tutor Orientation modal (see
// mobile/src/data/tutorOrientationContent.ts for the version string to pass).
export function acknowledgeTutorOrientation(version: string) {
  return apiFetch<{ success: true; tutorOrientationAcceptedAt: string; tutorOrientationVersion: string | null }>(
    '/api/tutors/me/tutor-orientation/acknowledge',
    { method: 'POST', body: JSON.stringify({ version }) },
  );
}

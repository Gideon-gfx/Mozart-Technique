import { API_BASE_URL, apiFetch } from './client';
import type { PublicUser } from './types';
import { uploadFile } from '../utils/uploadFile';

export function updateName(name: string) {
  return apiFetch<{ success: true; user: PublicUser }>('/api/profile/name', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export interface StudentProfileDetail {
  ageGroup: string | null;
  genres: string[];
  city: string | null;
  sex: string | null;
  agreementAcceptedAt: string | null;
}

// Mirrors dashboard.html's "My Learning Profile" form exactly - same
// /api/profile/student route, same fields. Saving also updates the
// account's shared name/photo (see data/store.js's setStudentProfile), not
// just studentProfile - so this can double as the profile-photo/name editor
// for a student, the same way the web modal does.
export function updateStudentProfile(payload: {
  name?: string;
  ageGroup?: string | null;
  genres?: string[];
  city?: string;
  sex?: string | null;
  photoUrl?: string | null;
  agreementAccepted?: boolean;
}) {
  return apiFetch<{ success: true; studentProfile: StudentProfileDetail }>('/api/profile/student', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Mirrors edit-profile.html's photo input exactly - commits the account
// photo immediately (data/store.js's setPhoto, also syncs a tutor profile
// photo if one exists), unlike uploadPhoto below which just returns a URL
// for a later save.
export function uploadProfilePhoto(file: { uri: string; name: string; type: string }) {
  return uploadFile<{ success: true; photoUrl: string }>(`${API_BASE_URL}/api/profile/photo`, file, 'photo');
}

// Generic image upload (multipart, field "photo") - returns a URL to embed
// in a later JSON save rather than setting any profile field itself. Not
// apiFetch, which always forces a JSON Content-Type.
export function uploadPhoto(file: { uri: string; name: string; type: string }) {
  return uploadFile<{ success: true; url: string }>(`${API_BASE_URL}/api/uploads/photo`, file, 'photo');
}

export interface PaymentMethodStatus {
  success: true;
  hasCard: boolean;
  brand: string | null;
  last4: string | null;
}

export function fetchPaymentMethod() {
  return apiFetch<PaymentMethodStatus>('/api/payment-method');
}

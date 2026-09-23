import { API_BASE_URL, apiFetch } from './client';
import { uploadFile } from '../utils/uploadFile';

export function fetchPerformerCategories() {
  return apiFetch<{ success: true; categories: string[] }>('/api/performer-categories');
}

export function createPerformerCategory(category: string) {
  return apiFetch<{ success: true; categories: string[]; category: string }>('/api/performer-categories', {
    method: 'POST',
    body: JSON.stringify({ category }),
  });
}

export function fetchEventTypes() {
  return apiFetch<{ success: true; eventTypes: string[] }>('/api/event-types');
}

export interface PerformerSummary {
  id: number;
  name: string;
  performerType: string;
  groupSize: number | null;
  categories: string[];
  city: string | null;
  photoUrl: string | null;
  baseRateUsd: number;
  baseRateLocal: number;
  hourlyRateUsd: number;
  eventRateUsd: number;
  hourlyRateLocal: number;
  eventRateLocal: number;
  currency: string;
  symbol: string;
  rateUnit: 'per_hour' | 'per_event';
  bio: string | null;
  experienceYears: number | null;
}

// The full public portfolio returned when someone opens a performer from
// Find a Performer. It deliberately contains only public-facing details;
// contact details, activation state, and dashboard-only fields stay private.
export interface PublicPerformerProfile extends PerformerSummary {
  locality: { city?: string; state?: string; country?: string } | null;
  qualifications: string | null;
  styleTags: string[];
  galleryPhotos: string[];
  videoClips: string[];
  socialLinks: {
    instagram: string | null;
    youtube: string | null;
    tiktok: string | null;
    website: string | null;
    facebook: string | null;
    twitter: string | null;
  };
}

export function fetchPerformers(category?: string) {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return apiFetch<{ success: true; performers: PerformerSummary[] }>(`/api/performers${qs}`);
}

export function fetchPublicPerformer(performerId: number) {
  return apiFetch<{ success: true; performer: PublicPerformerProfile }>(`/api/performers/${performerId}/public`);
}

// Same shared benchmark-rate route tutors.ts's find-a-tutor flow uses.
export function fetchBenchmarkRate(category: string) {
  return apiFetch<{ success: true; rate: { category: string; amountUsd: number; amountLocal: number; currency: string; symbol: string } | null }>(
    `/api/benchmark-rates?category=${encodeURIComponent(category)}`,
  );
}

export interface MarketplaceRequestPayload {
  performerCategory: string;
  eventType: string;
  eventDate: string;
  eventDurationHours: number;
  eventLocation: string;
  radiusKm: number;
  proposedAmountUsd: number;
  notes?: string;
  phone?: string;
  eventMedia?: MarketplaceEventMedia[];
  // Set when this request came from a "Request" button on one specific
  // performer's card/profile - the server then invites only them instead
  // of broadcasting to every performer matching category + radius.
  performerId?: number;
}

export type MarketplaceEventMediaType = 'image' | 'video' | 'link';

// A request can include the visual context performers need to judge an
// event: a reference photo/video uploaded to Mozart, or an http(s) link.
export interface MarketplaceEventMedia {
  type: MarketplaceEventMediaType;
  url: string;
  name?: string;
}

// A broadcast request (mirrors find-performer.html's "Post an Event
// Request") - every matching approved performer within radiusKm of
// eventLocation gets invited to respond, same InDrive-style negotiate
// pattern tutor-requests uses for its own broadcast flow.
export function postMarketplaceRequest(payload: MarketplaceRequestPayload) {
  return apiFetch<{ success: true; invitedCount: number; locationResolved: boolean }>('/api/marketplace/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// --- The performer's own dashboard (mirrors performer.html exactly) ---

export interface MyPerformerProfile {
  id: number;
  userId: number;
  name: string;
  email: string;
  phone: string | null;
  performerType: 'individual' | 'group';
  groupSize: number | null;
  categories: string[];
  city: string | null;
  address: string | null;
  locality: { city?: string; state?: string; country?: string } | null;
  travelRadiusKm: number;
  bio: string;
  experienceYears: number;
  qualifications: string;
  styleTags: string[];
  baseRateUsd: number;
  baseRateLocal: number;
  hourlyRateUsd: number;
  eventRateUsd: number;
  hourlyRateLocal: number;
  eventRateLocal: number;
  currency: string;
  symbol: string;
  rateUnit: 'per_hour' | 'per_event';
  photoUrl: string | null;
  galleryPhotos: string[];
  videoClips: string[];
  socialLinks: {
    instagram: string | null;
    youtube: string | null;
    tiktok: string | null;
    website: string | null;
    facebook: string | null;
    twitter: string | null;
  };
  status: 'pending' | 'approved' | 'rejected';
  suspended: boolean;
  suspendedReason: string | null;
  activationPaid: boolean;
}

export function fetchMyPerformerProfile() {
  return apiFetch<{ success: true; profile: MyPerformerProfile | null }>('/api/performers/me');
}

export function setPerformerCategories(categories: string[]) {
  return apiFetch<{ success: true; profile: MyPerformerProfile }>('/api/performers/me/categories', {
    method: 'POST',
    body: JSON.stringify({ categories }),
  });
}

export function updatePerformerAbout(payload: Pick<MyPerformerProfile, 'bio' | 'experienceYears' | 'qualifications' | 'styleTags'>) {
  return apiFetch<{ success: true; profile: MyPerformerProfile }>('/api/performers/me/about', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function setPerformerRates(hourlyRateLocal: number, eventRateLocal: number) {
  return apiFetch<{ success: true; profile: MyPerformerProfile }>('/api/performers/me/rate', {
    method: 'POST',
    body: JSON.stringify({ hourlyRateLocal, eventRateLocal }),
  });
}

// Kept temporarily for older app screens which may still save a single rate.
export function setPerformerRate(baseRateLocal: number, rateUnit: 'per_hour' | 'per_event') {
  return apiFetch<{ success: true; profile: MyPerformerProfile }>('/api/performers/me/rate', {
    method: 'POST',
    body: JSON.stringify({ baseRateLocal, rateUnit }),
  });
}

export interface PerformerPost {
  id: number;
  text: string;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | 'text';
  createdAt: string;
  updatedAt: string;
  performer?: PerformerSummary;
  reactionCount: number;
  reactedByCurrentUser: boolean;
  comments: Array<{ id: number; userId: number; userName: string; userPhotoUrl: string | null; text: string; createdAt: string }>;
}

export function fetchPerformerPosts() {
  return apiFetch<{ success: true; posts: PerformerPost[] }>('/api/performer-posts');
}

export function fetchMyPerformerPosts() {
  return apiFetch<{ success: true; posts: PerformerPost[] }>('/api/performers/me/posts');
}

export function createPerformerPost(payload: { text?: string; mediaUrl?: string | null; mediaType?: 'image' | 'video' }) {
  return apiFetch<{ success: true; post: PerformerPost }>('/api/performers/me/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function removePerformerPost(postId: number) {
  return apiFetch<{ success: true }>(`/api/performers/me/posts/${postId}`, { method: 'DELETE' });
}

export function togglePerformerPostReaction(postId: number) {
  return apiFetch<{ success: true; post: PerformerPost }>(`/api/performer-posts/${postId}/reaction`, { method: 'POST' });
}

export function addPerformerPostComment(postId: number, text: string) {
  return apiFetch<{ success: true; post: PerformerPost }>(`/api/performer-posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function setPerformerSocialLinks(links: Partial<MyPerformerProfile['socialLinks']>) {
  return apiFetch<{ success: true; profile: MyPerformerProfile }>('/api/performers/me/social-links', {
    method: 'POST',
    body: JSON.stringify(links),
  });
}

export function setPerformerPhoto(photoUrl: string) {
  return apiFetch<{ success: true; profile: MyPerformerProfile }>('/api/performers/me/photo', {
    method: 'POST',
    body: JSON.stringify({ photoUrl }),
  });
}

export function addPerformerGalleryPhoto(url: string) {
  return apiFetch<{ success: true; profile: MyPerformerProfile }>('/api/performers/me/gallery', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function removePerformerGalleryPhoto(url: string) {
  return apiFetch<{ success: true; profile: MyPerformerProfile }>('/api/performers/me/gallery', {
    method: 'DELETE',
    body: JSON.stringify({ url }),
  });
}

export function addPerformerVideo(url: string) {
  return apiFetch<{ success: true; profile: MyPerformerProfile }>('/api/performers/me/videos', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function removePerformerVideo(url: string) {
  return apiFetch<{ success: true; profile: MyPerformerProfile }>('/api/performers/me/videos', {
    method: 'DELETE',
    body: JSON.stringify({ url }),
  });
}

export function startPerformerActivationCheckout() {
  return apiFetch<{ success: true; url: string }>('/api/performers/me/activation-fee/checkout', { method: 'POST' });
}

const UPLOAD_TIMEOUT_MS = 90000; // a video file can be large; same reasoning as chat.ts's / library.ts's attachment uploads

export function uploadPerformerPhoto(file: { uri: string; name: string; type: string }) {
  return uploadFile<{ success: true; url: string }>(`${API_BASE_URL}/api/uploads/photo`, file, 'photo', UPLOAD_TIMEOUT_MS);
}

export function uploadPerformerVideo(file: { uri: string; name: string; type: string }) {
  return uploadFile<{ success: true; url: string }>(`${API_BASE_URL}/api/uploads/performer-video`, file, 'video', UPLOAD_TIMEOUT_MS);
}

// --- Marketplace offers: the performer's own Requests inbox ---

export type MarketplaceOfferStatus = 'invited' | 'accepted' | 'countered' | 'declined' | 'expired' | 'selected' | 'not_selected';

export interface MarketplaceOfferRequest {
  id: number;
  eventType: string;
  performerCategory: string;
  eventDate: string;
  eventDurationHours: number;
  eventLocation: string;
  notes: string | null;
  eventMedia: MarketplaceEventMedia[];
}

export interface MarketplaceOffer {
  id: number;
  requestId: number;
  performerId: number;
  status: MarketplaceOfferStatus;
  proposedAmountUsd: number;
  counterAmountUsd: number | null;
  counterNote: string | null;
  distanceKm: number | null;
  invitedAt: string;
  respondedAt: string | null;
  request: MarketplaceOfferRequest | null;
}

export function fetchMyOffers() {
  return apiFetch<{ success: true; offers: MarketplaceOffer[] }>('/api/marketplace/offers/mine');
}

export function acceptOffer(offerId: number) {
  return apiFetch<{ success: true; offer: MarketplaceOffer }>(`/api/marketplace/offers/${offerId}/accept`, { method: 'POST' });
}

export function declineOffer(offerId: number) {
  return apiFetch<{ success: true; offer: MarketplaceOffer }>(`/api/marketplace/offers/${offerId}/decline`, { method: 'POST' });
}

export function counterOffer(offerId: number, amountUsd: number, note?: string) {
  return apiFetch<{ success: true; offer: MarketplaceOffer }>(`/api/marketplace/offers/${offerId}/counter`, {
    method: 'POST',
    body: JSON.stringify({ amountUsd, note }),
  });
}

// Records acceptance of the mandatory Performer Orientation modal (see
// mobile/src/data/performerOrientationContent.ts for the version string).
export function acknowledgePerformerOrientation(version: string) {
  return apiFetch<{ success: true; performerOrientationAcceptedAt: string; performerOrientationVersion: string | null }>(
    '/api/performers/me/performer-orientation/acknowledge',
    { method: 'POST', body: JSON.stringify({ version }) },
  );
}

import { API_BASE_URL, apiFetch } from './client';
import { uploadFile } from '../utils/uploadFile';

// Mirrors public/admin.html's data shapes and routes, regrouped into the
// mobile app's 5-tab IA (Analytics / Applicants & Users / Tutor Matching /
// Educator Tools / More) instead of the web sidebar's 12 tabs. See that
// file for the full picture - this only wraps what the mobile screens
// actually call.

const UPLOAD_TIMEOUT_MS = 90000; // a video file can be large; same reasoning as chat.ts's / library.ts's attachment uploads

function uploadVideo(endpoint: string, file: { uri: string; name: string; type: string }) {
  return uploadFile<{ success: true; url: string }>(`${API_BASE_URL}${endpoint}`, file, 'video', UPLOAD_TIMEOUT_MS);
}

// --- Analytics ---

export interface AdminAnalytics {
  stats: {
    totalRevenueUsd: number;
    platformRevenueUsd: number;
    revenue30dUsd: number;
    pendingEscrowUsd: number;
    totalUsers: number;
    activeTutors: number;
    lessonsLogged: number;
  };
  revenueByDay: { date: string; amountUsd: number }[];
  topSubjects: { category: string; lessons: number; revenueUsd: number }[];
  tutorLeaderboard: { id: number; name: string; avgRating: number; ratingCount: number; lessonsCompletedCount: number; totalEarnedUsd: number }[];
  // A Country Admin's own moderation record (tutors/orgs/performers THEY
  // personally approved or rejected) - not the platform's revenue numbers,
  // which stay a Main Admin view. Present for every admin, but the mobile
  // screen only leads with it for a non-primary one.
  myActions: {
    tutorsApproved: number;
    tutorsRejected: number;
    organizationsApproved: number;
    organizationsRejected: number;
    performersApproved: number;
    performersRejected: number;
  };
  isPrimaryAdmin: boolean;
}

export function fetchAdminAnalytics(regions?: string) {
  const qs = regions ? `?regions=${encodeURIComponent(regions)}` : '';
  return apiFetch<{ success: true } & AdminAnalytics>(`/api/admin/analytics${qs}`);
}

// --- Applicants & Users ---

export interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  countryCode: string | null;
  adminCountryCode: string | null;
  createdAt: string;
}

export function fetchAdminUsers(search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiFetch<{ success: true; users: AdminUserRow[]; isPrimaryAdmin: boolean }>(`/api/admin/users${qs}`);
}

// Only the caller's own isPrimaryAdmin matters for whether the role picker
// offers admin/country_admin/demo - piggybacks on the users list exactly
// like admin.html does, since there's no dedicated "am I primary" route.
export type AdminAssignableRole = 'user' | 'support_agent' | 'admin' | 'country_admin' | 'demo';

export function setUserRole(userId: number, role: AdminAssignableRole) {
  return apiFetch<{ success: true; user: AdminUserRow }>(`/api/admin/users/${userId}/role`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
}

export function clearUserFlag(userId: number) {
  return apiFetch<{ success: true }>(`/api/admin/users/${userId}/clear-flag`, { method: 'POST' });
}

export interface AdminOrgCode {
  code: string;
  role: 'student' | 'tutor';
  isOrganizationalCode?: boolean;
  sentToOrganization?: boolean;
  redeemedAt?: string | null;
  redeemedBy?: number | null;
}

export interface AdminOrganizationRow {
  id: number;
  name: string | null;
  contactName: string;
  email: string;
  phone?: string | null;
  registrationNumber?: string | null;
  fullAddress?: string | null;
  description?: string | null;
  certificateUrl?: string | null;
  sponsorType: 'individual' | 'ngo';
  organizationType?: 'ngo' | 'institution';
  status: 'pending' | 'approved' | 'rejected';
  subscriptionStatus: string;
  subscriptionEndAt?: string | null;
  locality?: { city?: string; state?: string; country?: string } | null;
  numStudents?: number | null;
  numTutors?: number | null;
  members?: unknown[];
  tutors?: unknown[];
  studentCodes?: AdminOrgCode[];
  tutorCodes?: AdminOrgCode[];
  monthlyAmount?: number;
}

export function fetchAdminOrganizations() {
  return apiFetch<{ success: true; organizations: AdminOrganizationRow[] }>('/api/admin/organizations');
}

export function setOrganizationStatus(orgId: number, status: 'approved' | 'rejected') {
  return apiFetch<{ success: true; organization: AdminOrganizationRow }>(`/api/admin/organizations/${orgId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export function activateOrganizationSubscription(orgId: number, months: 1 | 12) {
  return apiFetch<{ success: true; organization: AdminOrganizationRow }>(`/api/admin/organizations/${orgId}/activate`, {
    method: 'POST',
    body: JSON.stringify({ months }),
  });
}

export function setOrganizationMonthlyAmount(orgId: number, monthlyAmount: number) {
  return apiFetch<{ success: true; organization: AdminOrganizationRow }>(`/api/admin/organizations/${orgId}/monthly-amount`, {
    method: 'POST',
    body: JSON.stringify({ monthlyAmount }),
  });
}

export function deleteOrganization(orgId: number) {
  return apiFetch<{ success: true }>(`/api/admin/organizations/${orgId}`, { method: 'DELETE' });
}

export function markOrgCodeSent(orgId: number) {
  return apiFetch<{ success: true; organization: AdminOrganizationRow }>(`/api/admin/organizations/${orgId}/code-sent`, { method: 'POST' });
}

export interface AdminPerformerRow {
  id: number;
  name: string;
  categories: string[];
  city: string | null;
  rate: number | null;
  status: 'pending' | 'approved' | 'rejected';
  suspended?: boolean;
  activationPaid?: boolean;
}

export function fetchAdminPerformers() {
  return apiFetch<{ success: true; performers: AdminPerformerRow[] }>('/api/admin/performers');
}

export function setPerformerStatus(performerId: number, status: 'approved' | 'rejected') {
  return apiFetch<{ success: true; performer: AdminPerformerRow }>(`/api/admin/performers/${performerId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export function setPerformerSuspended(performerId: number, suspended: boolean) {
  return apiFetch<{ success: true; performer: AdminPerformerRow }>(`/api/admin/performers/${performerId}/${suspended ? 'suspend' : 'unsuspend'}`, {
    method: 'POST',
  });
}

export interface AdminFlaggedEntry {
  id: number;
  name: string;
  avgRating?: number | null;
  flaggedAt: string;
  role: 'tutor' | 'student';
}

export function fetchAdminFlagged() {
  return apiFetch<{ success: true; tutors: AdminFlaggedEntry[]; students: AdminFlaggedEntry[] }>('/api/admin/flagged');
}

export function expelTutor(tutorId: number) {
  return apiFetch<{ success: true }>(`/api/admin/tutors/${tutorId}/expel`, { method: 'POST' });
}

export interface AdminReportRow {
  id: number;
  reporterId: number;
  reporterName?: string | null;
  reportedUserId: number;
  reportedUserName?: string | null;
  threadKey?: string;
  reason: string;
  createdAt: string;
  status: 'open' | 'resolved';
}

export function fetchAdminReports() {
  return apiFetch<{ success: true; reports: AdminReportRow[] }>('/api/admin/reports');
}

export function resolveReport(reportId: number) {
  return apiFetch<{ success: true }>(`/api/admin/reports/${reportId}/resolve`, { method: 'POST' });
}

// --- Tutor Matching ---

export interface AdminTutorRow {
  id: number;
  userId: number;
  name: string;
  email?: string;
  phone?: string | null;
  categories: string[];
  genres?: string[];
  ageGroups?: string[];
  city: string | null;
  fullAddress?: string | null;
  address?: string | null;
  teachesOnline?: boolean;
  commuteRadiusKm?: number | null;
  inPersonVenue?: 'student_location' | 'tutor_studio' | 'either' | null;
  photoUrl?: string | null;
  hourlyRateUsd?: number;
  balanceUsd?: number;
  stripeConnectAccountId?: string | null;
  stripeConnectPayoutsEnabled?: boolean;
  approvedLevelByCategory?: Record<string, string>;
  status: 'pending' | 'approved' | 'rejected';
  expelled?: boolean;
  flagged?: boolean;
  ratingSum?: number;
  ratingCount?: number;
  professionalismSum?: number;
  professionalismCount?: number;
  orientationCompleted?: boolean;
  certificateUrl?: string | null;
}

export function fetchAdminTutors() {
  return apiFetch<{ success: true; tutors: AdminTutorRow[] }>('/api/admin/tutors');
}

export function setTutorStatus(tutorId: number, status: 'approved' | 'rejected') {
  return apiFetch<{ success: true; tutor: AdminTutorRow }>(`/api/admin/tutors/${tutorId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export interface AdminTutorRequestRow {
  id: number;
  studentId: number;
  studentName: string;
  studentEmail?: string;
  phone?: string | null;
  category: string;
  genre?: string | null;
  desiredLevel?: string | null;
  lessonType: string;
  online?: boolean;
  city?: string | null;
  notes?: string;
  status: 'pending' | 'active' | 'ended';
  preferredTutorIds?: number[];
  tutorId?: number | null;
  tutorName?: string | null;
  tutorEmail?: string | null;
  tutorPhone?: string | null;
  matchDistanceKm?: number | null;
}

export function fetchAdminTutorRequests() {
  return apiFetch<{ success: true; requests: AdminTutorRequestRow[] }>('/api/admin/tutor-requests');
}

export function assignTutorRequest(requestId: number, tutorId: number) {
  return apiFetch<{ success: true }>(`/api/admin/tutor-requests/${requestId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ tutorId }),
  });
}

export function endTutorRequest(requestId: number) {
  return apiFetch<{ success: true }>(`/api/admin/tutor-requests/${requestId}/end`, { method: 'POST' });
}

export interface AdminMarketplaceRequestRow {
  id: number;
  requesterName: string;
  category: string;
  eventType: string;
  city?: string | null;
  proposedDate?: string;
  status: string;
  offerCounts?: { accepted: number; countered: number; declined: number };
}

export function fetchAdminMarketplaceRequests() {
  return apiFetch<{ success: true; requests: AdminMarketplaceRequestRow[] }>('/api/admin/marketplace/requests');
}

// --- Educator Tools ---

export interface AdminOrientationQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface AdminOrientationContentValue {
  title: string;
  notes: string;
  videoUrl: string;
  rewardType: string | null;
}

export function fetchAdminOrientation(audience: string) {
  return apiFetch<{ success: true; content: AdminOrientationContentValue | null; audience: string; questions: AdminOrientationQuestion[] }>(
    `/api/admin/orientation?audience=${encodeURIComponent(audience)}`,
  );
}

export function saveAdminOrientation(payload: { audience: string; title?: string; notes?: string; videoUrl?: string; rewardType?: string; questions?: AdminOrientationQuestion[] }) {
  return apiFetch<{ success: true; content: AdminOrientationContentValue; questions: AdminOrientationQuestion[] }>('/api/admin/orientation', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function uploadAdminOrientationVideo(file: { uri: string; name: string; type: string }) {
  return uploadVideo('/api/admin/orientation/upload', file);
}

export interface AdminLibraryItem {
  id: number;
  title: string;
  url: string;
  category: string | null;
  genre: string | null;
  isFile?: boolean;
  status: 'active' | 'broken';
}

export function fetchAdminLibrary() {
  return apiFetch<{ success: true; items: AdminLibraryItem[] }>('/api/admin/library');
}

export function createAdminLibraryItem(payload: { title: string; url: string; category?: string; genre?: string; isFile?: boolean }) {
  return apiFetch<{ success: true; item: AdminLibraryItem }>('/api/admin/library', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function uploadAdminLibraryVideo(file: { uri: string; name: string; type: string }) {
  return uploadVideo('/api/admin/library/upload', file);
}

export function updateAdminLibraryItem(id: number, payload: Partial<{ title: string; url: string; category: string; genre: string; isFile: boolean }>) {
  return apiFetch<{ success: true; item: AdminLibraryItem }>(`/api/admin/library/${id}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteAdminLibraryItem(id: number) {
  return apiFetch<{ success: true }>(`/api/admin/library/${id}`, { method: 'DELETE' });
}

export function setAdminLibraryItemStatus(id: number, status: 'active' | 'broken') {
  return apiFetch<{ success: true; item: AdminLibraryItem }>(`/api/admin/library/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

// --- More: Activity & Flags, Payouts, Store ---

export interface AdminLessonActivityRow {
  loggedAt: string;
  requestId: number;
  category: string;
  lessonType: string;
  tutorName: string;
  studentName: string;
  durationMinutes?: number;
  totalUsd?: number;
  paymentStatus?: string;
}

export function fetchAdminActivity(regions?: string) {
  const qs = regions ? `?regions=${encodeURIComponent(regions)}` : '';
  return apiFetch<{ success: true; sessions: AdminLessonActivityRow[] }>(`/api/admin/activity${qs}`);
}

export interface AdminChatActivityRow {
  createdAt: string;
  category: string;
  tutorName: string;
  studentName: string;
  senderRole?: 'student' | 'tutor';
  text: string;
}

export function fetchAdminChatActivity(regions?: string) {
  const qs = regions ? `?regions=${encodeURIComponent(regions)}` : '';
  return apiFetch<{ success: true; messages: AdminChatActivityRow[] }>(`/api/admin/chat-activity${qs}`);
}

export interface AdminPayoutRow {
  id: number;
  tutorName: string;
  amountUsd: number;
  payoutDetails?: string;
  requestedAt: string;
  status: 'requested' | 'processed';
}

export function fetchAdminPayouts(regions?: string) {
  const qs = regions ? `?regions=${encodeURIComponent(regions)}` : '';
  return apiFetch<{ success: true; payouts: AdminPayoutRow[] }>(`/api/admin/payouts${qs}`);
}

export function processPayout(payoutId: number) {
  return apiFetch<{ success: true }>(`/api/admin/payout-requests/${payoutId}/process`, { method: 'POST' });
}

export interface AdminProductColorStock {
  countryCode: string;
  quantity: number;
}

export interface AdminProductColor {
  id?: string;
  name: string;
  hex: string;
  stock: AdminProductColorStock[];
}

export interface AdminStoreProduct {
  id: number;
  name: string;
  category: string;
  description?: string;
  priceUsd: number;
  status: 'active' | 'draft' | 'archived';
  coverImage?: string | null;
  images?: string[];
  colors?: AdminProductColor[];
  totalStock?: number;
}

export function fetchAdminProducts() {
  return apiFetch<{ success: true; products: AdminStoreProduct[] }>('/api/admin/products');
}

export function setProductStatus(productId: number, status: 'active' | 'draft' | 'archived') {
  return apiFetch<{ success: true; product: AdminStoreProduct }>(`/api/admin/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export function uploadAdminProductImage(file: { uri: string; name: string; type: string }) {
  return uploadFile<{ success: true; url: string }>(`${API_BASE_URL}/api/admin/products/upload-image`, file, 'image');
}

export interface CreateAdminProductPayload {
  name: string;
  category: string;
  coverImage: string;
  priceUsd?: number;
  description?: string;
  status?: 'active' | 'draft';
  images?: string[];
  colors: AdminProductColor[];
}

export function createAdminProduct(payload: CreateAdminProductPayload) {
  return apiFetch<{ success: true; product: AdminStoreProduct }>('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchAdminProduct(id: number) {
  return apiFetch<{ success: true; product: AdminStoreProduct }>(`/api/admin/products/${id}`);
}

export function updateAdminProduct(id: number, payload: Partial<CreateAdminProductPayload>) {
  return apiFetch<{ success: true; product: AdminStoreProduct }>(`/api/admin/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export interface AdminStoreOrder {
  id: number;
  orderNumber: string;
  userId: number;
  addressSnapshot?: { fullName?: string } | null;
  items: { productName: string; quantity: number }[];
  totalUsd: number;
  status: string;
  createdAt: string;
}

export function fetchAdminOrders() {
  return apiFetch<{ success: true; orders: AdminStoreOrder[] }>('/api/admin/orders');
}

export function setOrderStatus(orderId: number, status: string) {
  return apiFetch<{ success: true; order: AdminStoreOrder }>(`/api/admin/orders/${orderId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

import { API_BASE_URL, apiFetch } from './client';
import type { AssignmentSummary } from './types';
import { uploadFile } from '../utils/uploadFile';

export function redeemCode(code: string) {
  return apiFetch<{ success: true; orgId: number; orgName: string }>('/api/redeem-code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

// --- Organization Tutor workspace (mirrors org-tutor.html) ---

export interface OrgSummary {
  id: number;
  name: string;
  logoUrl: string | null;
  address: string | null;
}

export interface OrgStudentMember {
  studentId: number;
  studentName: string;
  email: string;
  role?: string;
  redeemedAt?: string;
  studentPhotoUrl: string | null;
}

export interface OrgContentItem {
  id: number;
  type: string;
  title: string;
  text: string;
  fileUrl?: string | null;
  url?: string | null;
  category?: string | null;
  createdAt: string;
  createdByName: string;
  reactions: { userId: number; emoji: string }[];
  myReaction: string | null;
}

export interface OrgEvent {
  id: number;
  title: string;
  scheduledAt: string;
  durationMinutes?: number;
  meetLink?: string | null;
  // Not every event is a video call to join - a flyer for a recital, a gig
  // announcement, general event awareness. meetLink stays optional.
  description?: string | null;
  flyerUrl?: string | null;
}

export interface OrgNotification {
  id: number | string;
  type: string;
  message: string;
  createdAt: string;
  href?: string;
  read?: boolean;
}

export interface TutorWorkspaceData {
  organization: OrgSummary;
  organizations: OrgSummary[];
  students: OrgStudentMember[];
  assignments: AssignmentSummary[];
  requests: AssignmentSummary[];
  content: OrgContentItem[];
  events: OrgEvent[];
  notifications: OrgNotification[];
  // True when the signed-in account is this organization's own owner
  // login (not just a linked tutor/student) - gates the feed/announcement
  // composer, which only the real /api/organizations/private-content route
  // accepts posts from.
  isOrgOwner: boolean;
}

export function fetchTutorWorkspace(orgId?: number) {
  const qs = orgId ? `?orgId=${orgId}` : '';
  return apiFetch<{ success: true } & TutorWorkspaceData>(`/api/organizations/tutor-workspace${qs}`);
}

// Toggle a reaction on an organization feed/announcement post - same
// 5-emoji set as chat, one per user per post.
export function reactToOrgContent(id: number, emoji: string) {
  return apiFetch<{ success: true; item: OrgContentItem }>(`/api/organizations/content/${id}/react`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

export type OrgContentType = 'announcement' | 'feed' | 'info' | 'photo' | 'video' | 'document' | 'game';

// The org owner's real posting route (org-tutor.html reaches this only via
// the web ngo-dashboard today - this is the same backend, just called from
// the mobile app for the account that happens to also own the org).
export function createOrgContent(payload: { type: OrgContentType; title: string; text?: string; fileUrl?: string; url?: string; category?: string }) {
  return apiFetch<{ success: true; item: OrgContentItem }>('/api/organizations/private-content', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

const UPLOAD_TIMEOUT_MS = 90000;

// Uploads whatever media the composer attached (photo/video/document) and
// returns the hosted URL to pass as `fileUrl` to createOrgContent.
export function uploadOrgMedia(mediaType: 'photo' | 'video' | 'document', file: { uri: string; name: string; type: string }) {
  return uploadFile<{ success: true; url: string; mediaType: string }>(
    `${API_BASE_URL}/api/organizations/upload-media?type=${mediaType}`,
    file,
    'media',
    UPLOAD_TIMEOUT_MS,
  );
}

// --- The organization's own shared library (mirrors org-tutor.html's
// "Uploads & Library" panel) - distinct from both the tutor's personal
// MyLibrary and the shared Mozart-wide Library. ---

export interface OrgLibraryItem {
  id: number;
  title: string;
  text: string;
  category: string | null;
  url: string | null;
  fileUrl: string | null;
  requiresSubmission?: boolean;
  mySubmission?: { createdAt: string } | null;
}

// The server always returns all three views in one response (view= is a
// web-client-only hint for which array to render) - so this fetches once.
export function fetchOrgLibrary() {
  return apiFetch<{ success: true; organizationName: string; folders: { id: number; name: string }[]; general: OrgLibraryItem[]; mine: OrgLibraryItem[]; shared: OrgLibraryItem[] }>(
    '/api/organizations/library',
  );
}

// Owner-only (mirrors ngo-dashboard.html's Library tab "Upload"/"Create
// folder" buttons) - org-tutor.html's own library view stays read-only,
// same as the mobile Org Tutor/Org Student surfaces reusing this screen.
export function createLibraryFolder(name: string) {
  return apiFetch<{ success: true; folder: { id: number; name: string } }>('/api/organizations/library/folders', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function uploadLibraryItem(payload: {
  title: string;
  category?: string;
  url?: string;
  fileUrl?: string;
  type?: 'photo' | 'video' | 'document' | 'info';
  visibility?: 'general' | 'shared';
  folderId?: number | null;
  text?: string;
  requiresSubmission?: boolean;
}) {
  return apiFetch<{ success: true; item: OrgLibraryItem }>('/api/organizations/library', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// --- Sponsor Dashboard (mirrors become-sponsor.html's own "already
// applied" panel) - for the account that owns the organization, whether
// they applied as an Individual Sponsor or an NGO/Institution. Distinct
// from the Org Tutor workspace above, which is for a *linked tutor*, not
// necessarily the owner. ---

export interface SponsorCodeEntry {
  code: string;
  role?: 'student' | 'tutor';
  redeemedAt: string | null;
  redeemedBy?: number | null;
  redeemedName?: string | null;
  studentName?: string | null;
  createdAt: string;
}

export interface MySponsorOrg {
  id: number;
  name: string | null;
  contactName: string;
  email: string;
  logoUrl: string | null;
  sponsorType: 'individual' | 'ngo';
  organizationType?: 'ngo' | 'institution';
  status: 'pending' | 'approved' | 'rejected';
  subscriptionStatus: 'inactive' | 'active' | 'expired';
  subscriptionEndAt: string | null;
  studentCodes: SponsorCodeEntry[];
  monthlyAmountLocal: number;
  // The pre-funded balance ("bank") lesson bills draw down automatically -
  // a separate figure from monthlyAmountLocal above, which is the flat fee
  // paid to Mozart for platform access, not what covers a lesson.
  walletBalanceUsd: number;
  walletBalanceLocal: number;
  localCurrency: string;
  localSymbol: string;
  // A salutation the sponsor sets themselves (Mr./Mrs./Ms./Dr./...) - there's
  // no gender field anywhere on the account to derive this from, so it's
  // self-declared rather than inferred. Null until they set one.
  sponsorTitle: string | null;
  phone: string | null;
  address: string | null;
  locality?: { city?: string; state?: string; country?: string } | null;
  // Past subscription charges (mirrors ngo-dashboard.html's own payment
  // history table) - separate from walletBalanceUsd above, which is the
  // per-lesson billing balance, not the platform subscription fee.
  paymentHistory?: { date: string; type: 'monthly' | 'yearly'; amount: number }[];
}

export function fetchMySponsorOrg() {
  return apiFetch<{ success: true; organization: MySponsorOrg; subscriptionActive: boolean }>('/api/organizations/me');
}

// Reuses the existing organization profile-update route (also used by the
// web dashboards for name/contact/address edits) just for the title field.
export function setSponsorTitle(sponsorTitle: string) {
  return apiFetch<{ success: true; organization: MySponsorOrg }>('/api/organizations/me/profile', {
    method: 'POST',
    body: JSON.stringify({ sponsorTitle }),
  });
}

// The same profile-update route, for the Organization Settings screen
// (mirrors ngo-dashboard.html's own Settings tab: name/contact/phone/logo -
// type, email and country stay read-only there too).
export function updateOrgProfile(payload: { name?: string; contactName?: string; phone?: string; address?: string; logoUrl?: string }) {
  return apiFetch<{ success: true; organization: MySponsorOrg }>('/api/organizations/me/profile', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// --- Billing (mirrors ngo-dashboard.html's own lesson-bill/subscription
// checkout flow) - a sponsor only pays when their sponsored student is
// taught by a tutor also linked to the same organization (see server.js's
// coveredOrganizationForAssignment); every such lesson lands here as a
// real Stripe Checkout charge, one lesson at a time. ---

export interface LessonBill {
  assignmentId: number;
  sessionId: number;
  studentName: string;
  tutorName: string;
  category: string;
  durationMinutes: number;
  totalUsd: number;
  loggedAt: string;
}

export function fetchLessonBills() {
  return apiFetch<{ success: true; bills: LessonBill[] }>('/api/organizations/lesson-bills');
}

// Returns a real Stripe Checkout URL - open it with expo-web-browser's
// WebBrowser.openBrowserAsync, same pattern the Store checkout uses.
export function payLessonBill(assignmentId: number, sessionId: number) {
  return apiFetch<{ success: true; url: string }>(`/api/organizations/lesson-bills/${assignmentId}/${sessionId}/checkout`, {
    method: 'POST',
  });
}

export function startSubscriptionCheckout(billingPeriod: 'monthly' | 'yearly') {
  return apiFetch<{ success: true; sessionId: string; url: string }>('/api/organizations/checkout', {
    method: 'POST',
    body: JSON.stringify({ billingPeriod }),
  });
}

// Loads real money into the wallet (walletBalanceUsd) - a real Stripe
// Checkout charge, separate from the admin-facing subscription above.
export function topUpWallet(amountUsd: number) {
  return apiFetch<{ success: true; url: string; sessionId: string }>('/api/organizations/wallet/topup-checkout', {
    method: 'POST',
    body: JSON.stringify({ amountUsd }),
  });
}

// Called right after the checkout browser closes, regardless of whether
// the success_url redirect already credited the wallet - there's no
// webhook in this app, and that redirect can silently fail to reach a
// local/LAN dev server even after a real charge went through. Safe to call
// even if the redirect DID already land (the server no-ops on a session
// it's already processed).
export function verifyWalletTopup(sessionId: string) {
  return apiFetch<{ success: true; walletBalanceUsd: number }>('/api/organizations/wallet/topup-verify', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

// Every code this org has ever generated (student or tutor), with delete
// support - mirrors ngo-dashboard.html's Access Codes tab.
export function fetchSponsorCodes() {
  return apiFetch<{ success: true; students: SponsorCodeEntry[]; tutors: SponsorCodeEntry[] }>('/api/organizations/me/codes');
}

export function deleteSponsorCode(code: string) {
  return apiFetch<{ success: true; entry: SponsorCodeEntry }>(`/api/organizations/me/codes/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  });
}

export interface SponsorNotification {
  id: number | string;
  type: string;
  message: string;
  href?: string | null;
  read?: boolean;
  createdAt: string;
}

// Only this account's own organization notifications (application/
// subscription updates) - a different, narrower list than the account-wide
// Notifications screen.
export function fetchSponsorNotifications() {
  return apiFetch<{ success: true; notifications: SponsorNotification[] }>('/api/organizations/me/notifications');
}

export function generateSponsorCode(role: 'student' | 'tutor' = 'student') {
  return apiFetch<{ success: true; entry: SponsorCodeEntry }>('/api/organizations/me/generate-code', {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
}

// Generates a code AND stamps it as invited to this email - mirrors
// ngo-dashboard.html's "Invite user by Gmail" button, which opens a
// prefilled Gmail compose window with the redeem link after this succeeds.
export function inviteOrgMember(email: string, role: 'student' | 'tutor' = 'student') {
  return apiFetch<{ success: true; code: string; redeemLink: string; organizationName: string }>('/api/organizations/me/invite', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}

// The org owner's own roster (mirrors ngo-dashboard.html's Classroom tab) -
// every student who redeemed one of this org's codes, plus any tutors
// linked the same way. Distinct from OrgStudentMember/fetchTutorWorkspace
// above, which is the *linked tutor's* view of the same organization.
export interface OrgRosterMember {
  id: number;
  name: string;
  email: string;
  role: 'Student' | 'Tutor';
  photoUrl: string | null;
  // Tutor-only.
  status?: string;
  profile?: {
    categories?: string[];
    bio?: string;
    city?: string | null;
    experienceYears?: number;
    ageGroup?: string;
    sex?: string;
  } | null;
}

export function fetchOrgMembers() {
  return apiFetch<{ success: true; students: OrgRosterMember[]; tutors: OrgRosterMember[] }>('/api/organizations/members');
}

// Feeds the Sponsor Dashboard's "Assign a Tutor" picker.
export interface StudentForAssignment {
  id: number;
  name: string;
  photoUrl: string | null;
  preferredCategories: string[];
}

export function fetchStudentsForAssignment() {
  return apiFetch<{ success: true; students: StudentForAssignment[] }>('/api/organizations/students-for-assignment');
}

// The org owner's own conversations with each linked tutor/student (mirrors
// ngo-dashboard.html's Messages tab) - a separate list route from
// fetchMyOrgConversations above (which is the *linked tutor's* own threads),
// but the same underlying org-chat messages/react/edit/etc. routes handle
// both, since resolveOrgChatAccess on the server already recognizes the
// org owner as a participant.
export interface OrgOwnerConversation {
  id: number;
  type: 'direct' | 'group' | 'tutor-group';
  title: string;
  tutorId: number | null;
  studentId: number | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
}

// audience=student keeps the Sponsor Dashboard's inbox a sponsor<->student
// space only - fully separate from Org Tutor mode's tutor-facing
// conversations, even though both surfaces share the same org account.
export function fetchOrgConversations() {
  return apiFetch<{ success: true; conversations: OrgOwnerConversation[] }>('/api/organizations/conversations?audience=student');
}

// The Organization Dashboard's own inbox - unfiltered, unlike the Sponsor
// Dashboard's fetchOrgConversations above, since an Organization has both
// students and tutors of its own and legitimately messages both (same
// unfiltered default ngo-dashboard.html's Messages tab already uses).
export function fetchOrgConversationsAll() {
  return apiFetch<{ success: true; conversations: OrgOwnerConversation[] }>('/api/organizations/conversations');
}

// Opens (creating if needed) the org's 1:1 thread with a roster member -
// lets the Students tab jump straight into an empty OrgChat thread for
// someone who hasn't been messaged yet, rather than requiring a first
// message be sent blind.
export function openOrgConversation(targetId: number, targetType: 'student' | 'tutor', name: string) {
  return apiFetch<{ success: true; conversation: OrgOwnerConversation }>(`/api/organizations/conversations/${targetId}/open`, {
    method: 'POST',
    body: JSON.stringify({ targetType, name }),
  });
}

// Unlinks a student from the org (their access code stays used, but the
// membership/sponsor relationship ends) - same DELETE route the web
// dashboards' classroom "Remove" button already calls.
export function removeOrgMember(studentId: number) {
  return apiFetch<{ success: boolean }>(`/api/organizations/members/${studentId}`, { method: 'DELETE' });
}

// --- Org Student mode (mirrors my-organization.html) - for a student
// linked to an NGO/Institution, a different relationship than the Sponsor
// Dashboard above (which is for the account that *owns* an org). ---

export interface MyOrgMembership {
  id: number;
  name: string | null;
  contactName: string;
  organizationType?: 'ngo' | 'institution';
  subscriptionStatus: 'inactive' | 'active' | 'expired';
  logoUrl: string | null;
  address: string | null;
  events: OrgEvent[];
  // The org's own country (a fixed fact about it), not the viewer's - a
  // different thing from CountryFlag elsewhere, which reads device/IP
  // location. Null if the org's address never resolved to a known country.
  countryCode: string | null;
}

export function fetchMyOrgMembership() {
  return apiFetch<{ success: true; organization: MyOrgMembership }>('/api/organizations/mine');
}

// The read-only member view of an org's feed/announcements together
// (mirrors my-organization.html's single "Updates" tab) - works for a
// plain student member, unlike fetchTutorWorkspace above which requires a
// tutor profile.
export function fetchOrgPublicContent(orgId: number) {
  return apiFetch<{ success: true; content: OrgContentItem[]; isOrgAdmin: boolean }>(`/api/organizations/${orgId}/private-content`);
}

// --- Organization Dashboard's own Classroom sections (mirrors
// ngo-dashboard.html's Classroom sidebar: Events and Performance are owner-
// scoped across the WHOLE org, unlike fetchTutorWorkspace above which
// requires a tutor profile and only ever returns that one tutor's own
// assignments - not usable here since an org owner need not be a tutor). ---

export function fetchOrgEvents() {
  return apiFetch<{ success: true; events: OrgEvent[] }>('/api/organizations/events');
}

export function createOrgEvent(payload: { title: string; startISO: string; durationMinutes?: number; attendeeEmails?: string[]; meetLink?: string; description?: string; flyerUrl?: string }) {
  return apiFetch<{ success: true; event: OrgEvent }>('/api/organizations/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface OrgPerformance {
  activeLessons: number;
  completedLessons: number;
  memberCount: number;
}

export function fetchOrgPerformance() {
  return apiFetch<{ success: true } & OrgPerformance>('/api/organizations/performance');
}

// A member's own real 1:1 org-chat thread with the organization itself
// (auto-created server-side) - mirrors my-organization.html's "Message
// Organization" tab. The returned conversation id opens straight into the
// existing OrgChat screen, which already handles every role generically.
export function fetchMyOrgConversation() {
  return apiFetch<{ success: true; conversation: { id: number }; organizationName: string; organizationLogoUrl: string | null }>('/api/organizations/mine/conversation');
}

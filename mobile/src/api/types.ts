// Mirrors server.js's publicUser() shape (see the `/api/session` and
// `/api/login` routes) - keep this in sync if that function's fields change.
export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: string;
  // Country Admin (scoped to one country) and Main Admin (supersedes every
  // country restriction) are two different Profile destinations - an
  // account can hold both at once, not either/or.
  adminCountryCode: string | null;
  adminCountryName: string | null;
  isPrimaryAdmin: boolean;
  supportAgent: boolean;
  countryCode: string | null;
  photoUrl: string | null;
  hasTutorProfile: boolean;
  tutorProfileId: number | null;
  tutorStatus: string | null;
  // Gates the mandatory Tutor Orientation modal - true exactly once, until
  // "I Understand & Agree" is tapped on its final screen. Distinct from
  // orientationCompleted (a different, unrelated admin content-feed/quiz
  // system reached from the notification bell).
  needsTutorOrientation: boolean;
  hasPerformerProfile: boolean;
  performerProfileId: number | null;
  performerStatus: string | null;
  // Mirrors needsTutorOrientation above, for the Performer Orientation modal.
  needsPerformerOrientation: boolean;
  sponsor: { orgId: number; orgName: string } | null;
  organizationMemberships: Array<{ orgId: number; orgName: string }>;
  hasSponsorOrg: boolean;
  hasSponsorAccess: boolean;
  // The account's own sponsor organization application status (Individual
  // Sponsor or NGO/Institution) - null until they've applied.
  sponsorOrgStatus: string | null;
  // The owned org's own kind ('individual' or 'ngo') - null until applied.
  // Picks which ONE Profile destination shows for the account's owned org:
  // Sponsor Dashboard vs the separate Organization Dashboard mode.
  sponsorOrgType: string | null;
  // Only meaningful when sponsorOrgType is 'ngo' - 'ngo' or 'institution',
  // whichever the application form itself said.
  sponsorOrgKind: string | null;
  // The org's own registered/approved name - labels the Organization
  // Dashboard row as "<name> Dashboard" (e.g. "Slum2School Dashboard").
  sponsorOrgName: string | null;
  // Which organizations this account holds a *tutor* code for (as opposed
  // to organizationMemberships above, which isn't role-tagged) - one entry
  // per org, so Profile can show a real "<org name> Tutor" row per
  // organization instead of one generic destination.
  organizationTutorMemberships: Array<{ id: number; name: string }>;
  // Which NGO/Institution organizations (not an Individual Sponsor - a
  // different relationship) this account is a *student* member of - one
  // real "<org name> Student" row per organization in Profile, independent
  // of organizationTutorMemberships above.
  organizationStudentMemberships: Array<{ id: number; name: string }>;
  // Gates the app's first-run feature walkthrough (App.tsx's Root) - true
  // until POST /api/me/onboarding-complete is called, once, for this
  // account. Defaults true for every account, not just new signups.
  needsAppOnboarding: boolean;
  // Per-dashboard coachmark tours already clicked through (see
  // useDashboardTour) - empty until each one is individually reached and
  // finished, not gated by needsAppOnboarding above.
  seenTours: string[];
}

// One row from /api/my-assignments - trimmed to the fields the dashboard
// actually reads; the real payload carries more (session history, payment
// state, etc.) that later screens can widen this to cover.
export interface AssignmentSummary {
  id: number;
  category: string;
  status: 'pending' | 'active' | 'ended';
  lessonType: 'online' | 'physical' | 'studio';
  studentId?: number;
  studentName?: string;
  tutorId?: number;
  tutorName?: string;
  tutorPhotoUrl?: string | null;
  studentPhotoUrl?: string | null;
  meetingLink?: string | null;
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  desiredLevel?: string | null;
  // Set by POST /api/assignments/:id/lesson-start (data/assignments.js's
  // startLesson) - the tutor's billing-clock start, cleared once the
  // matching /sessions call logs the lesson and sends the bill.
  lessonStartedAt?: string | null;
  lessonStartedBy?: number | null;
  // Completed-lesson log entries (data/assignments.js's addSession) - real
  // practice history, not a derived stat, so the Learning Profile screen can
  // show actual sessions/hours instead of a fabricated progress number.
  // paymentStatus/totalUsd/id/isFreeTrial are what ChatScreen's pending-
  // bill strip reads - 'held' is awaiting the student's confirm/tutor's
  // cancel, same as chat.html.
  sessions?: Array<{ id: number; durationMinutes: number; loggedAt: string; totalUsd?: number; paymentStatus?: 'held' | 'released' | 'cancelled'; isFreeTrial?: boolean }>;
  // Set (to the sponsoring org) only for a student whose account currently
  // has an active sponsor - present alongside `sessions` on asStudent rows,
  // used to show "Paid by <org>" instead of a Confirm button.
  sponsoredBy?: { orgId: number; orgName: string } | null;
}

// One row from /api/notifications - matches data/store.js's addNotification()
// shape exactly.
export interface AppNotification {
  id: number;
  type: string;
  message: string;
  href: string | null;
  // Only set for types that show an image (currently just 'new_product',
  // the store's cover image).
  imageUrl?: string | null;
  read: boolean;
  createdAt: string;
}

// Matches data/support-chat.js's shape exactly.
export interface SupportMessage {
  id: number;
  sender: 'user' | 'admin' | 'agent';
  adminId: number | null;
  text: string;
  attachment: unknown;
  createdAt: string;
}

export interface SupportThread {
  id: number;
  userId: number;
  status: 'ai' | 'waiting_for_agent' | 'assigned' | 'closed';
  createdAt: string;
  updatedAt: string;
  messages: SupportMessage[];
}

// One row from /api/tutors - trimmed to the fields the Find a Tutor screen
// actually reads.
export interface TutorSummary {
  mapLocation?: { lat: number; lng: number; approximate: boolean } | null;
  location?: { area?: string | null; city?: string | null; state?: string | null; country?: string | null };
  id: number;
  name: string;
  categories: string[];
  genres: string[];
  levels: string[];
  ageGroups: string[];
  city: string | null;
  teachesOnline: boolean;
  inPersonVenue: string | null;
  photoUrl: string | null;
  hourlyRateLocal: number;
  currency: string;
  symbol: string;
  avgRating: number | null;
  experienceYears: number | null;
  bio: string | null;
}

// GET /api/tutors/:id/public - no email/phone in this shape either.
export interface TutorPublicProfile {
  id: number;
  name: string;
  categories: string[];
  genres: string[];
  levels: string[];
  approvedLevelByCategory: Record<string, string>;
  city: string | null;
  fullAddress: string | null;
  addressLocked: boolean;
  teachesOnline: boolean;
  inPersonVenue: string | null;
  photoUrl: string | null;
  experienceYears: number | null;
  qualifications: string | null;
  bio: string | null;
  hourlyRateUsd: number;
  hourlyRateLocal: number;
  currency: string;
  symbol: string;
  avgRating: number | null;
  avgProfessionalism: number | null;
  ratingCount: number;
  lessonsCompletedCount: number;
  orientationCompleted: boolean;
}

export interface TutorReview {
  studentFirstName: string;
  category: string;
  score: number;
  professionalism: number | null;
  comment: string;
  ratedAt: string;
}

// AGE_GROUPS is the one taxonomy list that isn't plain strings server-side
// (data/taxonomy.js) - {id, label} so "kid" can display as "Kids (up to 14)".
export interface AgeGroup {
  id: string;
  label: string;
}

export interface Taxonomy {
  subjects: string[];
  genres: string[];
  ageGroups: AgeGroup[];
  levels: string[];
  lessonTypes: string[];
}

// --- Messages / chat (mirrors messages.html + chat.html's data shapes) ---

export interface Conversation {
  assignmentId: number;
  role: 'student' | 'tutor';
  name: string;
  photoUrl: string | null;
  category: string;
  status: 'pending' | 'active' | 'ended';
  lessonType: 'online' | 'physical' | 'studio';
  lastMessage: string;
  lastAt: string;
  unread: number;
  favorite: boolean;
  archived: boolean;
  pinned: boolean;
  muted: boolean;
}

export interface ChatAttachment {
  url: string;
  name: string;
  mime: string;
  size: number;
  kind: 'image' | 'video' | 'audio' | 'file';
}

export interface ChatMessage {
  id: number;
  assignmentId: number;
  senderId: number;
  senderRole: 'student' | 'tutor';
  text: string;
  attachment: ChatAttachment | null;
  libraryItem: { id: number; title: string; url: string; href: string | null } | null;
  poll: { question: string; options: Array<{ id: number; text: string }>; votes: Array<{ userId: number; optionId: number }> } | null;
  location: { lat: number; lng: number } | null;
  replyToId: number | null;
  pinned?: boolean;
  pinnedAt?: string | null;
  editedAt?: string | null;
  deleted?: boolean;
  deletedForUserIds?: number[];
  reactions?: Array<{ userId: number; role: 'student' | 'tutor'; emoji: string }>;
  createdAt: string;
  readByStudent: boolean;
  readByTutor: boolean;
}

// --- Store (mirrors store-profile.html's data shapes exactly) ---

export interface StoreOrderItem {
  productId: number;
  productName: string;
  colorName: string;
  quantity: number;
  unitPriceUsd: number;
  lineTotalUsd: number;
  image: string | null;
}

export interface StoreOrderStatusEntry {
  status: string;
  message: string;
  at: string;
}

export type StoreOrderStatus = 'pending_payment' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'payment_flagged';

export interface StoreOrder {
  id: number;
  orderNumber: string;
  status: StoreOrderStatus;
  items: StoreOrderItem[];
  totalUsd: number;
  createdAt: string;
  statusHistory: StoreOrderStatusEntry[];
}

export interface StoreInboxEntry {
  orderId: number;
  orderNumber: string;
  status: string;
  message: string;
  at: string;
}

export interface StoreReviewReply {
  id: number;
  adminName: string;
  text: string;
  createdAt: string;
}

export interface StoreReview {
  id: number;
  productId: number;
  rating: number;
  text: string;
  replies: StoreReviewReply[];
  createdAt: string;
  productName: string;
  productSlug: string | null;
  productImage: string | null;
}

export interface StoreProductSummary {
  id: number;
  slug: string;
  name: string;
  category: string;
  coverImage: string | null;
  priceLocal: number;
  currency: string;
  symbol: string;
  avgRating: number | null;
  reviewCount: number;
  inStock: boolean;
}

// --- Technique Library (mirrors library.html's item shape) ---

export interface LibraryItem {
  id: number;
  title: string;
  category: string | null;
  genre: string | null;
  description: string | null;
  url: string;
  isFile?: boolean;
}

export interface StoreCategory {
  key: string;
  title: string;
  description: string;
  image: string;
  productCount: number;
}

export interface StoreColor {
  id: string;
  name: string;
  hex: string;
  stockForViewerCountry: number;
}

export interface StoreProductDetail {
  id: number;
  slug: string;
  name: string;
  category: string;
  description: string;
  images: string[];
  coverImage: string | null;
  priceUsd: number;
  priceLocal: number;
  currency: string;
  symbol: string;
  colors: StoreColor[];
  avgRating: number | null;
  reviewCount: number;
}

export interface StoreProductReview {
  id: number;
  userId: number;
  userName: string;
  rating: number;
  text: string;
  replies: StoreReviewReply[];
  createdAt: string;
  editedAt: string | null;
}

export interface StoreProductBatchItem {
  productId: number;
  colorId: string | null;
  active: boolean;
  productName?: string;
  productSlug?: string;
  image?: string | null;
  colorName?: string | null;
  colorHex?: string | null;
  unitPriceUsd?: number;
  unitPriceLocal?: number;
  currency?: string;
  symbol?: string;
  stockForViewerCountry?: number;
}

export interface StoreAddress {
  id: number;
  label: string;
  fullName: string;
  phone: string;
  country: string;
  countryName: string;
  state: string;
  city: string;
  street: string;
  postalCode: string;
  isDefault: boolean;
}

import type { NavigatorScreenParams } from '@react-navigation/native';

import type { ChatAttachment } from '../api/types';

// The auth flow (shown when there's no signed-in user). The signed-in side
// (MainTabParamList) lives outside this stack entirely - App.tsx swaps the
// whole navigator based on auth state, matching React Navigation's standard
// auth-flow pattern.
export type AuthStackParamList = {
  GetStarted: undefined;
  Onboarding: undefined;
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
};

// The student-facing tab set. "More" is itself a small stack (see
// MoreStack.tsx) so it can push Live Support / Settings on top rather than
// everything being a flat tab. An approved tutor switching into Tutor mode
// (RoleModeContext) swaps this whole navigator out for TutorTabParamList
// below, rather than adding tutor screens into this same set - matching
// the real product, where tutor.html and dashboard.html are two entirely
// separate pages, not one page with a role switch inside it.
export type MainTabParamList = {
  Home: undefined;
  // openItemSlug is set when arriving from a library share link tapped in
  // chat (ChatScreen's handleLinkPress) - LibraryScreen opens that exact
  // clip's detail modal once it loads, instead of just showing the list.
  Library: { openItemSlug?: string } | undefined;
  // Present when arriving to forward a message here - MessagesScreen shows
  // a "forwarding" banner and sends it (tagged "Forwarded") to whichever
  // conversation is tapped next, instead of just opening it.
  Messages: { forward?: { text: string; attachment?: ChatAttachment | null } } | undefined;
  Store: NavigatorScreenParams<StoreStackParamList> | undefined;
  More: NavigatorScreenParams<MoreStackParamList> | undefined;
};

export type MoreStackParamList = {
  MoreHome: undefined;
  LiveSupport: undefined;
  Settings: undefined;
};

// The Store tab is its own small stack too (mirrors MoreStackParamList
// above) so Product/Category can push on top of it and back out while the
// bottom tab bar stays visible underneath - shared across every role's tab
// set that has a Store tab (all but Support Agent), same as StoreScreen
// itself already is.
export type StoreStackParamList = {
  StoreHome: undefined;
  ProductDetail: { slug: string };
  Category: { category: string; title?: string } | undefined;
};

// The tutor-mode tab set (Tutor/Students/Messages/Store/More) - a
// completely separate bottom-tab navigator from MainTabParamList, mounted
// instead of it (see TabsRouter) while RoleModeContext's mode is 'tutor'.
// Messages and Store are the exact same shared screens the student tabs
// use (real chat/store, not a per-role concept) - Tutor (home/dashboard)
// and Students are the tutor-only pieces. Calendar/Library are reached
// from inside the Tutor home screen instead of being their own tabs.
export type TutorTabParamList = {
  Tutor: undefined;
  Students: undefined;
  Messages: { forward?: { text: string; attachment?: ChatAttachment | null } } | undefined;
  Store: NavigatorScreenParams<StoreStackParamList> | undefined;
  More: NavigatorScreenParams<TutorMoreStackParamList> | undefined;
};

export type TutorMoreStackParamList = {
  TutorMoreHome: undefined;
  LiveSupport: undefined;
  Settings: undefined;
};

// The Organization Tutor tab set - same shape as TutorTabParamList
// (Overview/Students/Messages/Store/More), for a tutor who's also linked to
// an approved organization via a redeemed access code. Messages and Store
// are the same shared screens Tutor mode reuses; Overview is this mode's
// own dashboard, styled like the Tutor one but scoped to the active org
// (RoleModeContext's activeOrgId).
export type OrgTutorTabParamList = {
  Overview: undefined;
  Students: undefined;
  Messages: { forward?: { text: string; attachment?: ChatAttachment | null } } | undefined;
  Store: NavigatorScreenParams<StoreStackParamList> | undefined;
  More: NavigatorScreenParams<OrgTutorMoreStackParamList> | undefined;
};

export type OrgTutorMoreStackParamList = {
  OrgTutorMoreHome: undefined;
  LiveSupport: undefined;
  Settings: undefined;
};

// The Sponsor tab set - same shape and footer nav as TutorTabParamList,
// mounted instead of MainTabs/TutorTabs/OrgTutorTabs while RoleModeContext's
// mode is 'sponsor'. This is for the account that owns a sponsor
// organization (Individual Sponsor or NGO/Institution, see
// data/organizations.js's sponsorType) - a full mode switch, not a pushed
// screen, matching the same "own space" treatment Tutor/Org Tutor already
// get. Sponsor is the status/codes dashboard (formerly the pushed
// SponsorDashboard screen); Students lists who redeemed those codes;
// Messages/Store are the same shared screens every other mode reuses.
export type SponsorTabParamList = {
  Sponsor: undefined;
  Students: undefined;
  Messages: { forward?: { text: string; attachment?: ChatAttachment | null } } | undefined;
  Store: NavigatorScreenParams<StoreStackParamList> | undefined;
  More: NavigatorScreenParams<SponsorMoreStackParamList> | undefined;
};

export type SponsorMoreStackParamList = {
  SponsorMoreHome: undefined;
  LiveSupport: undefined;
  Settings: undefined;
};

// The Performer tab set - a full mode switch like Tutor/Sponsor/Organization,
// mounted while RoleModeContext's mode is 'performer'. Requests is the
// marketplace inbox (invited/accept/counter/decline, mirrors performer.html's
// own Requests tab); Profile here is the performer's own portfolio editor
// (categories, rate, bio, activation status) - unrelated to the shared
// account "Profile" screen reached via the header avatar everywhere else;
// Media folds in gallery photos, video clips AND social links (performer.html
// keeps social links on the profile tab, but the web mockup that drove this
// tab set explicitly asked for Social to live inside Media instead); Store
// is the same shared screen every other mode reuses; More holds History
// (past selected/completed gigs) alongside Live Support/Settings.
export type PerformerTabParamList = {
  Requests: undefined;
  Profile: undefined;
  Media: undefined;
  Store: NavigatorScreenParams<StoreStackParamList> | undefined;
  More: NavigatorScreenParams<PerformerMoreStackParamList> | undefined;
};

export type PerformerMoreStackParamList = {
  PerformerMoreHome: undefined;
  PerformerHistory: undefined;
  // Private marketplace coordination after an event request is accepted.
  // These stay inside the performer More stack, rather than the lesson chat
  // routes in MainStack, because they are event bookings rather than lessons.
  PerformerMessages: undefined;
  PerformerMessageThread: { chatId: number; title: string; photoUrl: string | null; eventLabel: string };
  LiveSupport: undefined;
  Settings: undefined;
};

// The Support Agent tab set - a full mode switch like every other role
// here, mounted while RoleModeContext's mode is 'support-agent'. Only two
// tabs by design: this role has exactly one job (mirrors public/support-
// agent's own inbox page - claim a waiting conversation, reply, close it),
// not a personal storefront/portfolio like Tutor/Sponsor/Performer have, so
// padding it out to match their tab count would be artificial. Opening a
// conversation pushes SupportThread on the shared MainStack, same pattern
// MessagesScreen uses to push Chat.
export type SupportAgentTabParamList = {
  Inbox: undefined;
  More: NavigatorScreenParams<SupportAgentMoreStackParamList> | undefined;
};

export type SupportAgentMoreStackParamList = {
  SupportAgentMoreHome: undefined;
  LiveSupport: undefined;
  Settings: undefined;
};

// The Organization tab set - deliberately its OWN mode and navigator, not a
// relabeled SponsorTabParamList. Sponsor is an Individual Sponsor's single-
// student relationship; Organization is the NGO/Institution's own dashboard,
// with both students and tutors of its own (mirrors ngo-dashboard.html's
// sidebar: Overview, Classroom folds in Students+Tutors+feed/events/games,
// Messages reaches tutors too - not just students like Sponsor's inbox).
export type OrganizationTabParamList = {
  Overview: undefined;
  Classroom: undefined;
  Messages: { forward?: { text: string; attachment?: ChatAttachment | null } } | undefined;
  Store: NavigatorScreenParams<StoreStackParamList> | undefined;
  More: NavigatorScreenParams<OrganizationMoreStackParamList> | undefined;
};

export type OrganizationMoreStackParamList = {
  OrganizationMoreHome: undefined;
  LiveSupport: undefined;
  Settings: undefined;
};

// The admin console's own tab set - shared by Country Admin and Main Admin
// alike (the screens themselves adapt to the account's actual permissions,
// same as the web app's single /admin page does server-side), mounted
// instead of every other mode's tabs while RoleModeContext's mode is
// 'admin'. Mirrors admin.html's 12 sidebar tabs, regrouped into 5: Analytics
// (the analytics tab), Applicants & Users (users + sponsor/NGO/performer
// applications + flagged accounts + reports - every "review someone" or
// "moderate someone" flow), Tutor Matching (tutor applications + student-
// request matching - admin mediates a match), Educator Tools (orientation +
// technique library), and More (activity/chat logs, payouts, and
// Marketplace - request oversight plus store products/orders, all three
// being the same "storefront" concern).
export type AdminTabParamList = {
  Analytics: undefined;
  ApplicantsUsers: undefined;
  TutorMatching: undefined;
  EducatorTools: undefined;
  More: NavigatorScreenParams<AdminMoreStackParamList> | undefined;
};

export type AdminMoreStackParamList = {
  AdminMoreHome: undefined;
  AdminActivity: undefined;
  AdminPayouts: undefined;
  AdminMarketplace: undefined;
  AdminStoreProducts: undefined;
  AdminStoreOrders: undefined;
  LiveSupport: undefined;
  Settings: undefined;
};

// The Org Student tab set - same shape as MainTabParamList (Home becomes
// Overview, Library becomes Games), mounted instead of MainTabs while
// RoleModeContext's mode is 'org-student'. For a student linked to an
// NGO/Institution (my-organization.html's own account, not an Individual
// Sponsor - a different relationship, see become-sponsor.html's form
// split): Overview mixes the normal student dashboard with the org's own
// feed/announcements/events (the org's own Library is a quick action from
// there, not this tab bar), Games is my-organization.html's own note-
// recognition game, and there's no "Sponsor Access Code" redemption tile
// since this account is already linked. Messages is the org's own thread
// plus lesson chats with org tutors, not the plain shared MessagesScreen.
export type OrgStudentTabParamList = {
  Overview: undefined;
  Games: undefined;
  Messages: undefined;
  Store: NavigatorScreenParams<StoreStackParamList> | undefined;
  More: NavigatorScreenParams<OrgStudentMoreStackParamList> | undefined;
};

export type OrgStudentMoreStackParamList = {
  OrgStudentMoreHome: undefined;
  LiveSupport: undefined;
  Settings: undefined;
};

// Wraps the whole tab bar. Profile (the header avatar's destination) is
// deliberately separate from the More tab - two different destinations,
// not the same screen reached two ways - so it's pushed here, covering the
// tab bar, rather than living inside MoreStack.
export type MainStackParamList = {
  TeachingTools: undefined;
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Profile: undefined;
  Notifications: undefined;
  EditProfile: undefined;
  // assignForStudent is set only when a sponsor reaches this screen through
  // "Assign a Tutor" on the Sponsor Dashboard - it swaps "Request a tutor"
  // for "Match with <student>" and submits the request on that student's
  // behalf (see AssignTutorScreen and /api/tutor-requests' assignStudentId).
  // orgScope is set when Org Student mode's own "Find a tutor" reaches this
  // screen - narrows the marketplace down to that organization's own linked
  // tutors instead of every Mozart tutor.
  FindTutor: { assignForStudent?: { id: number; name: string; preferredCategories: string[] }; orgScope?: { id: number; name: string } } | undefined;
  // Mirrors find-performer.html natively - browse performers and post a
  // broadcast event request, reachable from every mode's More menu.
  FindPerformer: undefined;
  // A public, read-only portfolio opened from a performer card in the
  // marketplace. The performer id is enough to reload fresh public media.
  PerformerPublicProfile: { performerId: number };
  // The Sponsor Dashboard's "Assign a Tutor" quick action - lists sponsored
  // students so one can be picked before FindTutor opens in assign mode.
  AssignTutor: undefined;
  LearningProfile: undefined;
  Schedule: undefined;
  StoreProfile: { initialTab?: 'orders' | 'inbox' | 'ratings' | 'recently-viewed' | 'addresses' | 'notifications' } | undefined;
  TutorResponses: undefined;
  // The mandatory 14-screen Tutor Orientation modal (see
  // mobile/src/data/tutorOrientationContent.ts). No params = the real
  // gate, pushed from TutorDashboardScreen when user.needsTutorOrientation
  // is true, non-dismissible until "I Understand & Agree". reviewMode:true
  // is the reopen path (TutorMoreScreen's "Orientation & Policies" row) -
  // same content, but closable at any point and doesn't re-log acceptance.
  TutorOrientation: { reviewMode?: boolean } | undefined;
  // The performer equivalent - see PerformerOrientationScreen.tsx and
  // mobile/src/data/performerOrientationContent.ts. Same gating shape,
  // pushed from PerformerRequestsScreen instead of TutorDashboardScreen.
  PerformerOrientation: { reviewMode?: boolean } | undefined;
  // Tier progress, assigned quizzes, MT certification modules, external-
  // credential submission, and practicum review - see TeacherEducationScreen.
  TeacherEducation: undefined;
  // ProductDetail/Category live in StoreStackParamList now, not here - see
  // the note above StoreStackParamList's own definition.
  Cart: undefined;
  Chat: { assignmentId: number; name: string; photoUrl: string | null };
  // An in-app video call/meeting (Google Meet link) rendered inside a
  // WebView rather than handed off to the device's browser - keeps the
  // whole lesson-joining flow visually inside the app instead of switching
  // to a separate task. See MeetingWebViewScreen for the camera/mic
  // permission handling this relies on. Also reused for a plain link typed
  // into chat (title defaults to "Meeting" when omitted, so every existing
  // caller stays unchanged).
  MeetingWebView: { url: string; title?: string };
  // The org-chat thread (org<->tutor direct, or a classroom group) - a
  // different backend from the per-assignment Chat above (real-time-ish
  // via polling, not the lesson chat's websocket), reached from Org Tutor
  // mode's Messages tab.
  OrgChat: { conversationId: number; title: string; photoUrl: string | null };
  // A support agent's view of one customer conversation, pushed from the
  // Support Agent mode's Inbox tab - same "list pushes a detail chat"
  // pattern Chat/OrgChat above use.
  SupportThread: { threadId: number };
  CounterpartProfile: { type: 'tutor' | 'student'; id: number };
  // The org's own shared library (/api/organizations/library) - distinct
  // from both the tutor's own MyLibrary and the shared Mozart Library.
  OrgLibrary: undefined;
  // Its own screen (mirrors ngo-dashboard.html's Access Codes tab) - not a
  // bottom sheet, since it needs its own generate/invite form plus the
  // full issued-codes list.
  AccessCodes: undefined;
  // The organization's feed/photo/video posts - separate from Announcements,
  // which stay inline on the Org Tutor Overview screen itself.
  OrgFeeds: undefined;
  // Org Tutor mode's own notification bell - org-related items only, a
  // different destination from the generic Notifications screen.
  OrgNotifications: undefined;
  // Sponsor mode's own notification bell - this account's own organization
  // items only (application/subscription updates), a different destination
  // from both the generic Notifications screen and OrgNotifications above.
  SponsorNotifications: undefined;
  // Same technique-library screen the student Library tab uses, registered
  // here too so it's reachable as a push from tutor mode, which has no
  // Library tab of its own (see TutorTabParamList above). Also how a
  // library share link tapped in chat opens straight to that clip.
  Library: { openItemSlug?: string } | undefined;
  // The tutor's own library uploads - distinct from the shared Library
  // above (mirrors tutor.html's "Technique video uploads" card).
  MyLibrary: undefined;
  // Editing courses/rate/bio/qualifications/etc. - reached from "My
  // Profile" (CounterpartProfileScreen viewing the tutor's own record).
  TutorEditProfile: undefined;
  // Mirrors orientation-hub.html - one real screen for every audience, the
  // content/quiz shown is resolved server-side from the signed-in account
  // (GET /api/orientation), not chosen here.
  Orientation: undefined;
  // A generic "not built yet" destination, native rather than a web
  // redirect - reused for the Profile menu items that don't have a real
  // screen of their own yet (Store Profile, Sponsor/Org Tutor, Admin,
  // Support Agent).
  Placeholder: { title: string; icon: string; body: string };
};

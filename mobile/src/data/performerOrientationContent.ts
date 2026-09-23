import type { Ionicons } from '@expo/vector-icons';

// Structured content for the mandatory Performer Orientation modal
// (PerformerOrientationScreen.tsx) - mirrors tutorOrientationContent.ts's
// structure exactly (same OrientationScreen shape), adapted for the
// performer role. Kept as data, not JSX, so wording edits don't touch the
// rendering component. Bump VERSION whenever content changes materially.
export const PERFORMER_ORIENTATION_VERSION = '1.2';

export type OrientationBackground = 'light' | 'dark';

export interface OrientationScreen {
  id: number;
  background: OrientationBackground;
  icon: keyof typeof Ionicons.glyphMap;
  kicker?: string;
  title: string;
  body: string[];
  list?: string[];
  footnote?: string;
}

export const PERFORMER_ORIENTATION_SCREENS: OrientationScreen[] = [
  {
    id: 1,
    background: 'dark',
    icon: 'musical-notes-outline',
    title: 'Performer Orientation & Principles of Operation',
    body: [
      'Please read this in full before you take your first booking. It explains how payments, bookings, ratings, event formats, and platform standards work for every Mozart Techniques performer.',
    ],
    footnote: 'Mandatory reading — shown once during performer account setup.',
  },
  {
    id: 2,
    background: 'light',
    icon: 'globe-outline',
    kicker: 'What Mozart Techniques Is',
    title: 'Welcome to Mozart Techniques',
    body: [
      'A marketplace connecting students, tutors, and performers in one place — live, peer-to-peer instruction and performance, built for every performing-arts discipline.',
      'As a performer, you bring live performance to the platform. Every event you play is part of how clients experience Mozart Techniques.',
    ],
  },
  {
    id: 3,
    background: 'light',
    icon: 'wallet-outline',
    kicker: 'Getting Paid',
    title: 'Automated pay-as-you-go',
    body: [
      'Set up your payment details once, at account creation — there is nothing further to configure.',
      'Payouts trigger automatically as bookings are confirmed and delivered.',
    ],
  },
  {
    id: 4,
    background: 'light',
    icon: 'medal-outline',
    kicker: 'Featured Performer Status',
    title: 'A spotlight badge, earned',
    body: [
      'Featured Performer shows as a badge next to your profile icon — earned through accumulated positive reviews and 5-star ratings. There is no separate application.',
      'It increases your reputation and visibility across the platform, including in client recommendations.',
    ],
  },
  {
    id: 5,
    background: 'light',
    icon: 'trophy-outline',
    kicker: 'Merit-Based Recommendations',
    title: 'Recommendations are earned, not bought',
    body: [
      'Every platform recommendation to a client is based solely on qualifications and merit — never favoritism, tenure, or paid placement.',
    ],
  },
  {
    id: 6,
    background: 'dark',
    icon: 'people-outline',
    kicker: 'Getting Booked',
    title: 'How requests reach you',
    body: [
      "You're notified based on location, availability, genre/style, and rates. You can accept or decline any request — the choice is always yours.",
      'Clients can also browse the roster and request a performer directly.',
    ],
  },
  {
    id: 7,
    background: 'light',
    icon: 'shield-checkmark-outline',
    kicker: 'Professional Conduct',
    title: 'Punctuality and communication',
    body: [
      'Arrive with enough time to set up before the agreed start, and confirm run-of-show details with the client ahead of the event — song list, duration, breaks, and any technical needs.',
      "If something changes on your end, tell the client as early as possible. The platform tracks response times and no-shows, and they factor into your standing.",
    ],
  },
  {
    id: 8,
    background: 'light',
    icon: 'car-outline',
    kicker: 'Event Formats & Transport',
    title: 'Your studio, their venue, or virtual',
    body: [
      "Events happen at your own studio, at the client's venue, or virtually — client's choice, within what you offer.",
    ],
    footnote: "Disclaimer: for performances at a client's venue, transportation and equipment logistics are negotiated separately between you and the client. They are not included in the platform's auto-billing fee.",
  },
  {
    id: 9,
    background: 'dark',
    icon: 'sparkles-outline',
    kicker: 'Platform Standards',
    title: 'What every booking should deliver',
    body: [
      'Every Mozart Techniques performer operates by four core values: Authenticity, Accountability, Realistic expectations, and Adaptability.',
      'Your first conversation with a client should confirm the realistic scope of the event, then build a run-of-show around it — using the platform\'s tools or your own plan.',
    ],
  },
  {
    id: 10,
    background: 'light',
    icon: 'construct-outline',
    kicker: 'In-App Toolkit',
    title: 'Built into your messaging panel',
    body: [
      'Every booking chat comes with a toolkit designed for real performance work, not just messaging:',
    ],
    list: [
      'Notebook & music manuscript',
      'Note taker (accessibility / neurodivergent support)',
      'Metronome, tuner & pitch finder',
      'Aural skills trainer',
      'Virtual digital piano',
      'Web Audio 2-deck DJ mixer',
      'Onion-skin video mirror',
      'Stage blocking & script annotator',
      'Content library',
    ],
  },
  {
    id: 11,
    background: 'light',
    icon: 'checkmark-done-outline',
    kicker: 'Quick Recap',
    title: 'The must-knows',
    body: [],
    list: [
      'Set up payment details once — payouts are automatic',
      "You're always free to accept or decline a booking",
      'Confirm run-of-show details before every event',
      'Venue transport/equipment logistics are billed separately from the platform',
    ],
  },
  {
    id: 12,
    background: 'dark',
    icon: 'checkmark-circle-outline',
    title: "You're ready to perform",
    body: [
      'By tapping "I Understand & Agree," you confirm you\'ve read this orientation in full and agree to operate by the standards above.',
    ],
    footnote: 'You can revisit this anytime from Settings → Orientation & Policies.',
  },
];

import type { Ionicons } from '@expo/vector-icons';

// Structured content for the mandatory Tutor Orientation modal
// (TutorOrientationScreen.tsx) - kept as data, not JSX, so a future edit to
// wording/order doesn't require touching the rendering component. Bump
// VERSION whenever the content changes materially; it's logged alongside
// tutor_id/timestamp on acceptance (server.js's acknowledgeTutorOrientation).
export const TUTOR_ORIENTATION_VERSION = '1.0';

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

export const TUTOR_ORIENTATION_SCREENS: OrientationScreen[] = [
  {
    id: 1,
    background: 'dark',
    icon: 'school-outline',
    title: 'Tutor Orientation & Principles of Operation',
    body: [
      'Please read this in full before you begin teaching. It explains how payments, assessments, tiers, matching, and platform standards work for every Mozart Techniques tutor.',
    ],
    footnote: 'Mandatory reading — shown once during tutor account setup.',
  },
  {
    id: 2,
    background: 'light',
    icon: 'globe-outline',
    kicker: 'What Mozart Techniques Is',
    title: 'Welcome to Mozart Techniques',
    body: [
      'A marketplace connecting students, tutors, and performers in one place — live, peer-to-peer instruction built for every performing-arts discipline, not just one instrument.',
      'As a tutor, you represent the platform. Every lesson you teach is part of how students experience Mozart Techniques.',
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
      'Payouts trigger automatically as lessons are delivered. Payout eligibility is tied to passing your orientation quizzes, so staying current on those keeps your wallet moving.',
    ],
  },
  {
    id: 4,
    background: 'dark',
    icon: 'checkbox-outline',
    kicker: 'Orientation & Quizzes',
    title: 'Ongoing orientation, not just this one',
    body: [
      'Orientation videos and articles are assigned periodically by qualified administrators, matched to your certification and teaching level. A short quiz follows every item — required regardless of prior familiarity.',
    ],
    list: [
      '70% pass mark required to remain eligible for wallet payout',
      'Below 70%? You retake it before payout releases',
    ],
  },
  {
    id: 5,
    background: 'light',
    icon: 'ribbon-outline',
    kicker: 'Tutor Tiers',
    title: 'Beginner, Intermediate, Advanced, Professional',
    body: [
      'Your tier is assigned via a CV/résumé assessment by qualified administrators, and can be reassessed or upgraded as you gain better credentials.',
      'A rare SuperTutor ranking exists above all four tiers. Internal and external training & certification are available on request.',
    ],
  },
  {
    id: 6,
    background: 'light',
    icon: 'medal-outline',
    kicker: 'SuperTutor Status',
    title: "A general's medal, earned",
    body: [
      'SuperTutor shows as a badge next to your profile icon — earned through accumulated positive reviews and 5-star ratings. There is no separate application.',
      'It increases your reputation and visibility across the platform.',
    ],
  },
  {
    id: 7,
    background: 'light',
    icon: 'trophy-outline',
    kicker: 'Merit-Based Recommendations',
    title: 'Recommendations are earned, not bought',
    body: [
      'Every platform recommendation to a student is based solely on qualifications and merit — never favoritism, tenure, or paid placement.',
    ],
  },
  {
    id: 8,
    background: 'dark',
    icon: 'people-outline',
    kicker: 'Getting Matched',
    title: 'How offers reach you',
    body: [
      "You're notified based on location, availability (in-person or virtual), status, and rates. You can accept or decline any offer — the choice is always yours.",
      'Students can also browse the roster and request a tutor directly.',
    ],
  },
  {
    id: 9,
    background: 'light',
    icon: 'swap-horizontal-outline',
    kicker: 'Student Tutor Changes',
    title: 'One switch, ever',
    body: [
      'A student may switch tutors one time only — whether they found their original tutor through the catalogue, a recommendation, or an accepted offer.',
      "When a student switches, they pay for their new tutor's first lesson themselves. The platform tracks which students have already switched.",
    ],
  },
  {
    id: 10,
    background: 'light',
    icon: 'car-outline',
    kicker: 'Lesson Formats & Transport',
    title: 'Studio, home, or virtual',
    body: [
      "Lessons happen at your studio, at the student's home, or virtually — student's choice, within what you offer.",
    ],
    footnote: "Disclaimer: for lessons at a student's home, transportation fare is negotiated separately between you and the student. It is not included in the platform's auto-billing fee.",
  },
  {
    id: 11,
    background: 'dark',
    icon: 'shield-checkmark-outline',
    kicker: 'Platform Standards',
    title: 'What your first lesson should do',
    body: [
      'Every Mozart Techniques tutor operates by four core values: Authenticity, Accountability, Realistic expectations, and Adaptability.',
      "Your first lesson should diagnose the student's realistic goals, then build a syllabus or plan around an agreed period — using the platform's curriculum tools or your own custom outline.",
    ],
  },
  {
    id: 12,
    background: 'light',
    icon: 'construct-outline',
    kicker: 'In-App Toolkit',
    title: 'Built into your messaging panel',
    body: [
      'Every lesson chat comes with a toolkit designed for real-time teaching, not just messaging:',
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
    id: 13,
    background: 'light',
    icon: 'checkmark-done-outline',
    kicker: 'Quick Recap',
    title: 'The must-knows',
    body: [],
    list: [
      'Set up payment details once — payouts are automatic',
      'Keep quiz scores at 70%+ to stay payout-eligible',
      'Your tier is verified by admin CV review, not self-declared',
      "You're always free to accept or decline a match",
      "First lesson: diagnose realistic goals, build the plan",
      'Home-lesson transport fare is billed separately from the platform',
    ],
  },
  {
    id: 14,
    background: 'dark',
    icon: 'checkmark-circle-outline',
    title: "You're ready to teach",
    body: [
      'By tapping "I Understand & Agree," you confirm you\'ve read this orientation in full and agree to operate by the standards above.',
    ],
    footnote: 'You can revisit this anytime from Settings → Orientation & Policies.',
  },
];

// Part 3.4: the points -> tier resolution algorithm, the one place that
// combines certModules.js (MT-native progress), externalCredentials.js
// (verified outside credentials), and practicumReviews.js (the mandatory
// floor for Advanced/Professional) into a single "what can this tutor
// teach right now" answer. Every other screen (the teacher portal's
// progress widget, the admin console, tutor-matching gating) should read
// through this module rather than re-deriving tier logic itself.
const tiers = require('./teachingTiers');
const certModules = require('./certModules');
const externalCredentials = require('./externalCredentials');
const practicumReviews = require('./practicumReviews');

// f(Scoring_Engine blended competency level) per spec 3.4:
//   level 3 in all Foundation dimensions -> 20 pts (Beginner unlock complete)
//   + one specialist pathway passed        -> +20 pts
//   + Advanced-Specialist practicum passed -> +20 pts
//   + Professional cohort/mentorship signed off -> +20 pts
function nativePoints(tutorId) {
  let points = 0;
  const breakdown = [];
  if (certModules.hasCompletedFoundation(tutorId)) {
    points += 20;
    breakdown.push({ source: 'Foundation program complete', points: 20 });
  }
  if (certModules.hasPassedSpecialistPathway(tutorId)) {
    points += 20;
    breakdown.push({ source: 'Specialist pathway passed', points: 20 });
  }
  if (practicumReviews.hasPassedStage(tutorId, 'advanced_specialist')) {
    points += 20;
    breakdown.push({ source: 'Advanced-Specialist practicum passed', points: 20 });
  }
  if (practicumReviews.hasPassedStage(tutorId, 'professional')) {
    points += 20;
    breakdown.push({ source: 'Professional cohort/mentorship signed off', points: 20 });
  }
  return { points, breakdown };
}

// SUM(mt_points_awarded) across verified rows, capped per-credential so no
// single one can jump the tutor more than one tier band without practicum
// review (spec 3.4's guardrail, enforced here rather than left to the
// admin to remember).
function externalPoints(tutorId, currentNativeTierCode) {
  externalCredentials.expireOverdue();
  const verified = externalCredentials.listForTutor(tutorId).filter((s) => s.status === 'verified');
  let points = 0;
  const breakdown = [];
  let anyCapped = false;
  verified.forEach((submission) => {
    const { points: awarded, capped } = externalCredentials.cappedPoints(submission, currentNativeTierCode);
    points += awarded;
    if (capped) anyCapped = true;
    breakdown.push({
      source: `${submission.crosswalkSnapshot.body} - ${submission.crosswalkSnapshot.credentialName}`,
      points: awarded,
      capped,
    });
  });
  return { points, breakdown, anyCapped };
}

// The full picture for one tutor - what the teacher portal's
// progress-to-next-tier widget and the admin console both read.
function computeStanding(tutorId) {
  const native = nativePoints(tutorId);
  const nativeTier = tiers.tierForPoints(native.points);
  const external = externalPoints(tutorId, nativeTier.code);
  const totalPoints = native.points + external.points;
  const unlockedTier = tiers.tierForPoints(totalPoints);
  const nextTier = tiers.TEACHING_TIERS.find((t) => t.rank === unlockedTier.rank + 1) || null;
  const pointsToNext = nextTier ? Math.max(0, nextTier.mtPointsFloor - totalPoints) : 0;

  // Advanced/Professional never unlock on points alone (spec 3.5) - both
  // require their own passed practicum stage regardless of how the points
  // were earned. Walk down from the points-only tier one rank at a time
  // until landing on a tier that either doesn't need practicum or whose
  // practicum stage this tutor has actually passed - a single one-shot
  // check (rather than this walk) previously let a tutor who'd passed only
  // the Advanced-Specialist stage keep a Professional tier they hadn't
  // earned, since the two gates weren't independent.
  const advancedRank = tiers.findByCode('advanced').rank;
  let gatedTier = unlockedTier;
  for (;;) {
    if (gatedTier.code === 'professional' && !practicumReviews.hasPassedStage(tutorId, 'professional')) {
      gatedTier = tiers.TEACHING_TIERS.find((t) => t.rank === gatedTier.rank - 1);
      continue;
    }
    if (gatedTier.rank >= advancedRank && !practicumReviews.hasPassedStage(tutorId, 'advanced_specialist')) {
      gatedTier = tiers.TEACHING_TIERS.find((t) => t.rank === advancedRank - 1);
      continue;
    }
    break;
  }

  return {
    tutorId: Number(tutorId),
    nativePoints: native.points,
    nativeBreakdown: native.breakdown,
    externalPoints: external.points,
    externalBreakdown: external.breakdown,
    externalPointsCapped: external.anyCapped,
    totalPoints,
    pointsOnlyTier: unlockedTier.code,
    unlockedTier: gatedTier.code,
    practicumGated: gatedTier.code !== unlockedTier.code,
    nextTier: nextTier ? nextTier.code : null,
    pointsToNext,
    policyVersion: require('./credentialCrosswalk').currentPolicyVersion(),
  };
}

module.exports = { nativePoints, externalPoints, computeStanding };

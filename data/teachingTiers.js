// Part 0 of the credential-equivalency spec: the one small, load-bearing
// table every other piece (assignment rules, the crosswalk, the points
// engine) hangs off. Fixed, not admin-editable via UI (unlike the
// crosswalk) - the spec calls this MT's own policy backbone, not something
// that should drift day to day. Deliberately its own concept, not the same
// thing as taxonomy.js's LEVELS ladder (Beginner..Virtuoso, used for
// per-category tutor approval/matching) - LEVELS is "what a tutor is
// approved to teach in one subject today"; a teaching tier is "what MT's
// certification program says this tutor has earned across their whole
// practice." The two are related in spirit but not merged, since merging
// them would silently change how existing tutor approval/matching works.
const TEACHING_TIERS = [
  {
    code: 'beginner',
    label: 'MT Beginner',
    rank: 1,
    canTeachStudentLevel: 'Absolute beginner - late beginner (roughly grades 1-4 across external syllabi)',
    mtPointsFloor: 0,
  },
  {
    code: 'intermediate',
    label: 'MT Intermediate',
    rank: 2,
    canTeachStudentLevel: 'Through late intermediate (roughly grades 5-8 / pre-diploma)',
    mtPointsFloor: 20,
  },
  {
    code: 'advanced',
    label: 'MT Advanced',
    rank: 3,
    canTeachStudentLevel: 'Through pre-professional / associate-diploma level',
    mtPointsFloor: 40,
  },
  {
    code: 'professional',
    label: 'MT Professional',
    rank: 4,
    canTeachStudentLevel: 'Conservatoire-entry and professional-performance preparation',
    mtPointsFloor: 60,
  },
];

function listAll() {
  return TEACHING_TIERS;
}

function findByCode(code) {
  return TEACHING_TIERS.find((t) => t.code === code) || null;
}

// Highest tier whose points floor a given total still clears - the one
// piece of arithmetic every other part of this system calls through.
function tierForPoints(points) {
  const sorted = [...TEACHING_TIERS].sort((a, b) => b.mtPointsFloor - a.mtPointsFloor);
  return sorted.find((t) => points >= t.mtPointsFloor) || TEACHING_TIERS[0];
}

// How many tier ranks apart two tiers are - used to enforce "no single
// external credential jumps more than one tier band without practicum
// review" (spec 3.4).
function rankGap(fromCode, toCode) {
  const from = findByCode(fromCode);
  const to = findByCode(toCode);
  if (!from || !to) return 0;
  return to.rank - from.rank;
}

module.exports = { TEACHING_TIERS, listAll, findByCode, tierForPoints, rankGap };

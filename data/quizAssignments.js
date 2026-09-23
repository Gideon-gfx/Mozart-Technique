// Part 1: admin-assigned orientation quizzes - pushing specific
// certModules.js content at specific tutors, on top of the browsable
// catalog they can already self-serve from. Named quizAssignments (not
// "assignments") deliberately - data/assignments.js already means
// tutor-student lesson bookings in this codebase, a completely different
// concept, and reusing that name/table here would have mixed the two.
const fs = require('fs');
const path = require('path');
const certModules = require('./certModules');

const QUEUE_FILE = path.join(__dirname, 'quizAssignmentsQueue.json');
const RULES_FILE = path.join(__dirname, 'quizAssignmentRules.json');

function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) return { nextId: 1, items: [] };
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  } catch {
    return { nextId: 1, items: [] };
  }
}

function persistQueue(db) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(db, null, 2));
}

function loadRules() {
  if (!fs.existsSync(RULES_FILE)) return { nextId: 1, rules: [] };
  try {
    return JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
  } catch {
    return { nextId: 1, rules: [] };
  }
}

function persistRules(db) {
  fs.writeFileSync(RULES_FILE, JSON.stringify(db, null, 2));
}

// --- Queue (assignments_queue) ---

function listQueue({ tutorId, orgId } = {}) {
  let items = loadQueue().items;
  if (tutorId != null) items = items.filter((i) => i.assignedTo === Number(tutorId));
  if (orgId != null) items = items.filter((i) => i.orgId === Number(orgId));
  return items;
}

function findQueueItem(id) {
  return loadQueue().items.find((i) => i.id === Number(id)) || null;
}

function assign({ orgId = null, assignedByUserId, assignedTo, targetType, targetId, reason = null, dueAt = null }) {
  const db = loadQueue();
  const item = {
    id: db.nextId++,
    orgId,
    assignedByUserId: Number(assignedByUserId),
    assignedTo: Number(assignedTo),
    targetType,
    targetId,
    reason,
    dueAt,
    status: 'assigned',
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  db.items.push(item);
  persistQueue(db);
  return item;
}

function markStarted(id) {
  const db = loadQueue();
  const item = db.items.find((i) => i.id === Number(id));
  if (!item || item.status !== 'assigned') return item || null;
  item.status = 'started';
  persistQueue(db);
  return item;
}

// Called after a module attempt is graded (server.js) - completion means
// the linked quiz was actually passed, not just opened (spec 1.3).
function markCompletedIfPassed(tutorId, moduleCode) {
  const passed = certModules.passedModulesForTutor(tutorId).some((a) => a.moduleCode === moduleCode);
  if (!passed) return [];
  const db = loadQueue();
  const matches = db.items.filter((i) => i.assignedTo === Number(tutorId) && i.targetType === 'module' && i.targetId === moduleCode && i.status !== 'completed');
  matches.forEach((item) => {
    item.status = 'completed';
    item.completedAt = new Date().toISOString();
  });
  if (matches.length) persistQueue(db);
  return matches;
}

// Sweeps assigned/started items past due into 'overdue' - lazy check, read
// wherever the queue is listed, same pattern as externalCredentials.js's
// expireOverdue().
function sweepOverdue() {
  const db = loadQueue();
  const now = Date.now();
  let changed = false;
  db.items.forEach((item) => {
    if ((item.status === 'assigned' || item.status === 'started') && item.dueAt && new Date(item.dueAt).getTime() < now) {
      item.status = 'overdue';
      changed = true;
    }
  });
  if (changed) persistQueue(db);
}

function waive(id, adminUserId, reason) {
  const db = loadQueue();
  const item = db.items.find((i) => i.id === Number(id));
  if (!item) return null;
  item.status = 'waived';
  item.reason = reason ? `${item.reason || ''} [Waived by admin: ${reason}]`.trim() : item.reason;
  persistQueue(db);
  return item;
}

// --- Rules (assignment_rules) ---

function listRules({ activeOnly = false } = {}) {
  const rules = loadRules().rules;
  return activeOnly ? rules.filter((r) => r.active) : rules;
}

function createRule({ orgId = null, trigger, filter, targetType, targetIds, cadence = null, createdByUserId }) {
  const db = loadRules();
  const rule = {
    id: db.nextId++,
    orgId,
    trigger,
    filter,
    targetType,
    targetIds,
    cadence,
    active: true,
    createdByUserId: Number(createdByUserId),
    createdAt: new Date().toISOString(),
  };
  db.rules.push(rule);
  persistRules(db);
  return rule;
}

function setRuleActive(id, active) {
  const db = loadRules();
  const rule = db.rules.find((r) => r.id === Number(id));
  if (!rule) return null;
  rule.active = Boolean(active);
  persistRules(db);
  return rule;
}

// Applies every active rule whose trigger matches the given context against
// a candidate list of tutors, queuing anything not already outstanding.
// `tutors` is the caller's already-filtered candidate set (server.js knows
// how to read tutor profiles; this module stays storage-agnostic about
// what a "tutor" record looks like beyond its id/categories/orgId).
function applyRules(trigger, tutors, adminUserId) {
  const rules = listRules({ activeOnly: true }).filter((r) => r.trigger === trigger);
  const queued = [];
  rules.forEach((rule) => {
    tutors
      .filter((t) => matchesFilter(t, rule.filter))
      .forEach((t) => {
        rule.targetIds.forEach((targetId) => {
          const already = listQueue({ tutorId: t.id }).some(
            (i) => i.targetType === rule.targetType && i.targetId === targetId && ['assigned', 'started'].includes(i.status),
          );
          if (already) return;
          queued.push(assign({
            orgId: rule.orgId,
            assignedByUserId: adminUserId,
            assignedTo: t.id,
            targetType: rule.targetType,
            targetId,
            reason: `Auto-assigned by rule: ${rule.trigger}`,
            dueAt: null,
          }));
        });
      });
  });
  return queued;
}

function matchesFilter(tutor, filter) {
  if (!filter) return true;
  if (filter.instrument && !(tutor.categories || []).includes(filter.instrument)) return false;
  if (filter.orgId != null && tutor.orgId !== filter.orgId) return false;
  // The spec's own example: "any teacher whose INCL dimension score drops
  // below 60% gets F13 assigned automatically" - checked against that
  // tutor's most recent attempt touching the given dimension.
  if (filter.dimension && filter.below_pct != null) {
    const attempts = certModules.attemptsForTutor(tutor.id)
      .filter((a) => a.dimensionScores && a.dimensionScores[filter.dimension])
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    const latest = attempts[0];
    if (!latest || latest.dimensionScores[filter.dimension].pct >= filter.below_pct) return false;
  }
  return true;
}

module.exports = {
  listQueue,
  findQueueItem,
  assign,
  markStarted,
  markCompletedIfPassed,
  sweepOverdue,
  waive,
  listRules,
  createRule,
  setRuleActive,
  applyRules,
};

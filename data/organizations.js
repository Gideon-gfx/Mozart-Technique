// NGO / organization sponsorships. An org applies (tied to their own login,
// same pattern as tutor applications), an admin reviews the application and
// separately activates a 1-year subscription once payment is confirmed
// (simulated - same "real workflow, no live payment processor" approach
// used for the escrow-style lesson payments elsewhere in this app). Once
// active, the org can generate access codes ("IDs") for the students they
// sponsor; a student redeems a code to link their account to the org.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { geocodeAddress } = require('./geocode');

const DATA_FILE = path.join(__dirname, 'organizations.json');
const SUBSCRIPTION_YEARS_MS = 365 * 24 * 60 * 60 * 1000;

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, organizations: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, organizations: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().organizations;
}

function findById(id) {
  return listAll().find((o) => o.id === Number(id)) || null;
}

function findByUserId(userId) {
  return listAll().find((o) => o.userId === userId) || null;
}

function removeByUserId(userId) {
  const db = load();
  const filtered = db.organizations.filter((o) => o.userId !== userId);
  if (filtered.length === db.organizations.length) return false;
  db.organizations = filtered;
  persist(db);
  return true;
}

async function apply({ userId, name, contactName, email, phone, registrationNumber, address, description, sponsorType, organizationType, certificateUrl, numStudents, numTutors }) {
  const db = load();
  const coords = address ? await geocodeAddress(address) : null;
  const org = {
    id: db.nextId++,
    userId,
    name: sponsorType === 'individual' ? null : name,
    contactName,
    email,
    phone: phone || null,
    registrationNumber: registrationNumber || null,
    address: address || null,
    fullAddress: coords ? coords.fullAddress || null : null,
    locality: coords ? { city: coords.city, state: coords.state, country: coords.country } : null,
    description: description || '',
    sponsorType: sponsorType || 'individual', // 'individual' | 'ngo'
    organizationType: organizationType || 'ngo', // 'ngo' | 'institution' (only for sponsor type 'ngo')
    certificateUrl: certificateUrl || null,
    numStudents: numStudents || null,
    numTutors: numTutors || null,
    status: 'pending', // pending | approved | rejected - the application itself
    subscriptionStatus: 'inactive', // inactive | active | expired
    monthlyAmount: 0, // Amount in currency for monthly subscription (set by admin)
    subscriptionStartAt: null,
    subscriptionEndAt: null,
    studentCodes: [],
    folders: [],
    createdAt: new Date().toISOString(),
  };
  db.organizations.push(org);
  persist(db);
  return org;
}

function setStatus(id, status) {
  const db = load();
  const org = db.organizations.find((o) => o.id === Number(id));
  if (!org) return null;
  org.status = status;
  org.reviewedAt = new Date().toISOString();

  if (status === 'rejected') {
    org.subscriptionStatus = 'inactive';
    org.subscriptionStartAt = null;
    org.subscriptionEndAt = null;
  }

  persist(db);
  return org;
}

// Admin confirms the (simulated) annual subscription payment - no live
// payment processor is wired up, same as the rest of this app's payment
// flows, but the subscription window is tracked for real.
function activateSubscription(id, months = 12) {
  const db = load();
  const org = db.organizations.find((o) => o.id === Number(id));
  if (!org) return null;
  const now = new Date();
  const startsFrom = isSubscriptionActive(org) ? new Date(org.subscriptionEndAt) : now;
  org.subscriptionStatus = 'active';
  org.subscriptionStartAt = org.subscriptionStartAt || now.toISOString();
  const endsAt = new Date(startsFrom);
  endsAt.setMonth(endsAt.getMonth() + Number(months || 12));
  org.subscriptionEndAt = endsAt.toISOString();
  if (!org.paymentHistory) org.paymentHistory = [];
  org.paymentHistory.unshift({
    type: Number(months) === 1 ? 'monthly' : 'yearly',
    amount: Number(org.monthlyAmount || 0) * (Number(months) === 1 ? 1 : 12 * 0.99),
    date: now.toISOString(),
  });
  persist(db);
  return org;
}

function setMonthlyAmount(id, monthlyAmount) {
  const db = load();
  const org = db.organizations.find((o) => o.id === Number(id));
  if (!org) return null;
  org.monthlyAmount = Number(monthlyAmount) || 0;
  persist(db);
  return org;
}

function isSubscriptionActive(org) {
  return org.subscriptionStatus === 'active' && org.subscriptionEndAt && new Date(org.subscriptionEndAt) > new Date();
}

// Generates a unique student access code ("ID") the org can hand out to a
// beneficiary. The code itself carries no auth power until redeemed by a
// signed-in student, at which point it links that student's account to
// the org and marks their access as sponsor-activated.
function newCode(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function generateOrganizationCode(orgId, role = 'student', recipient = {}) {
  const db = load();
  const org = db.organizations.find((o) => o.id === Number(orgId));
  if (!org) return null;
  if (!isSubscriptionActive(org)) return null;
  const normalizedRole = role === 'tutor' ? 'tutor' : 'student';
  const field = normalizedRole === 'tutor' ? 'tutorCodes' : 'studentCodes';
  if (!org[field]) org[field] = [];
  let code;
  do {
    code = newCode(normalizedRole === 'tutor' ? 'MZT-T' : 'MZT-S');
  } while (db.organizations.some((organization) => [...(organization.studentCodes || []), ...(organization.tutorCodes || [])].some((entry) => entry.code === code)));
  const entry = { code, role: normalizedRole, organizationId: org.id, issuedToName: String(recipient.name || '').trim() || null, sentToEmail: String(recipient.email || '').trim().toLowerCase() || null, createdAt: new Date().toISOString(), redeemedAt: null, redeemedBy: null };
  org[field].push(entry);
  persist(db);
  return entry;
}

function generateStudentCode(orgId) { return generateOrganizationCode(orgId, 'student'); }

function redeemCode(code, userId, userName, expectedRole = null) {
  const db = load();
  const normalized = String(code || '').trim().toUpperCase();
  for (const org of db.organizations) {
    if (!isSubscriptionActive(org)) continue;
    const entry = [...(org.studentCodes || []), ...(org.tutorCodes || [])].find((c) => c.code === normalized);
    if (!entry) continue;
    if (expectedRole && entry.role !== expectedRole) return { error: 'wrong-role' };
    
    if (entry.redeemedAt) return { error: 'already-redeemed' };
    entry.redeemedBy = userId;
    entry.redeemedName = userName;
    entry.redeemedAt = new Date().toISOString();
    if (!org.members) org.members = [];
    if (!org.members.some((member) => member.studentId === userId && (member.role || 'student') === entry.role)) {
      org.members.push({ studentId: userId, studentName: userName, role: entry.role, redeemedAt: entry.redeemedAt });
    }
    persist(db);
    return { org, entry };
  }
  return { error: 'not-found' };
}

function markCodeSent(orgId) {
  const db = load();
  const org = db.organizations.find((o) => o.id === Number(orgId));
  if (!org) return null;
  const orgCode = org.studentCodes.find((c) => c.isOrganizationalCode);
  if (!orgCode) return null;
  orgCode.sentToOrganization = true;
  orgCode.sentAt = new Date().toISOString();
  persist(db);
  return org;
}

function markCodeInvited(orgId, code, email) {
  const db = load();
  const org = db.organizations.find((entry) => entry.id === Number(orgId));
  if (!org) return null;
  const entry = [...(org.studentCodes || []), ...(org.tutorCodes || [])].find((item) => item.code === code);
  if (!entry) return null;
  entry.sentToEmail = String(email || '').trim().toLowerCase();
  entry.sentAt = new Date().toISOString();
  persist(db);
  return entry;
}

function listCodes(orgId) {
  const org = findById(orgId);
  if (!org) return { students: [], tutors: [] };
  return { students: org.studentCodes || [], tutors: org.tutorCodes || [] };
}

function updateProfile(orgId, fields) {
  const db = load();
  const org = db.organizations.find((entry) => entry.id === Number(orgId));
  if (!org) return null;
  ['name', 'contactName', 'phone', 'address', 'description', 'logoUrl'].forEach((field) => {
    if (fields[field] !== undefined) org[field] = String(fields[field] || '').trim();
  });
  org.updatedAt = new Date().toISOString();
  persist(db);
  return org;
}

function findOrgForStudent(studentUserId) {
  return listAll().find((o) => o.studentCodes.some((c) => (c.redeemedBy || c.studentId) === studentUserId)) || null;
}

// Get all students who have redeemed codes from this organization
function getStudentsForOrganization(orgId) {
  const org = findById(orgId);
  if (!org) return [];
  const individualStudents = org.studentCodes
    .filter((c) => (c.redeemedBy || c.studentId) && c.redeemedAt && c.role === 'student')
    .map((c) => ({
      studentId: c.redeemedBy || c.studentId,
      studentName: c.redeemedName || c.studentName,
      redeemedAt: c.redeemedAt,
    }));
  return [...individualStudents, ...(org.members || []).filter((member) => (member.role || 'student') === 'student')];
}

function removeMember(orgId, studentId) {
  const db = load();
  const org = db.organizations.find((entry) => entry.id === Number(orgId));
  if (!org) return false;
  const before = (org.members || []).length;
  org.members = (org.members || []).filter((member) => Number(member.studentId) !== Number(studentId));
  org.studentCodes = (org.studentCodes || []).map((entry) => entry.studentId === Number(studentId) ? { ...entry, studentId: null, studentName: null, redeemedAt: null } : entry);
  if (org.members.length === before) return false;
  persist(db);
  return true;
}

function addEvent(orgId, event) {
  const db = load();
  const org = db.organizations.find((entry) => entry.id === Number(orgId));
  if (!org) return null;
  if (!org.events) org.events = [];
  const saved = { id: Date.now(), ...event, createdAt: new Date().toISOString() };
  org.events.unshift(saved);
  persist(db);
  return saved;
}

function updateEvent(orgId, eventId, meetLink) {
  const db = load();
  const org = db.organizations.find((entry) => entry.id === Number(orgId));
  const event = org && (org.events || []).find((entry) => String(entry.id) === String(eventId));
  if (!event) return null;
  event.meetLink = meetLink || null;
  persist(db);
  return event;
}

function addClassroom(orgId, classroom) {
  const db = load();
  const org = db.organizations.find((entry) => entry.id === Number(orgId));
  if (!org) return null;
  if (!org.classrooms) org.classrooms = [];
  const saved = { id: Date.now(), name: String(classroom.name || '').trim() || 'Classroom', createdAt: new Date().toISOString() };
  org.classrooms.push(saved);
  persist(db);
  return saved;
}

function addFolder(orgId, name) {
  const db = load();
  const org = db.organizations.find((entry) => entry.id === Number(orgId));
  if (!org) return null;
  if (!org.folders) org.folders = [];
  const folder = { id: Date.now(), name: String(name || '').trim() || 'Untitled folder', createdAt: new Date().toISOString() };
  org.folders.push(folder);
  persist(db);
  return folder;
}

module.exports = {
  listAll, findById, findByUserId, removeByUserId, apply, setStatus,
  activateSubscription, isSubscriptionActive, setMonthlyAmount, generateStudentCode, redeemCode, findOrgForStudent,
  getStudentsForOrganization, removeMember, addEvent, updateEvent, addClassroom, addFolder, listCodes, updateProfile, markCodeSent, markCodeInvited, generateOrganizationCode,
};

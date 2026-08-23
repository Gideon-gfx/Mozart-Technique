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

async function apply({ userId, name, contactName, email, phone, registrationNumber, address, description, sponsorType, organizationType, certificateUrl }) {
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
    status: 'pending', // pending | approved | rejected - the application itself
    subscriptionStatus: 'inactive', // inactive | active | expired
    monthlyAmount: 0, // Amount in currency for monthly subscription (set by admin)
    subscriptionStartAt: null,
    subscriptionEndAt: null,
    studentCodes: [],
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

  if (status === 'approved' && org.sponsorType === 'ngo') {
    const existingOrgCode = org.studentCodes.find((c) => c.isOrganizationalCode);
    if (!existingOrgCode) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      org.studentCodes.push({
        code,
        isOrganizationalCode: true,
        studentId: null,
        studentName: null,
        redeemedAt: null,
        sentToOrganization: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  persist(db);
  return org;
}

// Admin confirms the (simulated) annual subscription payment - no live
// payment processor is wired up, same as the rest of this app's payment
// flows, but the subscription window is tracked for real.
function activateSubscription(id) {
  const db = load();
  const org = db.organizations.find((o) => o.id === Number(id));
  if (!org) return null;
  const now = new Date();
  const startsFrom = isSubscriptionActive(org) ? new Date(org.subscriptionEndAt) : now;
  org.subscriptionStatus = 'active';
  org.subscriptionStartAt = org.subscriptionStartAt || now.toISOString();
  org.subscriptionEndAt = new Date(startsFrom.getTime() + SUBSCRIPTION_YEARS_MS).toISOString();
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
function generateStudentCode(orgId) {
  const db = load();
  const org = db.organizations.find((o) => o.id === Number(orgId));
  if (!org) return null;
  if (!isSubscriptionActive(org)) return null;
  
  // For NGO/Institution type: return existing organizational code if it exists
  if (org.sponsorType === 'ngo') {
    const existingOrgCode = org.studentCodes.find((c) => c.isOrganizationalCode);
    if (existingOrgCode) {
      return existingOrgCode;
    }
    // Generate the single organizational code for NGO
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const entry = { 
      code, 
      isOrganizationalCode: true,
      studentId: null, 
      studentName: null, 
      redeemedAt: null,
      sentToOrganization: false,
      createdAt: new Date().toISOString() 
    };
    org.studentCodes.push(entry);
    persist(db);
    return entry;
  }
  
  // For individual sponsors: generate multiple codes
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  const entry = { 
    code, 
    isOrganizationalCode: false,
    studentId: null, 
    studentName: null, 
    redeemedAt: null, 
    createdAt: new Date().toISOString() 
  };
  org.studentCodes.push(entry);
  persist(db);
  return entry;
}

function redeemCode(code, studentUserId, studentName) {
  const db = load();
  const normalized = String(code || '').trim().toUpperCase();
  for (const org of db.organizations) {
    if (!isSubscriptionActive(org)) continue;
    const entry = org.studentCodes.find((c) => c.code === normalized);
    if (!entry) continue;
    
    // For organizational codes (NGO): allow multiple students to use the same code
    if (entry.isOrganizationalCode) {
      // Just return the org - the student will be linked to this org
      // Don't mark it as redeemed since multiple students need to use it
      return { org, entry };
    }
    
    // For individual sponsor codes: each code can only be used once
    if (entry.redeemedAt) return { error: 'already-redeemed' };
    entry.studentId = studentUserId;
    entry.studentName = studentName;
    entry.redeemedAt = new Date().toISOString();
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

function findOrgForStudent(studentUserId) {
  return listAll().find((o) => o.studentCodes.some((c) => c.studentId === studentUserId)) || null;
}

// Get all students who have redeemed codes from this organization
function getStudentsForOrganization(orgId) {
  const org = findById(orgId);
  if (!org) return [];
  return org.studentCodes
    .filter((c) => c.studentId && c.redeemedAt)
    .map((c) => ({
      studentId: c.studentId,
      studentName: c.studentName,
      redeemedAt: c.redeemedAt,
    }));
}

module.exports = {
  listAll, findById, findByUserId, removeByUserId, apply, setStatus,
  activateSubscription, isSubscriptionActive, setMonthlyAmount, generateStudentCode, redeemCode, findOrgForStudent,
  getStudentsForOrganization, markCodeSent,
};

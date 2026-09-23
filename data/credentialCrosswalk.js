// Part 3.3 of the credential-equivalency spec: Mozart Techniques' own
// proposed policy mapping external teaching/performance credentials onto
// the four teachingTiers.js tiers. This is MT policy, not a ruling any of
// these bodies themselves issued - every row keeps the body's own anchor
// statement (the closest thing to a citable source most of them publish)
// so the admin UI can show "why" next to every point value, per the spec's
// own instruction not to bury that in a hidden field.
//
// Seeded once from the spec's 80-row table below, then persisted to
// credentialCrosswalk.json exactly like every other data/*.js module -
// admins edit points/tier through the admin UI from then on, not in code.
// `version` bumps on every points/tier edit; externalCredentials.js
// snapshots the row's points/tier/version AT THE TIME a submission is
// verified, so a later policy tightening never silently changes a
// teacher's already-awarded points (spec 3.1).
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'credentialCrosswalk.json');

// [body, credentialName, credentialType, bodysOwnAnchor, disciplineScope, mtPoints, proposedTier, verificationMethod]
// verificationMethod omitted -> 'document_review' (the default per spec 3.3).
const SEED_ROWS = [
  // --- ABRSM ---
  ['ABRSM', 'Grade 6-8 practical (no diploma)', 'performance_grade', 'Entry requirement for diplomas', 'music', 10, 'beginner'],
  ['ABRSM', 'ARSM (Performance)', 'performance_diploma', 'RQF Level 4', 'music', 25, 'intermediate'],
  ['ABRSM', 'ARSM (Music Teaching, 2023+)', 'teaching_diploma', 'RQF Level 4', 'music', 30, 'intermediate'],
  ['ABRSM', 'LRSM (Music Teaching, 2023+)', 'teaching_diploma', 'RQF Level 6', 'music', 50, 'advanced'],
  ['ABRSM', 'LRSM (Performance)', 'performance_diploma', 'RQF Level 6, "final year undergraduate" per ABRSM', 'music', 45, 'advanced'],
  ['ABRSM', 'FRSM (Performance or Teaching)', 'teaching_diploma', 'RQF Level 7, master\'s-equivalent', 'music', 65, 'professional'],
  // --- Trinity College London (music) ---
  ['Trinity College London', 'Grades 1-8 (no diploma)', 'performance_grade', 'Entry requirement for diplomas', 'music', 10, 'beginner'],
  ['Trinity College London', 'ATCL / AMusTCL (incl. Teaching)', 'teaching_diploma', 'RQF Level 4, "first-year undergraduate recital" per Trinity', 'music', 25, 'intermediate'],
  ['Trinity College London', 'LTCL / LMusTCL (incl. Teaching)', 'teaching_diploma', 'RQF Level 6, "final-year undergraduate" per Trinity', 'music', 45, 'advanced'],
  ['Trinity College London', 'FTCL', 'performance_diploma', 'RQF Level 7, "postgraduate conservatoire recital" per Trinity', 'music', 65, 'professional'],
  // --- RCM (Canada) ---
  ['RCM (Canada)', 'Level 1-4 practical', 'performance_grade', '"Elementary" band per RCM\'s own teacher designations', 'music', 10, 'beginner'],
  ['RCM (Canada)', 'Level 5-8 practical', 'performance_grade', '"Intermediate" band', 'music', 20, 'intermediate'],
  ['RCM (Canada)', 'Level 9-10 practical', 'performance_grade', '"Advanced" band', 'music', 30, 'advanced'],
  ['RCM (Canada)', 'RCM Certified Teacher - Elementary', 'teacher_designation', 'RCM\'s own designation', 'music', 20, 'beginner', 'issuing_body_lookup'],
  ['RCM (Canada)', 'RCM Certified Teacher - Intermediate', 'teacher_designation', 'RCM\'s own designation', 'music', 35, 'intermediate', 'issuing_body_lookup'],
  ['RCM (Canada)', 'RCM Certified Teacher - Advanced / Advanced Specialist', 'teacher_designation', 'RCM\'s own designation, awarded via ARCT Teacher\'s Diploma or equivalent standing', 'music', 55, 'advanced', 'issuing_body_lookup'],
  ['RCM (Canada)', 'ARCT (Performer, Pedagogy, or Teacher)', 'pedagogy_program', '"Highest academic standing" in the Certificate Program, per RCM', 'music', 60, 'professional', 'issuing_body_lookup'],
  // --- Suzuki Association of the Americas ---
  ['Suzuki Association of the Americas', 'Every Child Can! only', 'pedagogy_program', 'Prerequisite course, no book-level competence yet', 'music', 8, 'beginner'],
  ['Suzuki Association of the Americas', 'Units 1-4 (Book 1-4) completed', 'pedagogy_program', 'SAA Teacher Development Program sequence', 'music', 18, 'beginner'],
  ['Suzuki Association of the Americas', 'Units 5-7 (Book 5-7) completed', 'pedagogy_program', 'SAA Teacher Development Program sequence', 'music', 32, 'intermediate'],
  ['Suzuki Association of the Americas', 'Units 8-10 completed', 'pedagogy_program', 'SAA Teacher Development Program sequence', 'music', 48, 'advanced'],
  ['Suzuki Association of the Americas', 'Registered Teacher Trainer status', 'teacher_designation', 'SAA\'s own trainer designation', 'music', 62, 'professional'],
  // --- OAKE (Kodaly) ---
  ['OAKE (Kodaly)', 'Level I', 'pedagogy_program', '1st of 3 required summers', 'music', 15, 'beginner'],
  ['OAKE (Kodaly)', 'Level II', 'pedagogy_program', '2nd of 3 required summers', 'music', 30, 'intermediate'],
  ['OAKE (Kodaly)', 'Level III (full Kodaly certification)', 'pedagogy_program', 'Completion of OAKE-endorsed program', 'music', 45, 'advanced'],
  // --- AOSA (Orff) ---
  ['AOSA (Orff)', 'Level I', 'pedagogy_program', '1st of 3 levels', 'music', 15, 'beginner'],
  ['AOSA (Orff)', 'Level II', 'pedagogy_program', '2nd of 3 levels', 'music', 30, 'intermediate'],
  ['AOSA (Orff)', 'Level III', 'pedagogy_program', 'Full Orff Schulwerk Certification', 'music', 45, 'advanced'],
  // --- Dalcroze Society of America ---
  ['Dalcroze Society of America', 'Dalcroze Certificate', 'pedagogy_program', 'DSA\'s own first credential tier', 'music', 20, 'intermediate'],
  ['Dalcroze Society of America', 'Dalcroze License', 'pedagogy_program', 'DSA\'s own second credential tier, "all ages and levels"', 'music', 40, 'advanced'],
  ['Dalcroze Society of America', 'Diplome Superieur', 'pedagogy_program', 'Highest Dalcroze credential, trains and examines others', 'music', 60, 'professional'],
  // --- MTNA ---
  ['MTNA', 'NCTM (Nationally Certified Teacher of Music)', 'teacher_designation', 'MTNA\'s own five-standard professional certification', 'music', 40, 'advanced', 'issuing_body_lookup'],
  // --- RAD ---
  ['RAD', 'Certificate in Dance Teaching (Ballet)', 'teaching_diploma', 'RAD\'s entry teaching qualification', 'dance', 15, 'beginner'],
  ['RAD', 'Licentiate (ARAD)', 'teaching_diploma', 'RAD\'s second-tier qualification', 'dance', 40, 'advanced'],
  ['RAD', 'Fellow (FRAD)', 'teaching_diploma', 'RAD\'s highest qualification', 'dance', 60, 'professional'],
  // --- MUSON (Nigeria) ---
  ['MUSON (Nigeria)', 'Grade 5 practical + theory (student)', 'performance_grade', 'Nigerian federal government accredited MUSON since 2002 as equatable to ABRSM', 'music', 10, 'beginner'],
  ['MUSON (Nigeria)', 'MTNF/MUSON Diploma in Music', 'teaching_diploma', 'Self-described 2-year post-Grade-5 programme "patterned on conservatoire standards," enabling direct transfer entry into university music degrees', 'music', 30, 'intermediate'],
  // --- ABGMVM (India/South Asia) ---
  ['ABGMVM (India/South Asia)', 'Prarambhik - Madhyama (early/mid levels)', 'performance_grade', 'Body\'s own beginner-to-mid band', 'music,dance', 10, 'beginner'],
  ['ABGMVM (India/South Asia)', 'Visharad', 'pedagogy_program', 'Body\'s own description places this at bachelor\'s-degree equivalent', 'music,dance', 45, 'advanced'],
  ['ABGMVM (India/South Asia)', 'Sangeetacharya', 'teacher_designation', 'Body\'s own description: "literally teacher of music; equivalent to a doctorate"', 'music,dance', 65, 'professional'],
  // --- Yamaha Music Foundation ---
  ['Yamaha Music Foundation', 'Student Grades 13-6', 'performance_grade', 'Body\'s own student-grade band, not teaching-qualifying', 'music', 10, 'beginner'],
  ['Yamaha Music Foundation', 'Teacher Grade 5 (entry)', 'teacher_designation', 'Lowest of 3 Teacher/Professional grades; required to qualify as a certified Yamaha instructor', 'music', 25, 'intermediate'],
  ['Yamaha Music Foundation', 'Teacher Grade 4', 'teacher_designation', 'Middle Teacher/Professional grade', 'music', 38, 'intermediate'],
  ['Yamaha Music Foundation', 'Teacher Grade 3 (highest)', 'teacher_designation', 'Highest Teacher/Professional grade; system adopted in 30+ countries', 'music', 50, 'advanced'],
  // --- CCOM (China) ---
  ['CCOM (China)', 'Social Music Grade Exam, Grades 1-9', 'performance_grade', 'Run with China\'s Ministry of Education since 1989; primarily a student-achievement ladder', 'music', 10, 'beginner'],
  ['CCOM (China)', 'Performance Certificate (beyond Grade 9)', 'performance_grade', 'CCOM\'s own highest grade-ladder tier; combine with MT practicum, since CCOM doesn\'t itself certify teaching competence at this tier', 'music', 22, 'intermediate'],
  // --- ISTD ---
  ['ISTD', 'Vocational Graded Exams (Intermediate Foundation - Advanced 2)', 'performance_grade', 'Ofqual-accredited bridge between recreational grades and professional/teacher training', 'dance', 10, 'beginner'],
  ['ISTD', 'Associate + Associate Diploma', 'teaching_diploma', 'ISTD\'s own initial dance-teacher qualification route', 'dance', 25, 'intermediate'],
  ['ISTD', 'Licentiate / Level 6 Diploma in Dance Pedagogy (DDP)', 'teaching_diploma', 'Explicitly RQF Level 6 per ISTD\'s own qualification naming', 'dance', 45, 'advanced'],
  ['ISTD', 'Fellowship', 'teaching_diploma', 'ISTD\'s highest teaching qualification', 'dance', 60, 'professional'],
  // --- Cecchetti (CICB) ---
  ['Cecchetti (CICB)', 'Associate / Associate Diploma', 'teaching_diploma', 'Entry teacher qualification across CICB member bodies (UK/Australia/US/Canada)', 'dance', 25, 'intermediate'],
  ['Cecchetti (CICB)', 'Licentiate / Licentiate Diploma', 'teaching_diploma', 'Required before a Cecchetti teacher may mentor other candidates, per Cecchetti Ballet\'s own standard', 'dance', 45, 'advanced'],
  ['Cecchetti (CICB)', 'Fellowship / Diploma Fellow', 'teaching_diploma', 'Highest Cecchetti teaching qualification; typically 8+ years\' teaching experience (Cecchetti Council of America)', 'dance', 60, 'professional'],
  // --- Trinity College London (Drama & Speech) ---
  ['Trinity College London (Drama & Speech)', 'Grades 1-8 (no diploma)', 'performance_grade', 'Entry requirement/precursor to diplomas; UCAS points at Grades 6-8', 'theatre', 10, 'beginner'],
  ['Trinity College London (Drama & Speech)', 'ATCL Teaching (Speech & Drama / Theatre Arts / Communication Skills / Musical Theatre)', 'teaching_diploma', 'RQF Level 4, "first-year undergraduate" per Trinity\'s own drama diploma specification', 'theatre', 25, 'intermediate'],
  ['Trinity College London (Drama & Speech)', 'LTCL Teaching (same subjects)', 'teaching_diploma', 'RQF Level 6, "final-year undergraduate"; recognised by Ofqual/CEA/ACCAC as a teaching qualification', 'theatre', 45, 'advanced'],
  // --- LAMDA ---
  ['LAMDA', 'Entry Level - Grade 5 (no diploma)', 'performance_grade', 'Entry-level graded performance exams, RQF-recognised', 'theatre', 10, 'beginner'],
  ['LAMDA', 'Grades 6-8 (Bronze/Silver/Gold Medal)', 'performance_grade', 'RQF Levels 1-3, UCAS points; still a performance credential, not a teaching diploma', 'theatre', 15, 'beginner'],
  ['LAMDA', 'PCertLAM (Professional Certificate in Speech and Drama)', 'performance_diploma', 'Post-Gold-Medal certificate; LAMDA has no examined teaching-methodology diploma equivalent to Trinity/ISTD\'s teaching tracks - weight toward practicum, don\'t treat alone as a pedagogy credential', 'theatre', 22, 'intermediate'],
  // --- Vaganova / Bolshoi (direct registrar verification - see spec 3.3) ---
  ['Vaganova Ballet Academy', 'Teacher Re-training Course Certificate', 'pedagogy_program', 'Issued directly by the originating academy; short-form (~1 month)', 'dance', 20, 'intermediate', 'direct_registrar_verification'],
  ['Bolshoi Ballet Academy (abroad programme)', 'Teacher Certification Program, Level A', 'pedagogy_program', 'One-week intensive delivered abroad by Academy faculty via a partner organisation, not the Academy itself', 'dance', 12, 'beginner', 'direct_registrar_verification'],
  ['Bolshoi Ballet Academy (abroad programme)', 'Teacher Certification Program, Level B', 'pedagogy_program', 'Requires completion of Level A', 'dance', 18, 'beginner', 'direct_registrar_verification'],
  ['Bolshoi Ballet Academy (abroad programme)', 'Teacher Certification Program, Level C', 'pedagogy_program', 'Adds partnering; highest of the three abroad-delivered levels', 'dance', 22, 'intermediate', 'direct_registrar_verification'],
  // --- France (Ministere de la Culture) ---
  ['France - Ministere de la Culture', 'Diplome d\'Etat (DE) de professeur de danse', 'teaching_diploma', 'RNCP Level 6 (bac+3); legally required in France to teach classical, contemporary or jazz dance', 'dance', 45, 'advanced'],
  ['France - Ministere de la Culture', 'Certificat d\'Aptitude (CA), professeur de danse', 'teacher_designation', 'RNCP Level 7 (bac+5); qualifies holder to direct a conservatoire', 'dance', 60, 'professional'],
  ['France - Ministere de la Culture', 'Diplome d\'Etat (DE) de professeur de musique', 'teaching_diploma', 'Same government framework as DE danse, same 1992 decree', 'music', 45, 'advanced'],
  ['France - Ministere de la Culture', 'Certificat d\'Aptitude (CA), professeur de musique', 'teacher_designation', 'Same RNCP framework as the dance CA', 'music', 60, 'professional'],
  ['France - Ministere de la Culture', 'Certificat d\'Aptitude (CA), professeur d\'art dramatique', 'teacher_designation', 'Same 4-domain CA framework (music/dance/theatre/institution-director)', 'theatre', 60, 'professional'],
  ['France - Ministere de la Culture', 'Diplome d\'Etat (DE) de professeur de theatre', 'teaching_diploma', 'RNCP Level 5 (bac+2); newer credential (decree 21 Nov 2023, RNCP38370), one level below the music/dance DE', 'theatre', 35, 'intermediate'],
  // --- Illustrative single-country examples (Latin America / Arab world - see spec 3.3) ---
  ['Mexico - Conservatorio Nacional de Musica', 'Tecnico Profesional', 'performance_grade', 'Illustrative - Mexico only; lower of two pre-Licenciatura tracks', 'music', 15, 'beginner'],
  ['Mexico - Conservatorio Nacional de Musica', 'Profesional Asociado', 'performance_diploma', 'Illustrative - Mexico only; associate-level track below the full Licenciatura', 'music', 35, 'intermediate'],
  ['Mexico - Conservatorio Nacional de Musica', 'Licenciatura', 'pedagogy_program', 'Illustrative - Mexico only; full bachelor\'s-equivalent, SEP-recognised', 'music', 45, 'advanced'],
  ['Cairo Conservatoire / Academy of Arts (Egypt)', 'Degree (Bachelor\'s-equivalent)', 'pedagogy_program', 'Illustrative - Egypt only; government degree-granting conservatory, structured like a university rather than a graded ladder', 'music', 45, 'advanced'],
  // --- UNISA (South Africa) ---
  ['UNISA (South Africa)', 'Grade 8 practical + Theory (top of grade ladder)', 'performance_grade', 'Southern Africa\'s dominant grading body', 'music', 10, 'beginner'],
  ['UNISA (South Africa)', 'Music Teacher Accreditation, entry tier (Grade 5 practical+theory or equivalent)', 'teacher_designation', 'Permits entering students only up to Grade 3 practical / Grade 4 theory', 'music', 15, 'beginner'],
  ['UNISA (South Africa)', 'Music Teacher Accreditation, full tier (BMus degree or higher)', 'teacher_designation', 'UNISA\'s own "full accreditation," unlocked by a bachelor\'s degree in music', 'music', 45, 'advanced'],
  // --- CLRG (Irish dance) ---
  ['CLRG (An Coimisiun le Rinci Gaelacha)', '12 Grade Examinations (student ladder)', 'performance_grade', 'Global governing body for competitive Irish dance - Ireland, North America (IDTANA), Australia/NZ, Europe', 'dance', 10, 'beginner'],
  ['CLRG (An Coimisiun le Rinci Gaelacha)', 'TMRF (ceili-teaching certification only)', 'teaching_diploma', 'Narrower certification, group/ceili dancing only', 'dance', 20, 'beginner'],
  ['CLRG (An Coimisiun le Rinci Gaelacha)', 'TCRG (full teacher certification)', 'teaching_diploma', 'Six-part exam; the standard qualification required to run a competitive Irish dance school worldwide', 'dance', 35, 'intermediate'],
  ['CLRG (An Coimisiun le Rinci Gaelacha)', 'ADCRG (adjudicator diploma)', 'teacher_designation', 'CLRG\'s highest diploma; requires holding TCRG first, adds judging certification', 'dance', 50, 'advanced'],
];

function seedDb() {
  return {
    nextId: SEED_ROWS.length + 1,
    version: 1,
    rows: SEED_ROWS.map((row, i) => ({
      id: i + 1,
      body: row[0],
      credentialName: row[1],
      credentialType: row[2],
      bodysOwnAnchor: row[3],
      disciplineScope: row[4],
      mtPoints: row[5],
      proposedTier: row[6],
      // Never fabricated - the spec's table gives an anchor statement per
      // row but no citable URL, and inventing one would be actively
      // misleading for something admins are told to treat as a source.
      // Left for an admin to fill in as MT actually verifies each body's
      // published materials.
      sourceUrl: null,
      verificationMethod: row[7] || 'document_review',
      rowVersion: 1,
      active: true,
    })),
  };
}

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    const db = seedDb();
    persist(db);
    return db;
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return seedDb();
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll({ activeOnly = true } = {}) {
  const rows = load().rows;
  return activeOnly ? rows.filter((r) => r.active) : rows;
}

function findById(id) {
  return load().rows.find((r) => r.id === Number(id)) || null;
}

function search(query) {
  const q = String(query || '').trim().toLowerCase();
  const rows = listAll();
  if (!q) return rows;
  return rows.filter((r) => `${r.body} ${r.credentialName}`.toLowerCase().includes(q));
}

// Admin edit - bumps this row's own version so credential submissions
// verified against the old points/tier keep their historical snapshot
// (spec 3.1/3.6), rather than silently inheriting the new value.
function update(id, patch) {
  const db = load();
  const row = db.rows.find((r) => r.id === Number(id));
  if (!row) return null;
  const pointsOrTierChanged = (patch.mtPoints != null && patch.mtPoints !== row.mtPoints)
    || (patch.proposedTier && patch.proposedTier !== row.proposedTier);
  Object.assign(row, patch);
  if (pointsOrTierChanged) {
    row.rowVersion += 1;
    db.version += 1;
  }
  persist(db);
  return row;
}

function create(fields) {
  const db = load();
  const row = {
    id: db.nextId++,
    body: fields.body,
    credentialName: fields.credentialName,
    credentialType: fields.credentialType,
    bodysOwnAnchor: fields.bodysOwnAnchor || '',
    disciplineScope: fields.disciplineScope || 'music',
    mtPoints: Number(fields.mtPoints) || 0,
    proposedTier: fields.proposedTier,
    sourceUrl: fields.sourceUrl || null,
    verificationMethod: fields.verificationMethod || 'document_review',
    rowVersion: 1,
    active: true,
  };
  db.rows.push(row);
  db.version += 1;
  persist(db);
  return row;
}

function setActive(id, active) {
  const db = load();
  const row = db.rows.find((r) => r.id === Number(id));
  if (!row) return null;
  row.active = Boolean(active);
  persist(db);
  return row;
}

function currentPolicyVersion() {
  return load().version;
}

module.exports = { listAll, findById, search, update, create, setActive, currentPolicyVersion };

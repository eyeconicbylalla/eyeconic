/**
 * Platform Choice Recommender (Feature 06) — backend configuration.
 *
 * EVERYTHING the recommender knows about platforms, exams and scoring lives
 * here: platforms can be added/retired, strengths re-tuned, weights rebalanced
 * and exam sessions refreshed WITHOUT touching the engine, the API or the UI.
 * The UI renders only what these definitions + the engine produce.
 *
 * ╥╥ EDITORIAL DEFAULTS ╥╥
 * The strength numbers below are opinionated starting points, not measured
 * facts — the product owner is expected to tune them (that is the point of
 * the config). They only ever RELATIVELY order platforms; they are never
 * shown as claims about a platform.
 *
 * Affiliate/partnership links: each platform resolves its outbound URL as
 *   PLATFORM_CHOICE_AFFILIATE_URL_<KEY> (env, e.g. PLATFORM_CHOICE_AFFILIATE_URL_MARROW)
 *   → falling back to `websiteUrl` from this config.
 * The UI never builds links itself and carries no affiliate logic.
 */

'use strict';

const METHOD_VERSION = 'platform-choice-v1';

/** Score used wherever a factor has NO signal for this student (missing
 *  Mini CCT, no desired branch on record, …). Keeps factors neutral — never
 *  fabricates a strength or a weakness. */
const NEUTRAL_SCORE = 0.5;

// ── Exams & target sessions ───────────────────────────────────────────────────
// FMGE and UPSC CMS are recommender-selectable even though the Rank Predictor
// cannot capture them: here they are a PROFILE input, not a data source.

const EXAMS = [
  {
    id: 'NEET_PG',
    label: 'NEET PG',
    defaultSession: 'NEET_PG_2027',
    sessions: [{ id: 'NEET_PG_2027', label: 'NEET PG 2027' }],
    note: null,
  },
  {
    id: 'INI_CET',
    label: 'INI-CET',
    defaultSession: 'INI_CET_NOV_2026',
    sessions: [
      { id: 'INI_CET_NOV_2026', label: 'INI-CET Nov 2026' },
      { id: 'INI_CET_MAY_2027', label: 'INI-CET May 2027' },
    ],
    note: null,
  },
  {
    id: 'FMGE',
    label: 'FMGE',
    defaultSession: 'FMGE_DEC_2026',
    sessions: [
      { id: 'FMGE_DEC_2026', label: 'FMGE Dec 2026' },
      { id: 'FMGE_JUN_2027', label: 'FMGE Jun 2027' },
    ],
    note: 'FMGE is a pass/fail screening exam — platforms are matched on their FMGE-specific preparation strength, not rank/branch outcomes.',
  },
  {
    id: 'UPSC_CMS',
    label: 'UPSC CMS',
    defaultSession: 'UPSC_CMS_2027',
    sessions: [{ id: 'UPSC_CMS_2027', label: 'UPSC CMS 2027' }],
    note: 'UPSC CMS has a distinct paper pattern (General Medicine + Paediatrics, Surgery, Gynaecology & Obstetrics, Preventive & Social Medicine) — matched on CMS-oriented coverage only.',
  },
];

// ── Previous resource (dropdown) ──────────────────────────────────────────────
// ids double as platform keys for the switching factor. `cerebellum` covers the
// app onboarding's "Cerebrum" spelling (see RESOURCE_ALIASES).

const RESOURCE_OPTIONS = [
  { id: 'none', label: 'None yet — starting fresh' },
  { id: 'marrow', label: 'Marrow' },
  { id: 'prepladder', label: 'PrepLadder' },
  { id: 'cerebellum', label: 'Cerebellum Academy (Cerebrum)' },
  { id: 'dams', label: 'DAMS' },
  { id: 'dbmci', label: 'DBMCI' },
  { id: 'other', label: 'Other / self-study' },
];

/** Map the App onboarding's freeUserProfile.resources strings → resource ids. */
const RESOURCE_ALIASES = {
  marrow: 'marrow',
  prepladder: 'prepladder',
  cerebrum: 'cerebellum', // onboarding spelling of Cerebellum Academy
  cerebellum: 'cerebellum',
  dams: 'dams',
  dbmci: 'dbmci',
  others: 'other',
  other: 'other',
};

// ── Canonical subject list (weakest-3 picker) ─────────────────────────────────
// Keys are the normalized names used in platform.subjectStrength.

const SUBJECTS = [
  'Anatomy', 'Physiology', 'Biochemistry', 'Pharmacology', 'Pathology',
  'Microbiology', 'Forensic Medicine', 'Community Medicine (PSM)', 'ENT',
  'Ophthalmology', 'Medicine', 'Surgery', 'Obstetrics & Gynaecology',
  'Paediatrics', 'Orthopaedics', 'Dermatology', 'Psychiatry', 'Radiology',
  'Anaesthesia',
];

/** Spelling variants → canonical key fragments (normalized matching). */
const SUBJECT_ALIASES = {
  psm: 'community medicine',
  'community medicine': 'community medicine',
  'preventive and social medicine': 'community medicine',
  ent: 'ent',
  otorhinolaryngology: 'ent',
  'obstetrics and gynaecology': 'obstetrics and gynaecology',
  'obstetrics and gynecology': 'obstetrics and gynaecology',
  obg: 'obstetrics and gynaecology',
  obs: 'obstetrics and gynaecology',
  'forensic medicine and toxicology': 'forensic medicine',
  forensic: 'forensic medicine',
  anesthesia: 'anaesthesia',
  paediatric: 'paediatrics',
  pediatric: 'paediatrics',
  orthopedics: 'orthopaedics',
  orthopaedics: 'orthopaedics',
  radiodiagnosis: 'radiology',
  'radio diagnosis': 'radiology',
};

// ── Branch families (desired-branch affinity) ────────────────────────────────
// First matching pattern wins; `other` is the fallback family. Matching runs on
// the lowercase DesiredBranchQuery display string.

const BRANCH_FAMILIES = [
  { family: 'radiology', pattern: /radiolog|radio.?diagnosis/ },
  { family: 'medicine-family', pattern: /general medicine|internal medicine|family medicine|geriatrics|emergency medicine/ },
  { family: 'surgery-family', pattern: /surgery|surgical|trauma|neurosurgery|urology|plastic|cardiothoracic/ },
  { family: 'obg', pattern: /obstetric|gynaecolog|gynecolog/ },
  { family: 'paediatrics', pattern: /paediatric|pediatric/ },
  { family: 'psychiatry', pattern: /psychiatr/ },
  { family: 'dermatology', pattern: /dermatolog|venereolog/ },
  { family: 'orthopaedics', pattern: /orthopaedic|orthopedic/ },
  { family: 'ent-family', pattern: /\bent\b|otorhinolaryngolog|otolaryngolog/ },
  { family: 'ophthalmology', pattern: /ophthalmolog|opthalmolog/ },
  { family: 'anaesthesia', pattern: /anaesthe|anesthe|critical care|intensive care/ },
  { family: 'pathology-family', pattern: /patholog|microbiolog|biochemistr|pharmacolog|physiolog|anatom|forensic|laborator|transfusion/ },
  { family: 'psm-family', pattern: /community medicine|preventive|social medicine|aerospace|sports medicine/ },
];

const DEFAULT_BRANCH_FAMILY = 'other';

// ── Scoring weights (sum = 100; match score = weighted mean × 100) ────────────

const WEIGHTS = {
  examCompatibility: 26,
  weakSubjects: 20,
  conceptRevision: 12,
  desiredBranch: 10,
  studyHours: 12,
  switching: 20,
};

const FACTOR_LABELS = {
  examCompatibility: 'Exam fit',
  weakSubjects: 'Weak-subject coverage',
  conceptRevision: 'Concept-level revision',
  desiredBranch: 'Branch fit',
  studyHours: 'Study-hours fit',
  switching: 'Switching fit',
};

// ── Study-hours model ─────────────────────────────────────────────────────────

const STUDY_HOURS = {
  min: 1,
  max: 18,
  // hours/day ≤ lowMax → 'low'; ≤ moderateMax → 'moderate'; else 'high'
  lowMax: 3,
  moderateMax: 8,
};

const PACE_DESCRIPTIONS = {
  low: 'high-yield, rapid-revision format',
  moderate: 'structured, balanced format',
  high: 'extensive, deep-dive format',
};

// ── Platform catalog (EDITORIAL DEFAULTS — tune freely) ───────────────────────
// subjectStrength keys are normalized subject names; missing keys resolve to
// NEUTRAL_SCORE (a platform is never punished for an unmodelled subject).

const PLATFORMS = [
  {
    key: 'marrow',
    name: 'Marrow',
    tagline: 'Question-bank-first prep with granular analytics',
    keyStrength: 'Massive topic-wise question bank with per-concept analytics and custom modules.',
    bestFor: ['Topic-wise question practice', 'Granular self-analytics', 'Deep clinical coverage'],
    websiteUrl: 'https://www.marrow.com',
    logoUrl: null, // set to a hosted logo URL when brand assets are cleared
    accent: '#18B6A4',
    examStrength: { NEET_PG: 0.95, INI_CET: 0.9, FMGE: 0.85, UPSC_CMS: 0.35 },
    subjectStrength: {
      medicine: 0.95, 'obstetrics and gynaecology': 0.92, paediatrics: 0.93, surgery: 0.92,
      pharmacology: 0.92, pathology: 0.9, radiology: 0.88, dermatology: 0.88, psychiatry: 0.88,
      orthopaedics: 0.87, ent: 0.85, ophthalmology: 0.85, anaesthesia: 0.85, microbiology: 0.85,
      'community medicine': 0.85, physiology: 0.82, anatomy: 0.8, biochemistry: 0.8,
      'forensic medicine': 0.82,
    },
    revisionDepth: 0.95,
    paceFit: { low: 0.55, moderate: 0.85, high: 0.92 },
    branchAffinity: {
      default: 0.8, 'medicine-family': 0.85, paediatrics: 0.85, radiology: 0.82,
      'surgery-family': 0.82, obg: 0.82,
    },
  },
  {
    key: 'prepladder',
    name: 'PrepLadder',
    tagline: 'Rapid-revision notes plus a strong question bank',
    keyStrength: 'Rapid revision, high-yield notes and structured subject modules — strong pre/para-clinical coverage.',
    bestFor: ['High-yield rapid revision', 'Pre & para-clinical depth', 'Structured subject notes'],
    websiteUrl: 'https://www.prepladder.com',
    logoUrl: null,
    accent: '#6366F1',
    examStrength: { NEET_PG: 0.95, INI_CET: 0.92, FMGE: 0.8, UPSC_CMS: 0.3 },
    subjectStrength: {
      physiology: 0.93, pharmacology: 0.93, pathology: 0.92, biochemistry: 0.9,
      'community medicine': 0.92, anatomy: 0.88, microbiology: 0.88, medicine: 0.9,
      paediatrics: 0.9, surgery: 0.88, 'obstetrics and gynaecology': 0.88, psychiatry: 0.87,
      ent: 0.86, ophthalmology: 0.86, dermatology: 0.86, 'forensic medicine': 0.85,
      orthopaedics: 0.85, radiology: 0.84, anaesthesia: 0.84,
    },
    revisionDepth: 0.88,
    paceFit: { low: 0.88, moderate: 0.9, high: 0.72 },
    branchAffinity: {
      default: 0.78, 'pathology-family': 0.82, 'psm-family': 0.8, 'medicine-family': 0.79,
    },
  },
  {
    key: 'cerebellum',
    name: 'Cerebellum Academy',
    tagline: 'Faculty-led concept teaching (the app onboarding\'s "Cerebrum")',
    keyStrength: 'Faculty-led concept teaching with strong basic-science coverage and approachable explanations.',
    bestFor: ['Concept-first teaching', 'Strong basic sciences', 'Approachable faculty style'],
    websiteUrl: 'https://www.cerebellumacademy.com',
    logoUrl: null,
    accent: '#F59E0B',
    examStrength: { NEET_PG: 0.88, INI_CET: 0.84, FMGE: 0.78, UPSC_CMS: 0.3 },
    subjectStrength: {
      medicine: 0.9, pathology: 0.9, microbiology: 0.9, physiology: 0.88, biochemistry: 0.88,
      pharmacology: 0.88, surgery: 0.86, 'obstetrics and gynaecology': 0.86, paediatrics: 0.86,
      'community medicine': 0.84, 'forensic medicine': 0.84, anatomy: 0.82, ent: 0.82,
      ophthalmology: 0.82, dermatology: 0.82, psychiatry: 0.82, orthopaedics: 0.8,
      radiology: 0.8, anaesthesia: 0.8,
    },
    revisionDepth: 0.8,
    paceFit: { low: 0.82, moderate: 0.88, high: 0.78 },
    branchAffinity: { default: 0.72, 'pathology-family': 0.76, 'medicine-family': 0.74 },
  },
  {
    key: 'dams',
    name: 'DAMS',
    tagline: 'Legacy classroom rigour, now digital',
    keyStrength: 'Experienced faculty with a structured course spine — a classroom-style backbone for full-length prep.',
    bestFor: ['Structured faculty-led courses', 'Clinical subject depth', 'Test series culture'],
    websiteUrl: 'https://www.damsdelhi.com',
    logoUrl: null,
    accent: '#EF4444',
    examStrength: { NEET_PG: 0.9, INI_CET: 0.88, FMGE: 0.78, UPSC_CMS: 0.45 },
    subjectStrength: {
      medicine: 0.92, surgery: 0.9, paediatrics: 0.9, 'obstetrics and gynaecology': 0.9,
      'community medicine': 0.9, pharmacology: 0.9, pathology: 0.88, physiology: 0.86,
      anatomy: 0.85, microbiology: 0.85, 'forensic medicine': 0.86, psychiatry: 0.85,
      ent: 0.84, ophthalmology: 0.84, dermatology: 0.84, orthopaedics: 0.84, radiology: 0.84,
      anaesthesia: 0.84, biochemistry: 0.84,
    },
    revisionDepth: 0.78,
    paceFit: { low: 0.6, moderate: 0.86, high: 0.9 },
    branchAffinity: { default: 0.76, 'medicine-family': 0.8, 'surgery-family': 0.78 },
  },
  {
    key: 'dbmci',
    name: 'DBMCI',
    tagline: 'Senior-faculty video lectures and revision courses',
    keyStrength: 'Senior-faculty video lectures with a long track record in medical entrance revision.',
    bestFor: ['Senior-faculty lectures', 'Revision-focused courses', 'Flexible self-paced study'],
    websiteUrl: 'https://www.dbmci.com',
    logoUrl: null,
    accent: '#8B5CF6',
    examStrength: { NEET_PG: 0.86, INI_CET: 0.82, FMGE: 0.75, UPSC_CMS: 0.4 },
    subjectStrength: {
      medicine: 0.88, surgery: 0.86, 'obstetrics and gynaecology': 0.86, paediatrics: 0.86,
      physiology: 0.86, pathology: 0.86, pharmacology: 0.86, anatomy: 0.84, biochemistry: 0.84,
      microbiology: 0.84, 'community medicine': 0.84, 'forensic medicine': 0.84, psychiatry: 0.84,
      ent: 0.82, ophthalmology: 0.82, dermatology: 0.82, orthopaedics: 0.82, radiology: 0.82,
      anaesthesia: 0.82,
    },
    revisionDepth: 0.74,
    paceFit: { low: 0.84, moderate: 0.86, high: 0.7 },
    branchAffinity: { default: 0.72 },
  },
];

// ── Resolutions ────────────────────────────────────────────────────────────────

function examById(id) {
  return EXAMS.find((exam) => exam.id === id) || null;
}

function sessionById(exam, sessionId) {
  return (exam && exam.sessions.find((session) => session.id === sessionId)) || null;
}

function platformByKey(key) {
  return PLATFORMS.find((platform) => platform.key === key) || null;
}

function resourceById(id) {
  return RESOURCE_OPTIONS.find((option) => option.id === id) || null;
}

const AFFILIATE_ENV_PREFIX = 'PLATFORM_CHOICE_AFFILIATE_URL_';

/**
 * Outbound URL for a platform card: an affiliate/partnership override (env,
 * per platform key) wins, else the plain website. Resolved SERVER-side only —
 * the UI receives a final URL and holds no affiliate logic.
 */
function resolveVisitUrl(platform) {
  const override = (process.env[AFFILIATE_ENV_PREFIX + platform.key.toUpperCase()] || '').trim();
  if (override) return override;
  return platform.websiteUrl || null;
}

module.exports = {
  METHOD_VERSION,
  NEUTRAL_SCORE,
  EXAMS,
  RESOURCE_OPTIONS,
  RESOURCE_ALIASES,
  SUBJECTS,
  SUBJECT_ALIASES,
  BRANCH_FAMILIES,
  DEFAULT_BRANCH_FAMILY,
  WEIGHTS,
  FACTOR_LABELS,
  STUDY_HOURS,
  PACE_DESCRIPTIONS,
  PLATFORMS,
  examById,
  sessionById,
  platformByKey,
  resourceById,
  resolveVisitUrl,
};

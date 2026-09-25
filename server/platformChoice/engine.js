'use strict';

const {
  NEUTRAL_SCORE,
  METHOD_VERSION,
  SUBJECTS,
  SUBJECT_ALIASES,
  BRANCH_FAMILIES,
  DEFAULT_BRANCH_FAMILY,
  WEIGHTS,
  FACTOR_LABELS,
  STUDY_HOURS,
  PACE_DESCRIPTIONS,
  PLATFORMS,
  RESOURCE_ALIASES,
  examById,
  sessionById,
  resourceById,
  platformByKey,
} = require('./config');
const { PlatformChoiceError, CODES } = require('./errors');

/**
 * Platform Choice Recommender engine (Feature 06) — PURE functions only.
 * No Express, no DB, no App API: the route layer assembles a context object
 * (student picks + server-derived signals), the engine scores every platform
 * against the configured weight matrix and emits the three tiered cards with
 * personalised, input-grounded reasons.
 *
 * Missing data policy: every factor without a signal for this student scores
 * NEUTRAL_SCORE (0.5) — the engine never invents strengths or weaknesses. A
 * note is emitted so the UI can say WHY a factor was neutral.
 *
 * Determinism: platforms are ranked by (total score desc, exam strength desc,
 * config order) — identical inputs always produce identical output, which the
 * persist-before-serve resultHash relies on.
 */

// ── Normalization helpers ─────────────────────────────────────────────────────

/** lowercase, collapse whitespace, "&"→"and", drop parentheticals, alias-map. */
function normalizeSubjectKey(name) {
  let key = String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // "Community Medicine (PSM)" → "community medicine"
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!key) return '';
  return SUBJECT_ALIASES[key] || key;
}

/** Canonical picker options with their normalized keys. */
function subjectPickerOptions() {
  const seen = new Set();
  const options = [];
  for (const label of SUBJECTS) {
    const key = normalizeSubjectKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    options.push({ key, label });
  }
  return options;
}

/** Display label for a normalized subject key (null when unknown). */
function subjectLabelForKey(key) {
  const option = subjectPickerOptions().find((o) => o.key === key);
  return option ? option.label : null;
}

/** Desired-branch display string → affinity family. */
function branchFamily(display) {
  const text = String(display || '').toLowerCase();
  if (text) {
    for (const entry of BRANCH_FAMILIES) {
      if (entry.pattern.test(text)) return entry.family;
    }
  }
  return DEFAULT_BRANCH_FAMILY;
}

function studyHoursBand(hoursPerDay) {
  if (hoursPerDay <= STUDY_HOURS.lowMax) return 'low';
  if (hoursPerDay <= STUDY_HOURS.moderateMax) return 'moderate';
  return 'high';
}

/**
 * Derive the student's previous resource from the App /auth/me payload:
 * free-user onboarding picks (freeUserProfile.resources) first, then the paid
 * studentProfile.subscriptions free text. Returns a resource id or null —
 * only ever a PREFILL the student confirms in the form.
 */
function derivePreviousResource(user) {
  const candidates = [];
  const free = user && user.freeUserProfile;
  if (free && Array.isArray(free.resources)) {
    candidates.push(...free.resources.map((r) => String(r || '').toLowerCase().trim()));
  }
  const student = user && user.studentProfile;
  if (student && typeof student.subscriptions === 'string' && student.subscriptions.trim()) {
    candidates.push(student.subscriptions.toLowerCase());
  }
  const needles = [
    ['marrow', 'marrow'],
    ['prepladder', 'prepladder'],
    ['cerebr', 'cerebellum'], // covers both "Cerebrum" and "Cerebellum" spellings
    ['dams', 'dams'],
    ['dbmci', 'dbmci'],
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    if (RESOURCE_ALIASES[raw]) return RESOURCE_ALIASES[raw];
    for (const [needle, id] of needles) {
      if (raw.includes(needle)) return id;
    }
  }
  return null;
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));

// ── Request validation ────────────────────────────────────────────────────────

const ALLOWED_REQUEST_KEYS = new Set([
  'exam',
  'targetSession',
  'studyHoursPerDay',
  'previousResource',
  'likelyToSwitch',
  'weakestSubjects',
]);

/**
 * Validate the recommend request. Returns the normalized input:
 *   { exam, examLabel, targetSession, targetSessionLabel, studyHoursPerDay,
 *     previousResource, previousResourceLabel, likelyToSwitch, weakestSubjects }
 * weakestSubjects is deduped to canonical keys with display labels preserved.
 */
function validateRecommendRequest(body) {
  const request = body && typeof body === 'object' ? body : {};
  for (const key of Object.keys(request)) {
    if (!ALLOWED_REQUEST_KEYS.has(key)) {
      throw new PlatformChoiceError(`Unknown field "${key}".`, { field: key });
    }
  }

  const exam = examById(request.exam);
  if (!exam) {
    throw new PlatformChoiceError('Choose a valid exam.', { field: 'exam' });
  }

  const session = sessionById(exam, request.targetSession);
  if (!session) {
    throw new PlatformChoiceError('Choose a valid target session for this exam.', {
      field: 'targetSession',
    });
  }

  const hours = Number(request.studyHoursPerDay);
  if (!Number.isInteger(hours) || hours < STUDY_HOURS.min || hours > STUDY_HOURS.max) {
    throw new PlatformChoiceError(
      `Study hours must be a whole number between ${STUDY_HOURS.min} and ${STUDY_HOURS.max} per day.`,
      { field: 'studyHoursPerDay' }
    );
  }

  const resource = resourceById(request.previousResource);
  if (!resource) {
    throw new PlatformChoiceError('Choose your previous resource.', { field: 'previousResource' });
  }

  if (request.likelyToSwitch !== 'yes' && request.likelyToSwitch !== 'no') {
    throw new PlatformChoiceError('Say whether you are open to switching platforms.', {
      field: 'likelyToSwitch',
    });
  }

  if (!Array.isArray(request.weakestSubjects)) {
    throw new PlatformChoiceError('Pick up to 3 weakest subjects.', { field: 'weakestSubjects' });
  }
  if (request.weakestSubjects.length < 1 || request.weakestSubjects.length > 3) {
    throw new PlatformChoiceError('Pick between 1 and 3 weakest subjects.', {
      field: 'weakestSubjects',
    });
  }
  const canonicalKeys = subjectPickerOptions().map((o) => o.key);
  const picked = [];
  const seen = new Set();
  for (const raw of request.weakestSubjects) {
    const key = normalizeSubjectKey(raw);
    if (!canonicalKeys.includes(key)) {
      throw new PlatformChoiceError(`"${raw}" is not a known subject.`, {
        field: 'weakestSubjects',
        suggestions: subjectPickerOptions()
          .filter((o) => !seen.has(o.key))
          .slice(0, 5)
          .map((o) => o.label),
      });
    }
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({ key, label: subjectLabelForKey(key) });
  }
  if (picked.length < 1) {
    throw new PlatformChoiceError('Pick at least 1 weakest subject.', { field: 'weakestSubjects' });
  }

  return {
    exam: exam.id,
    examLabel: exam.label,
    targetSession: session.id,
    targetSessionLabel: session.label,
    studyHoursPerDay: hours,
    previousResource: resource.id,
    previousResourceLabel: resource.label,
    likelyToSwitch: request.likelyToSwitch,
    weakestSubjects: picked,
  };
}

// ── Mini CCT signal derivation (pure; consumes the App analysis shape) ───────

/**
 * Derive the recommender's signals from a Mini CCT analysis payload
 * (GET /mini-cct/attempts/:id/analysis shape — subjects[]/tags[]/summary).
 *
 * Returns:
 *  {
 *    attemptId, quizTitle, endedAt,
 *    subjectRanking: [{subjectName, accuracy}]  accuracy asc, attempted ≥ 1,
 *    weakestSubjects: [key]                      up to 3 lowest-accuracy keys,
 *    weakTags: {count, labels: []} | null        null when tags are unavailable
 *                                              (free-user gating or absent)
 *    weakTagSignal: number | null               min(1, count/3)
 *  }
 */
function deriveMiniCctSignals(analysis) {
  if (!analysis || !Array.isArray(analysis.subjects)) return null;

  const rows = analysis.subjects
    .filter((row) => Number(row.attempted) >= 1)
    .map((row) => ({
      subjectName: String(row.subjectName || ''),
      key: normalizeSubjectKey(row.subjectName),
      accuracy: Number.isFinite(Number(row.accuracy)) ? Number(row.accuracy) : null,
    }))
    .filter((row) => row.key);

  const byAccuracy = [...rows].sort((a, b) => {
    const av = a.accuracy === null ? Number.POSITIVE_INFINITY : a.accuracy;
    const bv = b.accuracy === null ? Number.POSITIVE_INFINITY : b.accuracy;
    if (av !== bv) return av - bv;
    return a.subjectName.localeCompare(b.subjectName);
  });

  const weakestSubjects = byAccuracy.slice(0, 3).map((row) => row.key);

  // tags: undefined for free users (applyAnalysisAccess strips them server-side
  // upstream) — distinguishable from "has tags but none weak" (empty array).
  let weakTags = null;
  if (Array.isArray(analysis.tags)) {
    const weak = analysis.tags
      .filter((tag) => tag && tag.status === 'weak' && Number(tag.attempted) >= 1)
      .sort((a, b) => (b.questionCount || 0) - (a.questionCount || 0));
    weakTags = { count: weak.length, labels: weak.slice(0, 6).map((t) => String(t.label || '')) };
  }

  return {
    attemptId: analysis.attempt ? analysis.attempt._id : null,
    quizTitle: analysis.quiz ? analysis.quiz.title : null,
    endedAt: analysis.attempt ? analysis.attempt.endTime || null : null,
    subjectRanking: byAccuracy.map(({ subjectName, accuracy }) => ({ subjectName, accuracy })),
    weakestSubjects,
    weakTags,
    weakTagSignal: weakTags ? clamp01(weakTags.count / 3) : null,
  };
}

// ── Scoring ────────────────────────────────────────────────────────────────────

/**
 * Factor scores (each clamped to 0..1) for one platform against the context.
 *
 * Context (assembled by the route layer):
 *  {
 *    input:           validateRecommendRequest output (student picks)
 *    miniCct:         deriveMiniCctSignals output | null
 *    desiredBranch:   display string | null
 *  }
 */
function factorScores(platform, context) {
  const { input, miniCct, desiredBranch } = context;

  // 1. Exam compatibility — the platform's configured strength for the exam.
  const examCompatibility = clamp01(
    (platform.examStrength && platform.examStrength[input.exam]) ?? 0.05
  );

  // 2. Weak subjects — mean configured strength over the student's picks.
  const subjectEntries = input.weakestSubjects.map(
    (subject) =>
      (platform.subjectStrength && platform.subjectStrength[subject.key]) ?? NEUTRAL_SCORE
  );
  const weakSubjects = subjectEntries.reduce((sum, v) => sum + v, 0) / subjectEntries.length;

  // 3. Concept revision — Mini CCT weak-tag signal pulled toward the platform's
  //    revision depth. No signal (null) → neutral.
  const revisionDepth = clamp01(platform.revisionDepth ?? NEUTRAL_SCORE);
  const signal = miniCct ? miniCct.weakTagSignal : null;
  const conceptRevision = signal === null
    ? NEUTRAL_SCORE
    : NEUTRAL_SCORE + signal * (revisionDepth - NEUTRAL_SCORE);

  // 4. Desired branch — configured affinity of the branch's family.
  const family = desiredBranch ? branchFamily(desiredBranch) : null;
  const desiredBranchScore = family
    ? clamp01(
        (platform.branchAffinity && (platform.branchAffinity[family] ?? platform.branchAffinity.default))
        ?? NEUTRAL_SCORE
      )
    : NEUTRAL_SCORE;

  // 5. Study hours — pace fit for the student's band.
  const band = studyHoursBand(input.studyHoursPerDay);
  const studyHours = clamp01((platform.paceFit && platform.paceFit[band]) ?? NEUTRAL_SCORE);

  // 6. Switching — previous resource × willingness:
  //    - staying (switch=no): the current platform is honoured, others demoted;
  //    - leaving (switch=yes): the current platform is demoted, others boosted;
  //    - no previous resource: no signal → neutral.
  let switching = NEUTRAL_SCORE;
  if (input.previousResource !== 'none' && input.previousResource !== 'other') {
    const isCurrent = platform.key === input.previousResource;
    if (input.likelyToSwitch === 'no') {
      switching = isCurrent ? 1 : 0.35;
    } else {
      switching = isCurrent ? 0.15 : 0.75;
    }
  }

  return {
    examCompatibility,
    weakSubjects,
    conceptRevision,
    desiredBranch: desiredBranchScore,
    studyHours,
    switching,
  };
}

function weightTotal() {
  return Object.values(WEIGHTS).reduce((sum, w) => sum + w, 0);
}

function scorePlatform(platform, context) {
  const scores = factorScores(platform, context);
  const totalWeight = weightTotal();
  const factors = Object.entries(WEIGHTS).map(([key, weight]) => ({
    key,
    label: FACTOR_LABELS[key],
    score: scores[key],
    weight,
    contribution: (scores[key] * weight) / totalWeight,
  }));
  const total = factors.reduce((sum, f) => sum + f.contribution, 0);
  return { platform, total, factors, scores };
}

// ── Personalised reasons ──────────────────────────────────────────────────────

function listForSentence(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Candidate reason sentences for one scored platform. Only factors with real
 * signal AND a high score contribute — the reasons stay grounded in the
 * student's actual inputs. Each entry carries its factor key so the
 * "Also Consider" card can lean on its single most distinctive factor.
 */
function reasonSentences(scored, context) {
  const { platform, scores, factors } = scored;
  const { input, miniCct, desiredBranch } = context;
  const sentences = [];
  const push = (factorKey, text) => {
    const factor = factors.find((f) => f.key === factorKey);
    sentences.push({ factorKey, contribution: factor ? factor.contribution : 0, text });
  };

  if (scores.examCompatibility >= 0.85) {
    push('examCompatibility', `${platform.name}'s preparation track is strongly aligned with ${input.examLabel}.`);
  }

  if (scores.weakSubjects >= 0.8) {
    const strongIn = input.weakestSubjects
      .filter((s) => ((platform.subjectStrength || {})[s.key] ?? NEUTRAL_SCORE) >= 0.86)
      .map((s) => s.label);
    const source = miniCct
      ? 'your lowest-accuracy subjects on the latest Mini CCT'
      : 'the subjects you marked weakest';
    push(
      'weakSubjects',
      strongIn.length
        ? `Strong coverage of ${listForSentence(strongIn)} — ${source}.`
        : `Broad, well-regarded coverage of ${source}.`
    );
  }

  if (miniCct && miniCct.weakTags && miniCct.weakTags.count > 0 && scores.conceptRevision >= 0.6) {
    const labels = miniCct.weakTags.labels.filter(Boolean).slice(0, 3);
    push(
      'conceptRevision',
      labels.length
        ? `Concept-tagged practice targets your weak areas (${listForSentence(labels.map((l) => l.toLowerCase()))}).`
        : 'Concept-tagged practice targets the weak areas in your Mini CCT breakdown.'
    );
  }

  if (desiredBranch && scores.desiredBranch >= 0.75) {
    push('desiredBranch', `A good fit for students targeting ${desiredBranch}.`);
  }

  if (scores.studyHours >= 0.75) {
    const band = studyHoursBand(input.studyHoursPerDay);
    push('studyHours', `Its ${PACE_DESCRIPTIONS[band]} fits a ~${input.studyHoursPerDay} h/day study plan.`);
  }

  if (input.previousResource !== 'none' && input.previousResource !== 'other') {
    const isCurrent = platform.key === input.previousResource;
    if (input.likelyToSwitch === 'no' && isCurrent) {
      push('switching', `You already study with ${platform.name} — staying on it keeps your momentum.`);
    } else if (input.likelyToSwitch === 'no' && !isCurrent) {
      push('switching', 'Works well as a complement to what you already use.');
    } else if (input.likelyToSwitch === 'yes' && !isCurrent) {
      const current = platformByKey(input.previousResource);
      push(
        'switching',
        current
          ? `A genuinely different study approach from ${current.name}.`
          : 'A genuinely different study approach from your current resource.'
      );
    }
  }

  return sentences;
}

const TIERS = [
  { tier: 'highly_recommended', label: 'Highly Recommended' },
  { tier: 'good_alternative', label: 'Good Alternative' },
  { tier: 'also_consider', label: 'Also Consider' },
];

function platformCard(platform, matchScore) {
  return {
    key: platform.key,
    name: platform.name,
    tagline: platform.tagline,
    keyStrength: platform.keyStrength,
    bestFor: [...platform.bestFor],
    logoUrl: platform.logoUrl,
    accent: platform.accent,
  };
}

/**
 * Rank every configured platform and build the tiered recommendation.
 * Returns the full result object that is persisted + served.
 */
function buildRecommendation({ input, miniCct, desiredBranch }) {
  if (PLATFORMS.length === 0) {
    throw new PlatformChoiceError(
      'Platform recommendations are not available right now. Please try again later.',
      { code: CODES.NO_PLATFORMS_CONFIGURED }
    );
  }

  const context = { input, miniCct, desiredBranch };
  const ranked = PLATFORMS.map((platform) => scorePlatform(platform, context)).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const examA = (a.platform.examStrength || {})[input.exam] ?? 0;
    const examB = (b.platform.examStrength || {})[input.exam] ?? 0;
    if (examB !== examA) return examB - examA;
    return PLATFORMS.indexOf(a.platform) - PLATFORMS.indexOf(b.platform);
  });

  // Distinctive factors: a factor score minus the all-platform mean of that
  // factor — what THIS platform is unusually good at for this student.
  const meanByFactor = {};
  for (const key of Object.keys(WEIGHTS)) {
    meanByFactor[key] = ranked.reduce((sum, r) => sum + r.scores[key], 0) / ranked.length;
  }

  const chosen = ranked.slice(0, TIERS.length);
  const tiers = chosen.map((scored, index) => {
    const tier = TIERS[index];
    const sentences = reasonSentences(scored, context).sort(
      (a, b) => b.contribution - a.contribution
    );

    let reason;
    let highlightKey;
    if (index === 0) {
      // ⭐ strongest match — a 2-line personalised reason: lead with the
      // strongest PERSONAL sentence (own data beats generic exam alignment),
      // then the student's desired-branch goal when this platform fits it.
      const personal = sentences.filter((s) => s.factorKey !== 'examCompatibility');
      const branchSentence = sentences.find((s) => s.factorKey === 'desiredBranch');
      const picks = [];
      if (personal.length > 0) picks.push(personal[0]);
      if (branchSentence && (!picks[0] || picks[0].factorKey !== 'desiredBranch')) {
        picks.push(branchSentence);
      } else if (personal.length > 1) {
        picks.push(personal[1]);
      } else if (picks.length === 0 && sentences.length > 0) {
        picks.push(sentences[0]); // generic exam sentence as last resort
      }
      reason = picks.length ? picks.map((s) => s.text).join(' ') : scored.platform.keyStrength;
      highlightKey = picks.length ? picks[0].factorKey : 'examCompatibility';
    } else if (index === 1) {
      reason = sentences.length ? sentences[0].text : scored.platform.keyStrength;
      highlightKey = sentences.length ? sentences[0].factorKey : 'examCompatibility';
    } else {
      // Also Consider — "potentially strong for a specific weakness": lean on
      // the ONE factor this platform is unusually strong on relative to the
      // field; when nothing is distinctive, prefer the most weakness-specific
      // sentence available (exam fit is table stakes, never the story here).
      const distinctive = Object.keys(WEIGHTS)
        .map((key) => ({ key, edge: scored.scores[key] - meanByFactor[key] }))
        .sort((a, b) => b.edge - a.edge)
        .find(({ key, edge }) => edge >= 0.02 && sentences.some((s) => s.factorKey === key));
      const weaknessPriority = [
        'weakSubjects', 'conceptRevision', 'desiredBranch', 'studyHours', 'switching', 'examCompatibility',
      ];
      const chosenSentence =
        (distinctive && sentences.find((s) => s.factorKey === distinctive.key)) ||
        weaknessPriority.map((key) => sentences.find((s) => s.factorKey === key)).find(Boolean) ||
        null;
      reason = chosenSentence ? chosenSentence.text : scored.platform.keyStrength;
      highlightKey = chosenSentence
        ? chosenSentence.factorKey
        : distinctive ? distinctive.key : 'weakSubjects';
    }

    return {
      tier: tier.tier,
      tierLabel: tier.label,
      platform: platformCard(scored.platform),
      matchScore: Math.round(scored.total * 100),
      reason,
      highlight: { label: FACTOR_LABELS[highlightKey] || FACTOR_LABELS.examCompatibility },
      factors: scored.factors,
    };
  });

  // ── notes: why factors went neutral (never fake precision) ────────────────
  const notes = [];
  const exam = examById(input.exam);
  if (exam && exam.note) notes.push(exam.note);
  if (!miniCct) {
    notes.push(
      'No Mini CCT result was available, so concept-level matching used a neutral baseline — take a Mini CCT to sharpen the match.'
    );
  } else if (!miniCct.weakTags) {
    notes.push(
      'Concept-level matching used a neutral baseline — concept breakdowns are part of the full Mini CCT analysis.'
    );
  }
  if (!desiredBranch) {
    notes.push(
      'No desired branch on record — branch fit used a neutral baseline. Set one in the Desired Branch planner to sharpen the match.'
    );
  }

  return {
    method: { version: METHOD_VERSION, weights: { ...WEIGHTS } },
    exam: input.exam,
    examLabel: input.examLabel,
    targetSession: input.targetSession,
    targetSessionLabel: input.targetSessionLabel,
    tiers,
    notes,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  normalizeSubjectKey,
  subjectPickerOptions,
  subjectLabelForKey,
  branchFamily,
  studyHoursBand,
  derivePreviousResource,
  validateRecommendRequest,
  deriveMiniCctSignals,
  factorScores,
  buildRecommendation,
};

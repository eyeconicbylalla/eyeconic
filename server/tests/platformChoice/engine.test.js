/**
 * Platform Choice Recommender (Feature 06) — engine unit tests.
 *
 * The engine is pure: every scoring, ordering, degradation and reason rule is
 * pinned here against the config without any HTTP, DB or App API.
 */

const config = require('../../platformChoice/config');
const engine = require('../../platformChoice/engine');

const BASE_REQUEST = {
  exam: 'NEET_PG',
  targetSession: 'NEET_PG_2027',
  studyHoursPerDay: 6,
  previousResource: 'none',
  likelyToSwitch: 'yes',
  weakestSubjects: ['Psychiatry', 'Dermatology', 'Orthopaedics'],
};

const BASE_MINI_CCT = {
  attempt: { _id: 'att1', endTime: '2026-09-20T10:00:00.000Z' },
  quiz: { title: 'Mini CCT #2' },
  subjects: [
    { subjectName: 'Psychiatry', attempted: 10, accuracy: 40 },
    { subjectName: 'Dermatology', attempted: 10, accuracy: 55 },
    { subjectName: 'Orthopaedics', attempted: 10, accuracy: 72 },
  ],
  tags: [
    { label: 'Schizophrenia', status: 'weak', attempted: 3, questionCount: 3 },
    { label: 'Psoriasis', status: 'weak', attempted: 2, questionCount: 2 },
    { label: 'Fractures', status: 'strong', attempted: 3, questionCount: 3 },
  ],
};

function miniCctWith(overrides = {}) {
  return engine.deriveMiniCctSignals({ ...BASE_MINI_CCT, ...overrides });
}

function recommendWith({ request = {}, miniCct = miniCctWith(), desiredBranch = null } = {}) {
  const input = engine.validateRecommendRequest({ ...BASE_REQUEST, ...request });
  return engine.buildRecommendation({ input, miniCct, desiredBranch });
}

// ── Config sanity — the matrix must stay machine-consistent ──────────────────

describe('platform choice config sanity', () => {
  it('weights sum to 100 and are positive', () => {
    const total = Object.values(config.WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBe(100);
    for (const weight of Object.values(config.WEIGHTS)) expect(weight).toBeGreaterThan(0);
  });

  it('has at least 3 platforms with unique keys and complete scoring fields', () => {
    expect(config.PLATFORMS.length).toBeGreaterThanOrEqual(3);
    const keys = new Set();
    for (const platform of config.PLATFORMS) {
      expect(keys.has(platform.key)).toBe(false);
      keys.add(platform.key);
      expect(platform.name).toBeTruthy();
      expect(platform.keyStrength).toBeTruthy();
      expect(Array.isArray(platform.bestFor)).toBe(true);
      expect(typeof platform.revisionDepth).toBe('number');
      for (const band of ['low', 'moderate', 'high']) {
        expect(typeof platform.paceFit[band]).toBe('number');
      }
      expect(typeof platform.branchAffinity.default).toBe('number');
    }
  });

  it('every platform scores every exam and only canonical subjects', () => {
    const examIds = new Set(config.EXAMS.map((e) => e.id));
    const canonical = new Set(engine.subjectPickerOptions().map((o) => o.key));
    for (const platform of config.PLATFORMS) {
      for (const id of examIds) {
        expect(platform.examStrength[id]).toBeDefined();
      }
      for (const key of Object.keys(platform.subjectStrength)) {
        // A typo here would silently score NEUTRAL in production — fail loud.
        expect(canonical.has(key)).toBe(true);
      }
    }
  });

  it('sessions belong to their exam and defaults resolve', () => {
    for (const exam of config.EXAMS) {
      expect(exam.sessions.length).toBeGreaterThan(0);
      expect(config.sessionById(exam, exam.defaultSession)).not.toBeNull();
    }
  });

  it('subject aliases resolve into canonical keys (no dead aliases)', () => {
    const canonical = new Set(engine.subjectPickerOptions().map((o) => o.key));
    for (const key of Object.values(config.SUBJECT_ALIASES)) {
      expect(canonical.has(key)).toBe(true);
    }
  });

  it('resource options are unique and their ids map to platforms or none/other', () => {
    const ids = config.RESOURCE_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    const platformKeys = new Set(config.PLATFORMS.map((p) => p.key));
    for (const id of ids) {
      if (id !== 'none' && id !== 'other') expect(platformKeys.has(id)).toBe(true);
    }
  });
});

// ── Normalization ───────────────────────────────────────────────────────────────

describe('normalizeSubjectKey', () => {
  it('collapses case, ampersands and parentheticals', () => {
    expect(engine.normalizeSubjectKey('Community Medicine (PSM)')).toBe('community medicine');
    expect(engine.normalizeSubjectKey('Obstetrics & Gynaecology')).toBe('obstetrics and gynaecology');
    expect(engine.normalizeSubjectKey('  psychiatry ')).toBe('psychiatry');
  });

  it('applies alias spellings', () => {
    expect(engine.normalizeSubjectKey('PSM')).toBe('community medicine');
    expect(engine.normalizeSubjectKey('ENT')).toBe('ent');
    expect(engine.normalizeSubjectKey('Anesthesia')).toBe('anaesthesia');
    expect(engine.normalizeSubjectKey('Orthopedics')).toBe('orthopaedics');
  });
});

describe('branchFamily', () => {
  it('maps displays to families with the documented fallback', () => {
    expect(engine.branchFamily('Radiodiagnosis')).toBe('radiology');
    expect(engine.branchFamily('General Medicine')).toBe('medicine-family');
    expect(engine.branchFamily('MS General Surgery')).toBe('surgery-family');
    expect(engine.branchFamily('Something Exotic')).toBe('other');
    expect(engine.branchFamily(null)).toBe('other');
  });
});

// ── Request validation ─────────────────────────────────────────────────────────

describe('validateRecommendRequest', () => {
  it('accepts and normalizes a full request', () => {
    const input = engine.validateRecommendRequest(BASE_REQUEST);
    expect(input.exam).toBe('NEET_PG');
    expect(input.targetSessionLabel).toBe('NEET PG 2027');
    expect(input.weakestSubjects.map((s) => s.key)).toEqual([
      'psychiatry', 'dermatology', 'orthopaedics',
    ]);
  });

  it('rejects unknown top-level fields', () => {
    expect(() => engine.validateRecommendRequest({ ...BASE_REQUEST, extra: 1 })).toThrow();
    try {
      engine.validateRecommendRequest({ ...BASE_REQUEST, extra: 1 });
    } catch (error) {
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.field).toBe('extra');
    }
  });

  it('rejects unknown exams and sessions from other exams', () => {
    let error;
    try { engine.validateRecommendRequest({ ...BASE_REQUEST, exam: 'AIIMS' }); } catch (e) { error = e; }
    expect(error.field).toBe('exam');
    try {
      engine.validateRecommendRequest({ ...BASE_REQUEST, targetSession: 'INI_CET_MAY_2027' });
    } catch (e) { error = e; }
    expect(error.field).toBe('targetSession');
  });

  it('bounds study hours to whole numbers within the configured range', () => {
    for (const bad of [0, 19, 2.5, 'six', null]) {
      let error;
      try {
        engine.validateRecommendRequest({ ...BASE_REQUEST, studyHoursPerDay: bad });
      } catch (e) { error = e; }
      expect(error && error.field).toBe('studyHoursPerDay');
    }
    expect(engine.validateRecommendRequest({ ...BASE_REQUEST, studyHoursPerDay: 18 })).toBeTruthy();
  });

  it('rejects unknown resources and switch values', () => {
    let error;
    try { engine.validateRecommendRequest({ ...BASE_REQUEST, previousResource: 'random-app' }); } catch (e) { error = e; }
    expect(error.field).toBe('previousResource');
    try { engine.validateRecommendRequest({ ...BASE_REQUEST, likelyToSwitch: 'maybe' }); } catch (e) { error = e; }
    expect(error.field).toBe('likelyToSwitch');
  });

  it('enforces 1–3 known subjects and dedupes spelling variants', () => {
    let error;
    try { engine.validateRecommendRequest({ ...BASE_REQUEST, weakestSubjects: [] }); } catch (e) { error = e; }
    expect(error.field).toBe('weakestSubjects');
    try {
      engine.validateRecommendRequest({ ...BASE_REQUEST, weakestSubjects: ['A', 'B', 'C', 'D'] });
    } catch (e) { error = e; }
    expect(error.field).toBe('weakestSubjects');
    try {
      engine.validateRecommendRequest({ ...BASE_REQUEST, weakestSubjects: ['Astrology'] });
    } catch (e) { error = e; }
    expect(error.field).toBe('weakestSubjects');
    expect(error.suggestions.length).toBeGreaterThan(0);

    const input = engine.validateRecommendRequest({
      ...BASE_REQUEST,
      weakestSubjects: ['Psychiatry', 'psychiatry ', 'PSM'],
    });
    expect(input.weakestSubjects.map((s) => s.key)).toEqual(['psychiatry', 'community medicine']);
  });
});

// ── Mini CCT signal derivation ─────────────────────────────────────────────────

describe('deriveMiniCctSignals', () => {
  it('ranks subjects by accuracy ascending and picks the weakest 3 keys', () => {
    const signals = miniCctWith();
    expect(signals.subjectRanking.map((s) => s.subjectName)).toEqual([
      'Psychiatry', 'Dermatology', 'Orthopaedics',
    ]);
    expect(signals.weakestSubjects).toEqual(['psychiatry', 'dermatology', 'orthopaedics']);
  });

  it('keeps unattempted subjects out of the ranking', () => {
    const signals = miniCctWith({
      subjects: [
        { subjectName: 'Psychiatry', attempted: 0, accuracy: null },
        { subjectName: 'Dermatology', attempted: 10, accuracy: 50 },
      ],
    });
    expect(signals.subjectRanking.map((s) => s.subjectName)).toEqual(['Dermatology']);
  });

  it('distinguishes gated/absent tags (null) from a present-but-strong set', () => {
    const gated = miniCctWith({ tags: undefined });
    expect(gated.weakTags).toBeNull();
    expect(gated.weakTagSignal).toBeNull();

    const strong = miniCctWith({ tags: [{ label: 'Fractures', status: 'strong', attempted: 3 }] });
    expect(strong.weakTags).toEqual({ count: 0, labels: [] });
    expect(strong.weakTagSignal).toBe(0);
  });

  it('caps the weak-tag signal at 1 and collects up to 6 labels', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      label: `Weak ${i}`, status: 'weak', attempted: 2, questionCount: 2,
    }));
    const signals = miniCctWith({ tags: many });
    expect(signals.weakTags.count).toBe(8);
    expect(signals.weakTags.labels.length).toBe(6);
    expect(signals.weakTagSignal).toBe(1);
  });

  it('returns null for a missing analysis', () => {
    expect(engine.deriveMiniCctSignals(null)).toBeNull();
    expect(engine.deriveMiniCctSignals({})).toBeNull();
  });
});

// ── Previous resource derivation (App /auth/me shape) ─────────────────────────

describe('derivePreviousResource', () => {
  it('maps onboarding picks including the Cerebrum spelling', () => {
    expect(engine.derivePreviousResource({ freeUserProfile: { resources: ['Marrow'] } })).toBe('marrow');
    expect(engine.derivePreviousResource({ freeUserProfile: { resources: ['Cerebrum'] } })).toBe('cerebellum');
    expect(engine.derivePreviousResource({ freeUserProfile: { resources: ['others'] } })).toBe('other');
  });

  it('falls back to paid-profile subscriptions free text', () => {
    expect(
      engine.derivePreviousResource({ studentProfile: { subscriptions: 'PrepLadder + DAMS tests' } })
    ).toBe('prepladder');
  });

  it('returns null when nothing matches', () => {
    expect(engine.derivePreviousResource({})).toBeNull();
    expect(engine.derivePreviousResource(null)).toBeNull();
    expect(engine.derivePreviousResource({ freeUserProfile: { resources: [] } })).toBeNull();
  });
});

// ── Factor scoring ─────────────────────────────────────────────────────────────

describe('factorScores', () => {
  const contextFor = (request, miniCct = null, desiredBranch = null) => ({
    input: engine.validateRecommendRequest({ ...BASE_REQUEST, ...request }),
    miniCct,
    desiredBranch,
  });
  const marrow = config.platformByKey('marrow');

  it('switching honours staying on the current platform', () => {
    const stay = engine.factorScores(
      marrow, contextFor({ previousResource: 'marrow', likelyToSwitch: 'no' })
    );
    expect(stay.switching).toBe(1);
    const leave = engine.factorScores(
      marrow, contextFor({ previousResource: 'marrow', likelyToSwitch: 'yes' })
    );
    expect(leave.switching).toBe(0.15);
  });

  it('switching boosts alternatives when leaving, demotes when staying', () => {
    const alternative = config.platformByKey('prepladder');
    const leaving = engine.factorScores(
      alternative, contextFor({ previousResource: 'marrow', likelyToSwitch: 'yes' })
    );
    expect(leaving.switching).toBe(0.75);
    const staying = engine.factorScores(
      alternative, contextFor({ previousResource: 'marrow', likelyToSwitch: 'no' })
    );
    expect(staying.switching).toBe(0.35);
  });

  it('no previous resource → switching is neutral', () => {
    const scores = engine.factorScores(marrow, contextFor({ previousResource: 'none' }));
    expect(scores.switching).toBe(config.NEUTRAL_SCORE);
  });

  it('exam compatibility follows the configured exam strength', () => {
    const cms = engine.factorScores(marrow, contextFor({ exam: 'UPSC_CMS', targetSession: 'UPSC_CMS_2027' }));
    expect(cms.examCompatibility).toBeCloseTo(marrow.examStrength.UPSC_CMS, 10);
  });

  it('study hours resolve through the right pace band', () => {
    expect(engine.studyHoursBand(2)).toBe('low');
    expect(engine.studyHoursBand(6)).toBe('moderate');
    expect(engine.studyHoursBand(14)).toBe('high');
    const low = engine.factorScores(config.platformByKey('prepladder'), contextFor({ studyHoursPerDay: 2 }));
    expect(low.studyHours).toBeCloseTo(config.platformByKey('prepladder').paceFit.low, 10);
  });

  it('concept revision is neutral without a signal and depth-driven with one', () => {
    const without = engine.factorScores(marrow, contextFor(BASE_REQUEST, null));
    expect(without.conceptRevision).toBe(config.NEUTRAL_SCORE);
    const withSignal = engine.factorScores(marrow, contextFor(BASE_REQUEST, miniCctWith()));
    expect(withSignal.conceptRevision).toBeCloseTo(
      config.NEUTRAL_SCORE + (2 / 3) * (marrow.revisionDepth - config.NEUTRAL_SCORE), 5
    );
  });

  it('unmodelled subjects score neutral, never punish', () => {
    const scores = engine.factorScores(marrow, contextFor({ weakestSubjects: ['Medicine', 'Surgery'] }));
    const expected =
      (marrow.subjectStrength.medicine + marrow.subjectStrength.surgery) / 2;
    expect(scores.weakSubjects).toBeCloseTo(expected, 10);
  });
});

// ── Recommendation build: ordering, tiers, reasons, degradation ────────────────

describe('buildRecommendation', () => {
  it('returns exactly three descending tiers with labels and valid match scores', () => {
    const result = recommendWith({});
    expect(result.tiers.map((t) => t.tier)).toEqual([
      'highly_recommended', 'good_alternative', 'also_consider',
    ]);
    for (let i = 1; i < result.tiers.length; i += 1) {
      expect(result.tiers[i - 1].matchScore).toBeGreaterThanOrEqual(result.tiers[i].matchScore);
    }
    for (const tier of result.tiers) {
      expect(tier.matchScore).toBeGreaterThanOrEqual(0);
      expect(tier.matchScore).toBeLessThanOrEqual(100);
      expect(tier.reason).toBeTruthy();
      expect(tier.platform.keyStrength).toBeTruthy();
      expect(tier.factors.length).toBe(Object.keys(config.WEIGHTS).length);
    }
  });

  it('is deterministic for identical inputs', () => {
    const a = recommendWith({});
    const b = recommendWith({});
    // generatedAt is the only allowed difference
    expect({ ...a, generatedAt: null }).toEqual({ ...b, generatedAt: null });
  });

  it('staying (switch=no) puts the current platform first; leaving (switch=yes) demotes it', () => {
    const staying = recommendWith({ request: { previousResource: 'marrow', likelyToSwitch: 'no' } });
    expect(staying.tiers[0].platform.key).toBe('marrow');
    expect(staying.tiers[0].reason).toContain('already study with Marrow');

    const leaving = recommendWith({ request: { previousResource: 'marrow', likelyToSwitch: 'yes' } });
    expect(leaving.tiers[0].platform.key).not.toBe('marrow');
  });

  it('weakest subjects move subject-strong platforms up the order', () => {
    // PrepLadder is configured strongest on the pre/para-clinical trio — it
    // tops the ranking there; the clinical trio flips the top spot to Marrow.
    const preClinical = recommendWith({
      request: { weakestSubjects: ['Physiology', 'Biochemistry', 'Anatomy'] },
    });
    expect(preClinical.tiers[0].platform.key).toBe('prepladder');
    const clinical = recommendWith({
      request: { weakestSubjects: ['Medicine', 'Paediatrics', 'Surgery'] },
    });
    expect(clinical.tiers[0].platform.key).toBe('marrow');
  });

  it('reasons quote the student’s actual inputs', () => {
    const result = recommendWith({});
    expect(result.tiers[0].reason.length).toBeGreaterThan(20);
    const branch = recommendWith({ desiredBranch: 'MD Radiodiagnosis' });
    const joined = branch.tiers.map((t) => t.reason).join(' ');
    expect(joined).toContain('Radiodiagnosis');
  });

  it('low study hours favour rapid-revision pace fits', () => {
    const rushed = recommendWith({ request: { studyHoursPerDay: 2 } });
    const rankOf = (result, key) => result.tiers.findIndex((t) => t.platform.key === key);
    // PrepLadder's low-hours pace fit (0.88) vs Marrow's (0.55) should close
    // the gap versus the same profile on a high-hours plan.
    const rushedGap = rankOf(rushed, 'prepladder') - rankOf(rushed, 'marrow');
    const relaxed = recommendWith({ request: { studyHoursPerDay: 14 } });
    const relaxedGap = rankOf(relaxed, 'prepladder') - rankOf(relaxed, 'marrow');
    expect(rushedGap).toBeLessThanOrEqual(relaxedGap);
  });

  it('missing signals degrade to neutral baselines with notes, never silence', () => {
    const result = recommendWith({ miniCct: null, desiredBranch: null });
    expect(result.notes.some((n) => n.includes('Mini CCT'))).toBe(true);
    expect(result.notes.some((n) => n.includes('desired branch'))).toBe(true);

    const gated = recommendWith({ miniCct: miniCctWith({ tags: undefined }) });
    expect(gated.notes.some((n) => n.includes('neutral baseline') && n.includes('concept'))).toBe(true);
  });

  it('exam-specific notes surface for FMGE and UPSC CMS', () => {
    const fmge = recommendWith({ request: { exam: 'FMGE', targetSession: 'FMGE_DEC_2026' } });
    expect(fmge.notes.some((n) => n.includes('pass/fail'))).toBe(true);
    const cms = recommendWith({ request: { exam: 'UPSC_CMS', targetSession: 'UPSC_CMS_2027' } });
    expect(cms.notes.some((n) => n.includes('CMS'))).toBe(true);
  });

  it('every tier carries a resolved highlight label and the method echo', () => {
    const result = recommendWith({});
    expect(result.method.version).toBe(config.METHOD_VERSION);
    expect(result.method.weights).toEqual(config.WEIGHTS);
    for (const tier of result.tiers) {
      expect(Object.values(config.FACTOR_LABELS)).toContain(tier.highlight.label);
    }
  });
});
